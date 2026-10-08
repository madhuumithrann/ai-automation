import assert from "node:assert";
import { validatePlan } from "../lib/validate.js";
const good = JSON.parse((await import("node:fs")).readFileSync(new URL("./fixture-workshop.json", import.meta.url), "utf8"));
const p = validatePlan(good);
assert.ok(p.questions.length >= 8, "keeps questions");
// malformed: bad types, dup, choice w/o options, empty text
const bad = validatePlan({ ...good, questions: [
  ...good.questions,
  { question: good.questions[0].question.toUpperCase(), type: "rating" },
  { question: "Pick one of these please?", type: "single_choice", options: ["x"] },
  { question: "", type: "rating" },
  { question: "What weird type is this?", type: "matrix" },
]});
assert.equal(bad.questions.length, good.questions.length + 2, "dedupes and drops empties");
assert.equal(bad.questions.at(-2).type, "short_text", "choice without options degrades");
assert.equal(bad.questions.at(-1).type, "short_text", "unknown type degrades");
assert.throws(() => validatePlan({ questions: [] }), "rejects empty");
assert.throws(() => validatePlan(null));
assert.throws(() => validatePlan("garbage"));
console.log("validate tests passed");
