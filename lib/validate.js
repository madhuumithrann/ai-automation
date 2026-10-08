// Validates and normalizes model output. Never trust the LLM blindly.
export const TYPES = ["rating", "single_choice", "multiple_choice", "short_text", "long_text"];

const str = (v, max = 400) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");
const strList = (v, maxItems = 12, max = 120) =>
  Array.isArray(v) ? [...new Set(v.map((x) => str(x, max)).filter(Boolean))].slice(0, maxItems) : [];

export function validatePlan(raw) {
  if (!raw || typeof raw !== "object") throw new Error("Model returned no object");
  const a = raw.event_analysis || {};
  const analysis = {
    event_type: str(a.event_type, 80) || "Event",
    audience: str(a.audience, 160) || "Attendees",
    purpose: str(a.purpose, 300),
    activities: strList(a.activities),
    technical_details: strList(a.technical_details),
    expected_outcomes: strList(a.expected_outcomes, 6, 160),
  };

  const strategy = (Array.isArray(raw.feedback_strategy) ? raw.feedback_strategy : [])
    .map((s) => ({ dimension: str(s?.dimension, 60), reason: str(s?.reason, 240) }))
    .filter((s) => s.dimension)
    .slice(0, 8);

  const seen = new Set();
  const questions = [];
  for (const q of Array.isArray(raw.questions) ? raw.questions : []) {
    const text = str(q?.question, 300);
    if (text.length < 8) continue;
    const key = text.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (seen.has(key)) continue;
    let type = TYPES.includes(q?.type) ? q.type : "short_text";
    let options = strList(q?.options, 8, 100);
    if (type === "single_choice" || type === "multiple_choice") {
      if (options.length < 2) type = "short_text"; // degrade safely instead of rendering a broken choice
    }
    if (type !== "single_choice" && type !== "multiple_choice") options = [];
    seen.add(key);
    questions.push({
      question: text,
      type,
      options,
      required: q?.required !== false,
      dimension: str(q?.dimension, 60),
      reason: str(q?.reason, 200),
    });
    if (questions.length >= 14) break;
  }
  if (questions.length < 4) throw new Error("Too few valid questions");

  return {
    title: str(raw.title, 120) || `${analysis.event_type} Feedback`,
    description: str(raw.description, 500) || "Thank you for attending! Your feedback helps us improve future events.",
    event_analysis: analysis,
    feedback_strategy: strategy,
    questions,
  };
}
