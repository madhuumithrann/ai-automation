import { validatePlan } from "../lib/validate.js";

// Sends the validated plan to our Google Apps Script web app, which creates a real Google Form via FormApp.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const url = process.env.APPS_SCRIPT_URL;
  if (!url) return res.status(500).json({ error: "Google Form creation isn't configured yet." });

  let plan;
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    plan = validatePlan(body);
  } catch {
    return res.status(400).json({ error: "The form data was invalid." });
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 50000);
  try {
    const r = await fetch(url, {
      method: "POST",
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        secret: process.env.FORM_SECRET || "",
        title: plan.title,
        description: plan.description,
        questions: plan.questions,
      }),
    });
    const text = await r.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Apps Script returned non-JSON (HTTP ${r.status}): ${text.slice(0, 200)}`);
    }
    if (!data.ok || !/^https:\/\/docs\.google\.com\/forms\//.test(data.formUrl || ""))
      throw new Error(`Apps Script error: ${data.error || "missing formUrl"}`);
    return res.status(200).json({ formUrl: data.formUrl, questionCount: data.questionCount });
  } catch (e) {
    console.error("create-form failed", e.message);
    return res.status(502).json({ error: "We couldn't create the Google Form." });
  } finally {
    clearTimeout(timer);
  }
}
