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
    let hint = e.message;
    if (/non-JSON/.test(hint) && /accounts\.google|Sign in|<html/i.test(hint))
      hint = "Apps Script asked for sign-in: redeploy the web app with Execute as = Me and Who has access = Anyone.";
    else if (/unauthorized/.test(hint)) hint = "FORM_SECRET in Vercel doesn't match SECRET in the Apps Script.";
    else if (/aborted/i.test(hint)) hint = "Apps Script timed out.";
    return res.status(502).json({ error: "We couldn't create the Google Form.", diag: hint.slice(0, 300) });
  } finally {
    clearTimeout(timer);
  }
}
