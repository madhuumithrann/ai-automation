# EventForm AI

**Describe your event once. AI understands it, designs a feedback strategy, and creates a customized Google Form automatically.**

Built during the CS Week AI Automation Competition (Everyday Use track).

## Problem

> Build an automated system that takes an event description as input and automatically generates a customized Google Form for collecting feedback based on the event's purpose, activities, and technical details.

Organizers usually reuse a generic "rate the event 1–5" form. Those forms don't tell them whether the *specific* things they ran actually worked: the hands-on session, the mentoring, or the explanation of a particular topic.

## Solution

EventForm AI turns one free-text event description into a **real, published Google Form** whose questions are designed around that event:

1. **Understand.** The AI extracts the event type, audience, purpose, activities, technical details and expected outcomes.
2. **Decide.** It picks 4–6 feedback dimensions that give the organizer actionable insight, each with a reason.
3. **Design.** It writes 9–11 questions, each mapped to a dimension, using suitable response types (1–5 scale, multiple choice, checkboxes, short answer, paragraph).
4. **Validate.** The server checks the output (types, options, duplicates, empty text, counts) before anything is shown.
5. **Execute.** One click publishes an actual Google Form and returns a shareable link and QR code.

## Key Features

- Structured AI event analysis (*What the AI understood*)
- AI feedback strategy, showing what it decided to measure and why; click a dimension to highlight its questions
- Form quality check computed from the generated form: coverage of activities and technical topics, dimension coverage, response-type balance, an improvement question, and estimated completion time
- Google-Forms-style preview you can edit inline: edit text, reorder, toggle required, delete
- **Real Google Form creation** via Google Apps Script `FormApp`, with an open link, copy button and QR code
- Graceful failure handling: if Google fails, the questions are kept, with Retry and Export JSON options
- Responsive layout for desktop and mobile; no login needed for judges

## How It Works / Architecture

```
Browser (public/index.html)
   │  POST /api/generate {description}
   ▼
Vercel function api/generate.js ──► Gemini API (JSON schema structured output)
   │  lib/validate.js normalizes + validates
   ▼
Preview, strategy, quality check (user may edit)
   │  POST /api/create-form {plan}
   ▼
Vercel function api/create-form.js ──► Google Apps Script web app (apps-script/Code.gs)
                                         FormApp.create(...) → published Google Form URL
```

API keys and the Apps Script URL/secret stay server-side and are never sent to the browser.

## AI Pipeline

Event description → **event analysis** → **feedback strategy** → **questions mapped to dimensions** → **validation** → **Google Form**.

All three AI stages run in one Gemini call with an enforced JSON schema. This keeps it fast and reliable. If the call fails, it retries and then falls back to a second model.

## Tech Stack

- Frontend: one static HTML page with vanilla JS (no build step), Inter font, and qrcodejs from a CDN
- Backend: Vercel serverless functions (Node 18+, no npm dependencies)
- AI: Google Gemini (`gemini-2.5-flash`, falling back to `gemini-2.0-flash`) with `responseSchema`
- Google Forms: Google Apps Script web app using `FormApp` (runs as the form owner, so no OAuth flow for end users)

## Setup

```bash

cp .env.example .env      # fill in values
node dev-server.js        # http://localhost:3000
npm test                  # validator tests
```

### Google Form builder (one-time, about 3 minutes)

1. Go to <https://script.google.com>, create a **New project**, and paste in `apps-script/Code.gs`.
2. Set `SECRET` in the script to a random string.
3. **Deploy → New deployment → Web app**, with *Execute as:* **Me** and *Who has access:* **Anyone**. Authorize when prompted.
4. Copy the `/exec` URL into `APPS_SCRIPT_URL`, and put the same secret in `FORM_SECRET`.

## Environment Variables

| Name | Purpose |
|---|---|
| `GEMINI_API_KEY` | Gemini API key (server-side only) |
| `GEMINI_MODEL` | Optional model override |
| `APPS_SCRIPT_URL` | Deployed Apps Script web app URL |
| `FORM_SECRET` | Shared secret between Vercel and Apps Script |

## Deployment

Import the repo in Vercel (no root directory change needed). Leave Framework Preset as **Other** with no build command; Vercel serves `public/` and the `api/` functions. Add the environment variables above and deploy.

## Limitations

- Forms are created in the Google account that deployed the Apps Script; responses go to that account.
- Generated question quality depends on the detail in the event description. Very vague input gives more general questions.
- Inline editing covers text, order, required flag and deletion. Changing question types and options isn't supported in the UI.
- There is no rate limiting beyond what the Gemini and Apps Script quotas provide.
