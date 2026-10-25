// End-to-end test of the server: sale -> set-up -> sign in -> learn -> practise
// -> parent report -> expiry -> renewal -> devices -> admin -> video streaming.
//   npm test

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "lcl-test-"));
process.env.LCL_LOCAL_STORE = tmp;
process.env.LCL_INSECURE_COOKIES = "1";
process.env.ADMIN_PASSWORD = "admin-password-123";
process.env.SELAR_WEBHOOK_KEY = "test-webhook-key-0123456789";
process.env.SITE_URL = "http://localhost:8899";
const { createServer } = await import("./dev-server.mjs");
const server = await createServer(8899);
const BASE = "http://localhost:8899";

function client() {
  let jar = {};
  return async function call(method, p, body, extra = {}) {
    const headers = { ...(extra.headers || {}) };
    const ck = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
    if (ck) headers.cookie = ck;
    let b = body;
    if (body && !(body instanceof Uint8Array) && typeof body !== "string") { b = JSON.stringify(body); headers["content-type"] = "application/json"; }
    const r = await fetch(BASE + p, { method, headers, body: b });
    for (const sc of r.headers.getSetCookie?.() || []) {
      const [pair] = sc.split(";"); const i = pair.indexOf("=");
      const k = pair.slice(0, i), v = pair.slice(i + 1);
      if (/Max-Age=0/.test(sc)) delete jar[k]; else jar[k] = v;
    }
    const type = r.headers.get("content-type") || "";
    const data = type.includes("json") ? await r.json() : new Uint8Array(await r.arrayBuffer());
    return { status: r.status, data, headers: r.headers };
  };
}
let passed = 0;
const step = (name) => { passed++; console.log("  ✓ " + name); };

try {
  const admin = client(), parent = client(), phone2 = client(), phone3 = client();

  // Admin signs in and uploads the pilot content.
  assert.equal((await admin("POST", "/api/admin/login", { password: "wrong" })).status, 401);
  assert.equal((await admin("POST", "/api/admin/login", { password: "admin-password-123" })).status, 200);
  const md = await fs.readFile(new URL("../content/BIO-F1-1.3.1.1.md", import.meta.url), "utf8");
  const up = await admin("POST", "/api/admin/content", md, { headers: { "content-type": "text/markdown" } });
  assert.equal(up.status, 200); assert.equal(up.data.questions, 10); assert.deepEqual(up.data.aoMax, { A: 15, B: 9, C: 6 });
  step("admin signs in and uploads the 1.3.1.1 content (10 questions, A15 B9 C6)");

  // Video upload in pieces (fake 7 MB file -> 3 pieces).
  const size = 7 * 1024 * 1024 + 123;
  const fake = new Uint8Array(size); for (let i = 0; i < size; i++) fake[i] = i % 251;
  const st = await admin("POST", "/api/admin/media/1.3.1.1/360/start", { size, type: "video/mp4" });
  assert.equal(st.status, 200); assert.equal(st.data.chunks, 3);
  for (let i = 0; i < st.data.chunks; i++) {
    const piece = fake.subarray(i * st.data.chunkSize, Math.min(size, (i + 1) * st.data.chunkSize));
    const r = await admin("PUT", `/api/admin/media/1.3.1.1/360/${st.data.uploadId}/${i}`, piece, { headers: { "content-type": "application/octet-stream" } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
  }
  assert.equal((await admin("POST", `/api/admin/media/1.3.1.1/360/${st.data.uploadId}/complete`, {})).status, 200);
  step("admin uploads a 7 MB video in 3 pieces");

  // Sale arrives from Selar via Zapier.
  assert.equal((await fetch(BASE + "/api/webhooks/selar?key=bad", { method: "POST", body: "{}" })).status, 401);
  const sale = { email: "Parent@Example.com", phone: "0977000000", name: "Mrs Banda", product: "Little Cherubs Form 1 Biology 90-day pass", reference: "SEL-1001", amount: 250, currency: "ZMW" };
  const w = await fetch(BASE + "/api/webhooks/selar", { method: "POST", headers: { "content-type": "application/json", "x-webhook-key": process.env.SELAR_WEBHOOK_KEY }, body: JSON.stringify(sale) }).then((r) => r.json());
  assert.equal(w.ok, true); assert.equal(w.newFamily, true); assert.match(w.setupUrl, /#setup\//);
  const dup = await fetch(BASE + "/api/webhooks/selar", { method: "POST", headers: { "content-type": "application/json", "x-webhook-key": process.env.SELAR_WEBHOOK_KEY }, body: JSON.stringify(sale) }).then((r) => r.json());
  assert.equal(dup.status, "duplicate");
  const unknown = await fetch(BASE + "/api/webhooks/selar", { method: "POST", headers: { "content-type": "application/json", "x-webhook-key": process.env.SELAR_WEBHOOK_KEY }, body: JSON.stringify({ ...sale, reference: "X", product: "Something else" }) });
  assert.equal(unknown.status, 422);
  step("Selar sale creates a family with a set-up link; repeats and unknown products are caught");

  // Parent sets up the account.
  const token = w.setupUrl.split("#setup/")[1];
  assert.equal((await parent("GET", "/api/setup/" + token)).data.email, "parent@example.com");
  assert.equal((await parent("POST", "/api/setup/" + token, { parentName: "Mrs Banda", password: "short", pin: "1234", learnerName: "Mutale", form: 1 })).status, 400);
  const setup = await parent("POST", "/api/setup/" + token, { parentName: "Mrs Banda", phone: "0977000000", password: "goodpassword", pin: "2468", learnerName: "Mutale", form: 1 });
  assert.equal(setup.status, 200);
  const mutale = setup.data.family.learners[0];
  assert.equal(mutale.pass.active, true); assert.equal(mutale.pass.daysLeft, 90);
  assert.equal((await parent("GET", "/api/setup/" + token)).status, 404);
  step("parent sets up account; Mutale gets 90 days; set-up link can't be reused");

  // Learner profile and content.
  assert.equal((await parent("GET", "/api/learner/home")).status, 403);
  assert.equal((await parent("POST", "/api/session/learner", { learnerId: mutale.id, deviceId: "dev-A", deviceLabel: "Android phone" })).status, 200);
  const home = await parent("GET", "/api/learner/home");
  assert.equal(home.status, 200); assert.equal(home.data.next.code, "1.3.1.1");
  assert.equal(home.data.course.flatMap((c) => c.competences).length, 22);
  const topic = await parent("GET", "/api/learner/topic/1.3.1.1");
  assert.equal(topic.status, 200);
  for (const q of topic.data.content.questions)
    for (const k of ["answer", "markingHtml", "modelHtml", "explanationHtml"]) assert.ok(!(k in q), `${q.qid} must not include ${k}`);
  assert.ok(topic.data.media["360"]);
  step("learner sees the Form 1 course map (22 topics) and the topic, without answers");

  // Video streaming with ranges.
  const v1 = await parent("GET", "/api/media/1.3.1.1/360", null, { headers: { range: "bytes=0-99" } });
  assert.equal(v1.status, 206); assert.equal(v1.data.length, 100); assert.equal(v1.data[50], 50);
  const v2 = await parent("GET", "/api/media/1.3.1.1/360", null, { headers: { range: `bytes=${size - 10}-` } });
  assert.equal(v2.status, 206); assert.equal(v2.data.length, 10); assert.equal(v2.data[9], (size - 1) % 251);
  const v3 = await parent("GET", "/api/media/1.3.1.1/360", null, { headers: { range: "bytes=3145720-3145739" } });
  assert.equal(v3.status, 206); assert.equal(v3.headers.get("content-range"), `bytes 3145720-3145727/${size}`);
  step("video streams in byte ranges, including across piece boundaries");

  // Progress and practice.
  await parent("POST", "/api/learner/progress/1.3.1.1", { part: "lesson" });
  await parent("POST", "/api/learner/progress/1.3.1.1", { part: "video" });
  const a1 = await parent("POST", "/api/learner/practice/1.3.1.1/answer", { qid: "Q01", choice: 1 });
  assert.equal(a1.data.correct, true);
  const a2 = await parent("POST", "/api/learner/practice/1.3.1.1/answer", { qid: "Q02", choice: 0 });
  assert.equal(a2.data.correct, false); assert.equal(a2.data.answer, 2);
  const a2again = await parent("POST", "/api/learner/practice/1.3.1.1/answer", { qid: "Q02", choice: 2 });
  assert.equal(a2again.data.correct, false, "first answer is locked");
  for (const [q, c] of [["Q03", 2], ["Q04", 0], ["Q05", 1], ["Q06", 1]]) await parent("POST", "/api/learner/practice/1.3.1.1/answer", { qid: q, choice: c });
  const rev = await parent("POST", "/api/learner/practice/1.3.1.1/reveal", { qid: "Q09" });
  assert.equal(rev.data.parts.length, 4); assert.match(rev.data.markingHtml, /Rice/);
  const fin = await parent("POST", "/api/learner/practice/1.3.1.1/finish", { self: { Q07: [3], Q08: [2], Q09: [5, 1, 2, 2], Q10: [1, 2, 2, 1, 99] } });
  assert.equal(fin.status, 200);
  // MCQ 5 of 6; Q07 3; Q08 2; Q09 10; Q10 1+2+2+1+2(capped) = 8 -> 28
  assert.equal(fin.data.attempt.total, 28); assert.deepEqual(fin.data.attempt.ao, { A: 14, B: 8, C: 6 });
  assert.equal(fin.data.mastery, "Mastered");
  step("practice: MCQs marked by the server, self-marks capped, score 28/30 with A/B/C split");

  // Second device, third device blocked, single active session.
  await phone2("POST", "/api/auth/login", { email: "parent@example.com", password: "goodpassword" });
  assert.equal((await phone2("POST", "/api/session/learner", { learnerId: mutale.id, deviceId: "dev-B" })).status, 200);
  assert.equal((await parent("GET", "/api/learner/home")).status, 409, "first device is bumped");
  await phone3("POST", "/api/auth/login", { email: "parent@example.com", password: "goodpassword" });
  const third = await phone3("POST", "/api/session/learner", { learnerId: mutale.id, deviceId: "dev-C" });
  assert.equal(third.status, 403); assert.equal(third.data.error, "DEVICE_LIMIT");
  step("two-device limit and one active session per learner are enforced");

  // Parent area needs PIN; report shows progress; parent removes a device.
  assert.equal((await phone3("GET", "/api/parent/overview")).status, 403);
  assert.equal((await phone3("POST", "/api/session/parent", { pin: "0000" })).status, 401);
  assert.equal((await phone3("POST", "/api/session/parent", { pin: "2468" })).status, 200);
  const ov = await phone3("GET", "/api/parent/overview");
  assert.equal(ov.data.learners[0].totals.mastered, 1);
  const rep = await phone3("GET", `/api/parent/report/${mutale.id}`);
  assert.equal(rep.data.topics[0].best, 28); assert.ok(rep.data.learner.log.length >= 3);
  await phone3("POST", "/api/parent/devices/remove", { learnerId: mutale.id, deviceId: "dev-A" });
  assert.equal((await phone3("POST", "/api/session/learner", { learnerId: mutale.id, deviceId: "dev-C" })).status, 200);
  step("parent PIN required; report shows 28/30 and activity; removing a device frees a slot");

  // Expiry: move the pass end into the past via admin (-91 days).
  assert.equal((await admin("POST", `/api/admin/families/${w.familyId}/add-days`, { learnerId: mutale.id, days: -91, note: "test" })).status, 200);
  const blocked = await phone3("GET", "/api/learner/topic/1.3.1.1");
  assert.equal(blocked.status, 402);
  assert.equal((await phone3("GET", "/api/media/1.3.1.1/360", null, { headers: { range: "bytes=0-9" } })).status, 402);
  const homeEnded = await phone3("GET", "/api/learner/home");
  assert.equal(homeEnded.data.pass.active, false);
  step("after the pass ends, lessons and video are refused; progress is kept");

  // Reminders.
  const { runReminders } = await import("../netlify/functions/reminders.mjs");
  const msgs = [];
  assert.equal(await runReminders({ send: async (p) => { msgs.push(p); return true; } }), 1);
  assert.equal(msgs[0].type, "pass_ended");
  assert.equal(await runReminders({ send: async () => true }), 0, "not sent twice");
  step("daily reminder job sends the 'pass ended' message once");

  // Renewal: a second sale for the same email is applied automatically (one Form 1 child).
  const w2 = await fetch(BASE + "/api/webhooks/selar", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-webhook-key": process.env.SELAR_WEBHOOK_KEY },
    body: new URLSearchParams({ email: "parent@example.com", product: "Form 1 Biology renewal", reference: "SEL-1002" }) }).then((r) => r.json());
  assert.equal(w2.newFamily, false); assert.equal(w2.applied[0].learner, "Mutale");
  const after = await phone3("GET", "/api/learner/topic/1.3.1.1");
  assert.equal(after.status, 200); assert.equal(after.data.progress.best, 28);
  step("renewal sale (form-encoded) adds 90 days automatically; progress is still there");

  // Second child: credit waits for the parent to choose.
  await phone3("POST", "/api/session/parent", { pin: "2468" });
  await phone3("POST", "/api/parent/learners", { name: "Chileshe", form: 1 });
  await fetch(BASE + "/api/webhooks/selar", { method: "POST", headers: { "content-type": "application/json", "x-webhook-key": process.env.SELAR_WEBHOOK_KEY },
    body: JSON.stringify({ email: "parent@example.com", product: "Form 1 Biology", reference: "SEL-1003" }) });
  const ov2 = await phone3("GET", "/api/parent/overview");
  assert.equal(ov2.data.family.credits.length, 1);
  const chileshe = ov2.data.family.learners.find((l) => l.name === "Chileshe");
  const applied = await phone3("POST", "/api/parent/apply-credit", { creditId: ov2.data.family.credits[0].id, learnerId: chileshe.id });
  assert.equal(applied.data.family.learners.find((l) => l.name === "Chileshe").pass.daysLeft, 90);
  step("with two Form 1 children, a new pass waits until the parent chooses the child");

  // Admin views.
  const aov = await admin("GET", "/api/admin/overview");
  assert.equal(aov.data.counts.families, 1); assert.ok(aov.data.recentSales.length >= 4);
  const fam = await admin("GET", "/api/admin/families?q=mutale");
  assert.equal(fam.data.families.length, 1);
  const manual = await admin("POST", "/api/admin/sale", { email: "new@example.com", name: "Mr Phiri", product: "Form 1 Biology" });
  assert.match(manual.data.setupUrl, /#setup\//);
  const reset = await admin("POST", `/api/admin/families/${w.familyId}/reset-link`, {});
  assert.match(reset.data.url, /#reset\//);
  const fresh = client();
  assert.equal((await fresh("POST", "/api/auth/reset/" + reset.data.url.split("#reset/")[1], { password: "newpassword1" })).status, 200);
  assert.equal((await fresh("POST", "/api/auth/login", { email: "parent@example.com", password: "newpassword1" })).status, 200);
  const cl = await admin("GET", "/api/admin/content");
  assert.equal(cl.data.forms["1"].filter((x) => x.content).length, 1);
  step("admin overview, search, manual sale, password reset link and content list work");

  // Free trial: sign up without paying, 7 days of full access, once per email and phone.
  const tri = client();
  const tf = { parentName: "Mrs Zulu", email: "Zulu@Example.com", phone: "+260 966 111 222", password: "trialpass1", pin: "1357", learnerName: "Natasha", form: 1 };
  assert.equal((await tri("POST", "/api/trial/start", { ...tf, form: 3 })).status, 400, "Form 3 has no trial");
  const ts = await tri("POST", "/api/trial/start", tf);
  assert.equal(ts.status, 200, JSON.stringify(ts.data));
  const nat = ts.data.family.learners[0];
  assert.equal(nat.pass.trial, true); assert.equal(nat.pass.daysLeft, 7);
  assert.equal((await client()("POST", "/api/trial/start", { ...tf, email: "other@example.com", phone: "0966111222" })).data.error, "TRIAL_USED");
  assert.equal((await client()("POST", "/api/trial/start", { ...tf, phone: "0955000111" })).data.error, "ACCOUNT_EXISTS");
  assert.equal((await tri("POST", "/api/session/learner", { learnerId: nat.id, deviceId: "dev-T" })).status, 200);
  const th = await tri("GET", "/api/learner/home");
  assert.equal(th.data.pass.trial, true); assert.equal((await tri("GET", "/api/learner/topic/1.3.1.1")).status, 200);
  const tov = await admin("GET", "/api/admin/overview");
  assert.equal(tov.data.counts.activeTrials, 1);
  step("free trial: sign-up gives 7 days of full access; one trial per email and per WhatsApp number");

  const trialMsgs = async () => { const m = []; await runReminders({ send: async (x) => { m.push(x); return true; } }); return m.filter((x) => x.email === "zulu@example.com"); };
  assert.equal((await trialMsgs()).length, 0, "no 10-day reminder for a trial");
  await admin("POST", `/api/admin/families/${ts.data.family.id}/add-days`, { learnerId: nat.id, days: -6, note: "test" });
  assert.equal((await trialMsgs())[0]?.type, "trial_ending");
  await admin("POST", `/api/admin/families/${ts.data.family.id}/add-days`, { learnerId: nat.id, days: -2, note: "test" });
  assert.equal((await trialMsgs())[0]?.type, "trial_ended");
  assert.equal((await tri("GET", "/api/learner/topic/1.3.1.1")).status, 402);
  step("trial reminders 2 days before and at the end; learning locks when the trial ends");

  const w3 = await fetch(BASE + "/api/webhooks/selar", { method: "POST", headers: { "content-type": "application/json", "x-webhook-key": process.env.SELAR_WEBHOOK_KEY },
    body: JSON.stringify({ email: "zulu@example.com", product: "Little Cherubs Form 1 Biology 90-day pass", reference: "SEL-2001" }) }).then((r) => r.json());
  assert.equal(w3.applied[0].learner, "Natasha");
  const th2 = await tri("GET", "/api/learner/home");
  assert.equal(th2.data.pass.active, true); assert.equal(th2.data.pass.trial, false); assert.equal(th2.data.pass.daysLeft, 90);
  assert.equal((await admin("GET", "/api/admin/overview")).data.counts.trialsBought, 1);
  step("buying the 90-Day Access after the trial unlocks 90 days on the same account");

  console.log(`\nAll ${passed} checks passed.`);
} catch (e) {
  console.error("\nTEST FAILED:", e);
  process.exitCode = 1;
} finally {
  server.close();
  await fs.rm(tmp, { recursive: true, force: true });
}
