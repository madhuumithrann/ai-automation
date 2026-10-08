import { validatePlan } from "../lib/validate.js";

const SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    description: { type: "STRING" },
    event_analysis: {
      type: "OBJECT",
      properties: {
        event_type: { type: "STRING" },
        audience: { type: "STRING" },
        purpose: { type: "STRING" },
        activities: { type: "ARRAY", items: { type: "STRING" } },
        technical_details: { type: "ARRAY", items: { type: "STRING" } },
        expected_outcomes: { type: "ARRAY", items: { type: "STRING" } },
      },
      required: ["event_type", "audience", "purpose", "activities", "technical_details", "expected_outcomes"],
    },
    feedback_strategy: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { dimension: { type: "STRING" }, reason: { type: "STRING" } },
        required: ["dimension", "reason"],
      },
    },
    questions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          question: { type: "STRING" },
          type: { type: "STRING", enum: ["rating", "single_choice", "multiple_choice", "short_text", "long_text"] },
          options: { type: "ARRAY", items: { type: "STRING" } },
          required: { type: "BOOLEAN" },
          dimension: { type: "STRING" },
          reason: { type: "STRING" },
        },
        required: ["question", "type", "required", "dimension", "reason"],
      },
    },
  },
  required: ["title", "description", "event_analysis", "feedback_strategy", "questions"],
};

const PROMPT = `You are an expert event-evaluation designer. An organizer describes an event; you design the feedback form they should send attendees.

Work in three stages:
1. EVENT ANALYSIS — extract event_type, audience, purpose, the concrete activities, technical_details (specific tools/topics/technologies/formats; empty array if none), and expected_outcomes. Use ONLY facts stated or clearly implied. Never invent speakers, dates, venues or activities.
2. FEEDBACK STRATEGY — choose 4-6 feedback dimensions that would give THIS organizer actionable insight, each with a one-sentence reason tied to the event's purpose/activities/technical details.
3. QUESTIONS — write 9-11 questions, each mapped to one strategy dimension (use the exact dimension name).

Question rules:
- Reference the event's actual activities and technical topics by name (e.g. "How clear was the explanation of tool calling?" not "How clear was the content?").
- Concise, neutral, not leading, never double-barreled, no duplicates.
- Types: "rating" (1-5 scale, no options), "single_choice" (3-5 options), "multiple_choice" (select all that apply, 3-7 options — great for "which activities/topics were most useful"), "short_text", "long_text".
- Mix: mostly rating, at least one single_choice or multiple_choice, exactly one open long_text improvement question, one overall/recommendation question.
- Open-text questions should usually be required=false.
- title: "<Event name> — Feedback". description: 1-2 friendly sentences for attendees.
- reason: one short phrase on what the organizer learns from the answer.`;

const AUTH_MODES = ["header", "query", "bearer"];
let goodAuth = null; // remember which auth style works for this key

async function geminiFetch(model, key, payload, signal) {
  const base = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  let last;
  for (const mode of goodAuth ? [goodAuth] : AUTH_MODES) {
    const headers = { "Content-Type": "application/json" };
    let url = base;
    if (mode === "header") headers["x-goog-api-key"] = key;
    if (mode === "query") url += `?key=${encodeURIComponent(key)}`;
    if (mode === "bearer") headers["Authorization"] = `Bearer ${key}`;
    const r = await fetch(url, { method: "POST", signal, headers, body: payload });
    if (r.ok) { goodAuth = mode; return r; }
    last = `Gemini ${model} [${mode}] HTTP ${r.status}: ${(await r.text()).slice(0, 220)}`;
    if (r.status !== 401 && r.status !== 403 && r.status !== 400) break; // not an auth problem
  }
  throw new Error(last);
}

async function callGemini(model, key, description) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const payload = JSON.stringify({
      systemInstruction: { parts: [{ text: PROMPT }] },
      contents: [{ role: "user", parts: [{ text: `EVENT DESCRIPTION:\n"""${description}"""` }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: SCHEMA, temperature: 0.6 },
    });
    const r = await geminiFetch(model, key.trim(), payload, ctrl.signal);
    const data = await r.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
    return validatePlan(JSON.parse(text.replace(/^```json|```$/g, "").trim()));
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const description = String(body.description || "").trim().slice(0, 4000);
  if (description.length < 15)
    return res.status(400).json({ error: "Please describe your event in a little more detail (at least a sentence)." });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: "The AI service isn't configured yet." });

  const models = [process.env.GEMINI_MODEL, "gemini-2.5-flash", "gemini-flash-latest", "gemini-2.0-flash"].filter(Boolean);
  let lastErr;
  const diag = [];
  for (const model of [...new Set(models)]) {
    for (let attempt = 0; attempt < 1; attempt++) {
      try {
        const plan = await callGemini(model, key, description);
        return res.status(200).json(plan);
      } catch (e) {
        lastErr = e;
        diag.push(`${model}: ${String(e.message).replace(/key=[^&\s]+/g, "key=***").slice(0, 160)}`);
        
        console.error("generate failed", model, attempt, e.message);
      }
    }
  }
  const busy = /HTTP 429/.test(lastErr?.message || "");
  return res.status(502).json({
    error: busy
      ? "The AI service is busy right now. Please try again in a few seconds."
      : "We couldn't generate your form right now. Please try again.",
    diag,
  });
}
