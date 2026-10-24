# Little Cherubs Learner

Online learning for Zambian secondary Forms 1 to 4, aligned to the 2024 CDC competence-based syllabi. Parents buy 90-day passes on Selar; Zapier sends each sale to the app; learners study online only.

**Setting it up?** Read [SETUP-GUIDE.md](SETUP-GUIDE.md).

## How it's built

- **Hosting:** Netlify. Static front end in `public/`, server in Netlify Functions, data in Netlify Blobs. No external database.
- **No front-end build step.** Plain ES modules; the only dependencies are server-side (`@netlify/blobs`, `marked`, `sanitize-html`).

```
public/            index.html + app.js (parent and learner app), admin.html + admin.js, app.css, assets/
netlify/functions/ api.mjs (every /api/* route), reminders.mjs (daily, 06:00 UTC)
lib/               store.mjs (Blobs, or local files), core.mjs (families, passes, sales, sessions, progress),
                   content.mjs (Style-Guide Markdown -> lesson/practical/questions), media.mjs (chunked video + range streaming), util.mjs
config/            curriculum-biology.mjs (84 competences, Forms 1-4), products.mjs (Selar product -> pass)
content/           BIO-F1-1.3.1.1.md (approved pilot)
scripts/           dev-server.mjs (run locally), test.mjs (end-to-end tests)
```

## Main rules (enforced on the server)

- **Access:**
  - Every lesson, question and media request checks the learner's session, active device and pass end date.
  - Expired passes get 402 and the app shows a lock screen; progress is kept.
- **Passes:**
  - Each sale is a credit of 90 days for a Form and subjects.
  - It applies automatically when the family has exactly one child in that Form; otherwise the parent chooses.
  - Renewing extends from the later of today and the current end date.
- **Selar webhook:** `POST /api/webhooks/selar`, with the `x-webhook-key` header or `?key=`. JSON or form-encoded.
  - Fields: `email`, `phone`, `name`, `product`, `reference`, `amount`, `currency`.
  - Idempotent on `reference`. Unknown products are rejected with 422 and logged.
- **Devices:** up to 2 per learner. Choosing a learner on a device makes that device the only active one for that learner (409 elsewhere).
- **Parent area:** needs the 4-digit PIN in the session.
- **Practice:**
  - MCQs are marked by the server; answers are released only after answering.
  - Self-marked parts are capped at each part's marks; totals are kept by assessment objective (A/B/C).
  - Mastery is 70%.
- **Reminders:** at 10 days, at 2 days, and once on the end date. They go to `NOTIFY_WEBHOOK_URL` (Zapier Catch Hook), as are password-reset links.
- **Media:** uploaded in 3 MB pieces and served with byte ranges (so seeking works). No public URLs; the learner's name is overlaid on the video.

## Environment variables

| Variable | Purpose |
|---|---|
| `ADMIN_PASSWORD` | Admin sign-in (10+ characters) |
| `SELAR_WEBHOOK_KEY` | Shared secret for the sales webhook (16+ characters) |
| `SITE_URL` | Public address, used in set-up and reset links |
| `RENEW_URL` | Selar product page for buying and renewing |
| `NOTIFY_WEBHOOK_URL` | Zapier Catch Hook for reminders and password resets (optional) |

## Run and test locally

```
npm install
ADMIN_PASSWORD=admin-password-123 SELAR_WEBHOOK_KEY=any-16-plus-characters npm run dev
#   app:   http://localhost:8888      admin: http://localhost:8888/admin/
npm test        # 14 end-to-end checks: sale, set-up, learning, practice, devices, expiry, reminders, renewal, admin
```

Locally, data lives in `.data/` (plain files) instead of Netlify Blobs.

## Content format

Content sets follow the Biology Content Style Guide and are exported from Claude Docs as Markdown. The parser expects these sections and question labels:

- **Sections:** `## 1. Lesson notes`, `## 2. Practical…`, `## 3. Questions`, `## 4. Video script…`, `## 5. Teacher notes`.
- **Each question:** a `### Qnn` heading, then the labelled blocks `**ID:**`, `**Type:**`, `**AO:**`, `**Marks:**`, `**Difficulty:**`, `**Question:**`, `**Options:**`, `**Correct answer:**`, `**Explanation:**`, `**Marking points:**`.
- **Structured question parts:** `(a) \[A\] … (5 marks)`.

The admin upload reports any mismatch, such as parts not adding up or a missing answer letter.

## Next steps a developer might take

- Move video to Bunny Stream or Mux (signed URLs) when usage grows; only `lib/media.mjs` changes.
- Add more subjects: one curriculum file each, a subject switch in the learner app, and products in `config/products.mjs`.
- Separate admin accounts, if more than one person runs the admin area.
