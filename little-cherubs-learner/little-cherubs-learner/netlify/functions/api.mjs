// Little Cherubs Learner: the server. Every /api/* request comes here.

import { json, HttpError, fail, readJSON, parseCookies, cookie, verifySecret, hashSecret, safeEqual,
  normEmail, isEmail, cleanText, siteUrl, newId, DAY } from "../../lib/util.mjs";
import { indexes, sessions, logs, content as contentStore, families } from "../../lib/store.mjs";
import * as core from "../../lib/core.mjs";
import { parseContentDoc, learnerView, findCompetence } from "../../lib/content.mjs";
import * as med from "../../lib/media.mjs";
import curriculum from "../../config/curriculum-biology.mjs";
import products, { DEFAULT_RENEW_URL } from "../../config/products.mjs";

const SID = "lcl_sid", ADMIN = "lcl_admin";
const renewUrl = () => process.env.RENEW_URL || DEFAULT_RENEW_URL;

/* ---------------- helpers ---------------- */
async function sessionFrom(req) { return core.getSession(parseCookies(req)[SID]); }

async function requireSession(req) {
  const s = await sessionFrom(req);
  if (!s) fail(401, "SIGNED_OUT", "Please sign in.");
  const family = await core.getFamily(s.familyId);
  if (!family) fail(401, "SIGNED_OUT", "Please sign in.");
  return { s, family };
}

async function requireParent(req) {
  const ctx = await requireSession(req);
  if (ctx.s.role !== "parent" || !ctx.s.pinOk) fail(403, "PARENT_PIN", "Enter the parent PIN to continue.");
  return ctx;
}

async function requireLearner(req, { needPass = true } = {}) {
  const ctx = await requireSession(req);
  if (ctx.s.role !== "learner") fail(403, "CHOOSE_PROFILE", "Choose who is using the app.");
  const learner = core.findLearner(ctx.family, ctx.s.learnerId);
  if (!learner) fail(403, "CHOOSE_PROFILE", "Choose who is using the app.");
  if (learner.activeSid !== ctx.s.sid) fail(409, "SIGNED_IN_ELSEWHERE", `${learner.name} is now signed in on another device. Choose ${learner.name} again to continue here.`);
  const pass = core.passStatus(learner);
  if (needPass && !pass.active) fail(402, "PASS_ENDED", "Your pass has ended. Ask your parent to renew.");
  return { ...ctx, learner, pass };
}

async function requireAdmin(req) {
  const sid = parseCookies(req)[ADMIN];
  const s = sid ? await sessions().getJSON("admin:" + sid) : null;
  if (!s || Date.now() - s.createdAt > 12 * 3600_000) fail(401, "ADMIN_SIGNED_OUT", "Please sign in to the admin area.");
  return s;
}

async function rateLimit(key, max = 8, minutes = 15) {
  const r = (await indexes().getJSON("fail:" + key)) || { count: 0, until: 0 };
  if (r.until > Date.now()) fail(429, "TOO_MANY_TRIES", `Too many tries. Wait ${Math.ceil((r.until - Date.now()) / 60000)} minutes and try again.`);
  return {
    async bad() { r.count++; if (r.count >= max) { r.until = Date.now() + minutes * 60000; r.count = 0; } await indexes().setJSON("fail:" + key, r); },
    async good() { if (r.count) await indexes().del("fail:" + key); },
  };
}

async function notify(payload) {
  const url = process.env.NOTIFY_WEBHOOK_URL;
  if (!url) return false;
  try {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    return r.ok;
  } catch { return false; }
}

async function contentCodes() { return new Set(await contentStore().list("")); }

function meView(s, family) {
  return { signedIn: true, family: core.familyView(family), session: { role: s.role, learnerId: s.learnerId, pinOk: !!s.pinOk }, renewUrl: renewUrl(),
    maxDevices: core.MAX_DEVICES };
}

function courseFor(form, codes, prog) {
  return (curriculum.forms[String(form)] || []).map((c) => ({
    no: c.no, name: c.name,
    competences: c.competences.map((x) => {
      const cp = prog?.comps?.[x.code];
      return { code: x.code, title: x.title, available: codes.has(x.code),
        parts: cp ? [cp.lesson, cp.video, cp.prac, cp.best != null].filter(Boolean).length : 0,
        best: cp?.best ?? null, mastered: cp?.mastered || false };
    }),
  }));
}

/* ---------------- routes ---------------- */
const routes = [];
const on = (method, pattern, fn) => routes.push({ method, re: new RegExp("^" + pattern.replace(/:(\w+)/g, "(?<$1>[^/]+)") + "$"), fn });

/* --- account --- */
on("GET", "/api/me", async (req) => {
  const s = await sessionFrom(req);
  const family = s && (await core.getFamily(s.familyId));
  if (!s || !family) return { signedIn: false, renewUrl: renewUrl() };
  return meView(s, family);
});

on("POST", "/api/auth/login", async (req) => {
  const { email, password } = await readJSON(req);
  const e = normEmail(email);
  const rl = await rateLimit("login:" + e);
  const family = await core.familyByEmail(e);
  if (family && family.status !== "active") fail(403, "SETUP_NEEDED", "Finish setting up your account first, using the link we sent after payment. Ask us to resend it if you can't find it.");
  if (!family || !verifySecret(password, family.passwordHash)) { await rl.bad(); fail(401, "BAD_LOGIN", "That email and password don't match. Check them and try again."); }
  await rl.good();
  const s = await core.createSession(family.id);
  return json(meView(s, family), 200, { "set-cookie": cookie(SID, s.sid) });
});

on("POST", "/api/auth/logout", async (req) => {
  const s = await sessionFrom(req);
  if (s) await core.endSession(s.sid);
  return json({ ok: true }, 200, { "set-cookie": cookie(SID, "", { clear: true }) });
});

on("GET", "/api/setup/:token", async (req, p) => {
  const ref = await indexes().getJSON("setup:" + p.token);
  const family = ref && (await core.getFamily(ref.familyId));
  if (!family || family.status === "active") fail(404, "LINK_USED", "This set-up link has already been used or has expired. Sign in, or ask us for a new link.");
  return { email: family.email, parentName: family.parentName || "", phone: family.phone || "",
    credits: family.credits.filter((c) => !c.appliedTo).map((c) => ({ label: c.label, form: c.form })) };
});

on("POST", "/api/setup/:token", async (req, p) => {
  const ref = await indexes().getJSON("setup:" + p.token);
  const family = ref && (await core.getFamily(ref.familyId));
  if (!family || family.status === "active") fail(404, "LINK_USED", "This set-up link has already been used or has expired.");
  const b = await readJSON(req);
  const parentName = cleanText(b.parentName, 60), learnerName = cleanText(b.learnerName, 40);
  if (!parentName) fail(400, "NAME", "Enter your name.");
  if (String(b.password || "").length < 8) fail(400, "PASSWORD", "Choose a password of at least 8 characters.");
  if (!/^\d{4}$/.test(String(b.pin || ""))) fail(400, "PIN", "The parent PIN must be 4 digits.");
  if (!learnerName) fail(400, "LEARNER", "Enter your child's first name.");
  const form = Number(b.form) || family.credits[0]?.form || 1;
  family.parentName = parentName;
  family.phone = cleanText(b.phone, 30) || family.phone;
  family.passwordHash = hashSecret(b.password);
  family.pinHash = hashSecret(b.pin);
  family.learners.push(core.newLearner(learnerName, form));
  family.status = "active";
  delete family.setupToken;
  core.autoApply(family);
  await core.saveFamily(family);
  await indexes().del("setup:" + p.token);
  const s = await core.createSession(family.id);
  return json(meView(s, family), 200, { "set-cookie": cookie(SID, s.sid) });
});

on("POST", "/api/auth/forgot", async (req) => {
  const { email } = await readJSON(req);
  const e = normEmail(email);
  const rl = await rateLimit("forgot:" + e, 4, 60);
  await rl.bad();
  const family = await core.familyByEmail(e);
  let sent = false;
  if (family?.status === "active") {
    const link = await core.resetLink(family, siteUrl(req));
    sent = await notify({ type: "password_reset", email: family.email, phone: family.phone, parentName: family.parentName, link });
  }
  return { ok: true, sent };
});

on("POST", "/api/auth/reset/:token", async (req, p) => {
  const ref = await indexes().getJSON("reset:" + p.token);
  if (!ref || ref.expires < Date.now()) fail(404, "LINK_EXPIRED", "This reset link has expired. Ask for a new one.");
  const family = await core.getFamily(ref.familyId);
  const b = await readJSON(req);
  if (String(b.password || "").length < 8) fail(400, "PASSWORD", "Choose a password of at least 8 characters.");
  family.passwordHash = hashSecret(b.password);
  if (b.pin) { if (!/^\d{4}$/.test(String(b.pin))) fail(400, "PIN", "The parent PIN must be 4 digits."); family.pinHash = hashSecret(b.pin); }
  await core.saveFamily(family);
  await indexes().del("reset:" + p.token);
  const s = await core.createSession(family.id);
  return json(meView(s, family), 200, { "set-cookie": cookie(SID, s.sid) });
});

/* --- choosing a profile --- */
on("POST", "/api/session/parent", async (req) => {
  const { s, family } = await requireSession(req);
  const { pin } = await readJSON(req);
  const rl = await rateLimit("pin:" + family.id, 6, 10);
  if (!verifySecret(pin, family.pinHash)) { await rl.bad(); fail(401, "BAD_PIN", "That PIN isn't right. Try again."); }
  await rl.good();
  s.role = "parent"; s.pinOk = true; s.learnerId = null;
  await core.saveSession(s);
  return meView(s, family);
});

on("POST", "/api/session/learner", async (req) => {
  const { s, family } = await requireSession(req);
  const { learnerId, deviceId, deviceLabel } = await readJSON(req);
  const learner = core.findLearner(family, learnerId);
  if (!learner) fail(404, "NO_LEARNER", "Learner not found.");
  core.claimDevice(family, learner, s, deviceId, deviceLabel);
  await core.saveFamily(family);
  s.role = "learner"; s.learnerId = learner.id; s.pinOk = false;
  await core.saveSession(s);
  return meView(s, family);
});

on("POST", "/api/session/clear", async (req) => {
  const { s, family } = await requireSession(req);
  s.role = null; s.learnerId = null; s.pinOk = false;
  await core.saveSession(s);
  return meView(s, family);
});

/* --- parent --- */
async function learnerSummary(l) {
  const prog = await core.getProgress(l.id);
  const codes = await contentCodes();
  const course = courseFor(l.form, codes, prog);
  const comps = course.flatMap((c) => c.competences);
  const last = Object.values(prog.comps).flatMap((c) => c.attempts || []).sort((a, b) => b.at - a.at)[0] || null;
  return {
    id: l.id, name: l.name, form: l.form, pass: core.passStatus(l),
    totals: { competences: comps.length, open: comps.filter((c) => c.available).length, mastered: comps.filter((c) => c.mastered).length,
      started: comps.filter((c) => c.parts > 0).length },
    lastAttempt: last, log: prog.log.slice(0, 10),
  };
}

on("GET", "/api/parent/overview", async (req) => {
  const { family } = await requireParent(req);
  return { family: core.familyView(family), learners: await Promise.all(family.learners.map(learnerSummary)), renewUrl: renewUrl(), maxDevices: core.MAX_DEVICES };
});

on("GET", "/api/parent/report/:learnerId", async (req, p) => {
  const { family } = await requireParent(req);
  const l = core.findLearner(family, p.learnerId);
  if (!l) fail(404, "NO_LEARNER", "Learner not found.");
  const prog = await core.getProgress(l.id);
  const codes = await contentCodes();
  const topics = [];
  for (const c of courseFor(l.form, codes, prog)) for (const x of c.competences) {
    if (!x.available && !x.parts) continue;
    const cp = prog.comps[x.code];
    topics.push({ code: x.code, title: x.title, concept: c.name, lesson: !!cp?.lesson, video: !!cp?.video, prac: !!cp?.prac,
      best: cp?.best ?? null, total: cp?.total ?? null, attempts: cp?.attempts?.length || 0, last: cp?.attempts?.at(-1) || null });
  }
  return { learner: await learnerSummary(l), topics };
});

on("POST", "/api/parent/apply-credit", async (req) => {
  const { family } = await requireParent(req);
  const { creditId, learnerId } = await readJSON(req);
  const l = core.applyCredit(family, creditId, learnerId);
  await core.saveFamily(family);
  const prog = await core.getProgress(l.id); core.logActivity(prog, "Pass added: 90 more days"); await core.saveProgress(l.id, prog);
  return { family: core.familyView(family) };
});

on("POST", "/api/parent/learners", async (req) => {
  const { family } = await requireParent(req);
  const { name, form } = await readJSON(req);
  if (!cleanText(name, 40)) fail(400, "NAME", "Enter your child's first name.");
  if (![1, 2, 3, 4].includes(Number(form))) fail(400, "FORM", "Choose Form 1, 2, 3 or 4.");
  if (family.learners.length >= 6) fail(400, "TOO_MANY", "An account can have up to 6 learners.");
  family.learners.push(core.newLearner(name, form));
  core.autoApply(family);
  await core.saveFamily(family);
  return { family: core.familyView(family) };
});

on("POST", "/api/parent/devices/remove", async (req) => {
  const { family } = await requireParent(req);
  const { learnerId, deviceId } = await readJSON(req);
  const l = core.findLearner(family, learnerId);
  if (!l) fail(404, "NO_LEARNER", "Learner not found.");
  l.devices = l.devices.filter((d) => d.id !== deviceId);
  await core.saveFamily(family);
  return { family: core.familyView(family) };
});

on("POST", "/api/parent/pin", async (req) => {
  const { family } = await requireParent(req);
  const { pin } = await readJSON(req);
  if (!/^\d{4}$/.test(String(pin || ""))) fail(400, "PIN", "The parent PIN must be 4 digits.");
  family.pinHash = hashSecret(pin);
  await core.saveFamily(family);
  return { ok: true };
});

/* --- learner --- */
on("GET", "/api/learner/home", async (req) => {
  const { learner, pass } = await requireLearner(req, { needPass: false });
  const prog = await core.getProgress(learner.id);
  const course = courseFor(learner.form, await contentCodes(), prog);
  const flat = course.flatMap((c) => c.competences.map((x) => ({ ...x, concept: c.no, conceptName: c.name })));
  const next = flat.find((x) => x.available && !x.mastered) || flat.find((x) => x.available) || null;
  return { learner: { id: learner.id, name: learner.name, form: learner.form }, pass, course, next, subject: curriculum.subjectName, renewUrl: renewUrl() };
});

on("GET", "/api/learner/topic/:code", async (req, p) => {
  const { learner } = await requireLearner(req);
  const comp = findCompetence(p.code);
  if (!comp || comp.form !== learner.form) fail(404, "NO_TOPIC", "Topic not found.");
  const c = await contentStore().getJSON(p.code);
  if (!c) fail(404, "NOT_YET", "This topic opens soon.");
  const prog = await core.getProgress(learner.id);
  const cp = prog.comps[p.code] || {};
  return { competence: comp, content: learnerView(c), media: await med.mediaInfo(p.code),
    progress: { lesson: !!cp.lesson, video: !!cp.video, prac: !!cp.prac, best: cp.best ?? null, attempts: cp.attempts?.length || 0,
      mastery: core.mastery(cp, c.totalMarks), current: cp.current || { mcq: {} } },
    learnerName: learner.name };
});

on("POST", "/api/learner/progress/:code", async (req, p) => {
  const { learner } = await requireLearner(req);
  const { part } = await readJSON(req);
  if (!["lesson", "video", "prac"].includes(part)) fail(400, "BAD_PART", "Unknown part.");
  const comp = findCompetence(p.code);
  if (!comp) fail(404, "NO_TOPIC", "Topic not found.");
  const prog = await core.getProgress(learner.id);
  const cp = core.compProgress(prog, p.code);
  if (!cp[part]) {
    cp[part] = true;
    core.logActivity(prog, { lesson: "Finished the lesson", video: "Watched the video", prac: "Completed the practical" }[part] + `: ${comp.title}`);
    await core.saveProgress(learner.id, prog);
  }
  return { ok: true };
});

async function loadQuestion(code, qid) {
  const c = await contentStore().getJSON(code);
  const q = c?.questions?.find((x) => x.qid === qid);
  if (!q) fail(404, "NO_QUESTION", "Question not found.");
  return { c, q };
}

on("POST", "/api/learner/practice/:code/answer", async (req, p) => {
  const { learner } = await requireLearner(req);
  const { qid, choice } = await readJSON(req);
  const { q } = await loadQuestion(p.code, qid);
  if (q.type !== "MCQ") fail(400, "NOT_MCQ", "This question is marked by you, not automatically.");
  const prog = await core.getProgress(learner.id);
  const cp = core.compProgress(prog, p.code);
  cp.current = cp.current || { mcq: {} };
  if (cp.current.mcq[qid] == null) { cp.current.mcq[qid] = Number(choice); await core.saveProgress(learner.id, prog); }
  const chosen = cp.current.mcq[qid];
  return { choice: chosen, correct: chosen === q.answer, answer: q.answer, explanationHtml: q.explanationHtml };
});

on("POST", "/api/learner/practice/:code/reveal", async (req, p) => {
  await requireLearner(req);
  const { qid } = await readJSON(req);
  const { q } = await loadQuestion(p.code, qid);
  if (q.type === "MCQ") fail(400, "IS_MCQ", "Choose an answer to see the explanation.");
  return { modelHtml: q.modelHtml, explanationHtml: q.explanationHtml, markingHtml: q.markingHtml, parts: q.parts };
});

on("POST", "/api/learner/practice/:code/finish", async (req, p) => {
  const { learner } = await requireLearner(req);
  const { self = {} } = await readJSON(req);
  const c = await contentStore().getJSON(p.code);
  if (!c) fail(404, "NO_TOPIC", "Topic not found.");
  const prog = await core.getProgress(learner.id);
  const cp = core.compProgress(prog, p.code);
  const mcq = cp.current?.mcq || {};
  const ao = { A: 0, B: 0, C: 0 };
  const perQ = {};
  for (const q of c.questions) {
    if (q.type === "MCQ") { const got = mcq[q.qid] === q.answer ? q.marks : 0; ao[q.ao] += got; perQ[q.qid] = got; }
    else {
      const given = Array.isArray(self[q.qid]) ? self[q.qid] : [];
      let sum = 0;
      q.parts.forEach((part, i) => { const m = Math.max(0, Math.min(part.marks, Math.round(Number(given[i]) || 0))); ao[part.ao] += m; sum += m; });
      perQ[q.qid] = sum;
    }
  }
  const total = ao.A + ao.B + ao.C;
  const attempt = { at: Date.now(), total, max: c.totalMarks, ao, aoMax: c.aoMax, perQ };
  cp.attempts = [...(cp.attempts || []), attempt].slice(-20);
  cp.best = Math.max(cp.best ?? 0, total);
  cp.total = c.totalMarks;
  cp.mastered = cp.best / c.totalMarks >= core.MASTERY;
  cp.current = { mcq: {} };
  core.logActivity(prog, `Practice on ${c.title}: ${total} of ${c.totalMarks} marks`);
  await core.saveProgress(learner.id, prog);
  return { attempt, best: cp.best, mastery: core.mastery(cp, c.totalMarks) };
});

on("POST", "/api/learner/practice/:code/restart", async (req, p) => {
  const { learner } = await requireLearner(req);
  const prog = await core.getProgress(learner.id);
  core.compProgress(prog, p.code).current = { mcq: {} };
  await core.saveProgress(learner.id, prog);
  return { ok: true };
});

on("GET", "/api/media/:code/:quality", async (req, p) => {
  await requireLearner(req);
  return med.streamMedia(req, p.code, p.quality);
});

/* --- Selar sales (sent by Zapier) --- */
on("POST", "/api/webhooks/selar", async (req) => {
  const key = process.env.SELAR_WEBHOOK_KEY;
  if (!key || key.length < 16) fail(503, "NOT_CONFIGURED", "SELAR_WEBHOOK_KEY is not set in Netlify.");
  const given = req.headers.get("x-webhook-key") || new URL(req.url).searchParams.get("key") || "";
  if (!safeEqual(given, key)) fail(401, "BAD_KEY", "Webhook key is wrong.");
  const type = req.headers.get("content-type") || "";
  const body = type.includes("application/x-www-form-urlencoded")
    ? Object.fromEntries(new URLSearchParams(await req.text()))
    : await readJSON(req);
  const result = await core.recordSale(body, { siteUrl: siteUrl(req), source: "selar" });
  return { ok: true, ...result };
});

/* --- admin --- */
on("POST", "/api/admin/login", async (req) => {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw || pw.length < 10) fail(503, "NOT_CONFIGURED", "Set ADMIN_PASSWORD (10+ characters) in Netlify first.");
  const rl = await rateLimit("admin", 6, 15);
  const { password } = await readJSON(req);
  if (!safeEqual(password || "", pw)) { await rl.bad(); fail(401, "BAD_LOGIN", "Wrong admin password."); }
  await rl.good();
  const sid = newId(24);
  await sessions().setJSON("admin:" + sid, { createdAt: Date.now() });
  return json({ ok: true }, 200, { "set-cookie": cookie(ADMIN, sid, { maxAgeDays: 1 }) });
});
on("POST", "/api/admin/logout", async (req) => {
  const sid = parseCookies(req)[ADMIN];
  if (sid) await sessions().del("admin:" + sid);
  return json({ ok: true }, 200, { "set-cookie": cookie(ADMIN, "", { clear: true }) });
});
on("GET", "/api/admin/me", async (req) => { await requireAdmin(req); return { ok: true }; });

async function allFamilies() {
  const ids = await families().list("");
  return (await Promise.all(ids.map((id) => families().getJSON(id)))).filter(Boolean);
}

on("GET", "/api/admin/overview", async (req) => {
  await requireAdmin(req);
  const fams = await allFamilies();
  const learners = fams.flatMap((f) => f.learners.map((l) => ({ f, l, pass: core.passStatus(l) })));
  const saleKeys = (await logs().list("sale/")).slice(-200);
  const sales = (await Promise.all(saleKeys.map((k) => logs().getJSON(k)))).filter(Boolean).reverse();
  const month = Date.now() - 30 * DAY;
  return {
    counts: {
      families: fams.filter((f) => f.status === "active").length,
      pendingSetup: fams.filter((f) => f.status !== "active").length,
      activePasses: learners.filter((x) => x.pass.active).length,
      endingSoon: learners.filter((x) => x.pass.active && x.pass.daysLeft <= 10).length,
      ended: learners.filter((x) => !x.pass.active && x.pass.endsAt).length,
      sales30: sales.filter((s) => s.at > month && s.result && !s.result.startsWith("rejected") && !s.result.startsWith("duplicate")).length,
    },
    endingSoon: learners.filter((x) => x.pass.active && x.pass.daysLeft <= 10)
      .map((x) => ({ familyId: x.f.id, email: x.f.email, parent: x.f.parentName, learner: x.l.name, daysLeft: x.pass.daysLeft, endsAt: x.pass.endsAt })),
    recentSales: sales.slice(0, 10),
    config: {
      adminPassword: true,
      webhookKey: !!(process.env.SELAR_WEBHOOK_KEY && process.env.SELAR_WEBHOOK_KEY.length >= 16),
      notifyWebhook: !!process.env.NOTIFY_WEBHOOK_URL,
      renewUrl: renewUrl(),
      siteUrl: siteUrl(req),
    },
  };
});

on("GET", "/api/admin/families", async (req) => {
  await requireAdmin(req);
  const q = (new URL(req.url).searchParams.get("q") || "").toLowerCase().trim();
  const fams = await allFamilies();
  return {
    families: fams
      .filter((f) => !q || [f.email, f.parentName, f.phone, ...f.learners.map((l) => l.name)].some((x) => String(x || "").toLowerCase().includes(q)))
      .sort((a, b) => b.createdAt - a.createdAt).slice(0, 200)
      .map((f) => ({ id: f.id, email: f.email, parentName: f.parentName, phone: f.phone, status: f.status, createdAt: f.createdAt,
        learners: f.learners.map((l) => ({ name: l.name, form: l.form, pass: core.passStatus(l) })),
        waitingCredits: f.credits.filter((c) => !c.appliedTo).length })),
  };
});

on("GET", "/api/admin/families/:id", async (req, p) => {
  await requireAdmin(req);
  const f = await core.getFamily(p.id);
  if (!f) fail(404, "NO_FAMILY", "Family not found.");
  const v = core.familyView(f);
  v.createdAt = f.createdAt;
  v.allCredits = f.credits;
  v.history = f.learners.map((l) => ({ learnerId: l.id, history: l.passes.biology?.history || [] }));
  return v;
});

async function adminFamily(req, id) { await requireAdmin(req); const f = await core.getFamily(id); if (!f) fail(404, "NO_FAMILY", "Family not found."); return f; }

on("POST", "/api/admin/families/:id/add-days", async (req, p) => {
  const f = await adminFamily(req, p.id);
  const { learnerId, days, note } = await readJSON(req);
  const d = Math.round(Number(days));
  if (!d || Math.abs(d) > 400) fail(400, "DAYS", "Enter a number of days between -400 and 400.");
  await core.addDays(f, learnerId, d, note);
  await core.saveFamily(f);
  return core.familyView(f);
});
on("POST", "/api/admin/families/:id/apply-credit", async (req, p) => {
  const f = await adminFamily(req, p.id);
  const { creditId, learnerId } = await readJSON(req);
  core.applyCredit(f, creditId, learnerId);
  await core.saveFamily(f);
  return core.familyView(f);
});
on("POST", "/api/admin/families/:id/reset-link", async (req, p) => {
  const f = await adminFamily(req, p.id);
  if (f.status !== "active") fail(400, "NOT_SET_UP", "This family hasn't finished setting up. Send a set-up link instead.");
  return { url: await core.resetLink(f, siteUrl(req)) };
});
on("POST", "/api/admin/families/:id/setup-link", async (req, p) => {
  const f = await adminFamily(req, p.id);
  if (f.status === "active") fail(400, "ALREADY_SET_UP", "This family is already set up. Send a password reset link instead.");
  const url = await core.setupLink(f, siteUrl(req));
  await core.saveFamily(f);
  return { url };
});
on("POST", "/api/admin/families/:id/clear-devices", async (req, p) => {
  const f = await adminFamily(req, p.id);
  const { learnerId } = await readJSON(req);
  const l = core.findLearner(f, learnerId);
  if (!l) fail(404, "NO_LEARNER", "Learner not found.");
  l.devices = []; l.activeSid = null;
  await core.saveFamily(f);
  return core.familyView(f);
});

on("GET", "/api/admin/products", async (req) => { await requireAdmin(req); return { products }; });

on("POST", "/api/admin/sale", async (req) => {
  await requireAdmin(req);
  const b = await readJSON(req);
  if (!isEmail(normEmail(b.email))) fail(400, "EMAIL", "Enter the buyer's email address.");
  return core.recordSale({ ...b, reference: b.reference || `manual-${newId(6)}` }, { siteUrl: siteUrl(req), source: "manual" });
});

on("GET", "/api/admin/sales", async (req) => {
  await requireAdmin(req);
  const keys = (await logs().list("sale/")).slice(-150);
  return { sales: (await Promise.all(keys.map((k) => logs().getJSON(k)))).filter(Boolean).reverse() };
});

on("GET", "/api/admin/content", async (req) => {
  await requireAdmin(req);
  const codes = await contentCodes();
  const forms = {};
  for (const [form, concepts] of Object.entries(curriculum.forms)) {
    forms[form] = [];
    for (const c of concepts) for (const x of c.competences) {
      let info = null;
      if (codes.has(x.code)) {
        const doc = await contentStore().getJSON(x.code);
        info = { questions: doc.questions.length, totalMarks: doc.totalMarks, aoMax: doc.aoMax, updatedAt: doc.updatedAt, media: await med.mediaInfo(x.code) };
      }
      forms[form].push({ code: x.code, title: x.title, concept: c.name, content: info });
    }
  }
  return { subject: curriculum.subjectName, forms };
});

on("POST", "/api/admin/content", async (req) => {
  await requireAdmin(req);
  const text = await req.text();
  if (text.length > 400_000) fail(413, "TOO_LARGE", "That document is too large.");
  const r = parseContentDoc(text);
  if (!r.ok) fail(400, "BAD_DOC", r.error);
  await contentStore().setJSON(r.content.code, r.content);
  return { ok: true, code: r.content.code, title: r.content.title, questions: r.content.questions.length, totalMarks: r.content.totalMarks,
    aoMax: r.content.aoMax, scenes: r.content.scenes?.length || 0, warnings: r.warnings };
});

on("GET", "/api/admin/content/:code", async (req, p) => {
  await requireAdmin(req);
  const c = await contentStore().getJSON(p.code);
  if (!c) fail(404, "NO_CONTENT", "No content for this competence yet.");
  return c;
});
on("DELETE", "/api/admin/content/:code", async (req, p) => {
  await requireAdmin(req);
  await contentStore().del(p.code);
  return { ok: true };
});

on("POST", "/api/admin/media/:code/:quality/start", async (req, p) => {
  await requireAdmin(req);
  if (!findCompetence(p.code)) fail(404, "NO_TOPIC", "Unknown competence.");
  const { size, type } = await readJSON(req);
  return med.startUpload(p.code, p.quality, size, type);
});
on("PUT", "/api/admin/media/:code/:quality/:upload/:index", async (req, p) => {
  await requireAdmin(req);
  const bytes = new Uint8Array(await req.arrayBuffer());
  return med.putChunk(p.code, p.quality, p.upload, p.index, bytes);
});
on("POST", "/api/admin/media/:code/:quality/:upload/complete", async (req, p) => {
  await requireAdmin(req);
  return med.completeUpload(p.code, p.quality, p.upload);
});
on("DELETE", "/api/admin/media/:code/:quality", async (req, p) => {
  await requireAdmin(req);
  await med.deleteMedia(p.code, p.quality);
  return { ok: true };
});
on("GET", "/api/admin/media/:code/:quality", async (req, p) => {
  await requireAdmin(req);
  return med.streamMedia(req, p.code, p.quality);
});

/* ---------------- entry point ---------------- */
export default async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "");
  try {
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = path.match(r.re);
      if (!m) continue;
      const params = Object.fromEntries(Object.entries(m.groups || {}).map(([k, v]) => [k, decodeURIComponent(v)]));
      const out = await r.fn(req, params);
      return out instanceof Response ? out : json(out);
    }
    return json({ error: "NOT_FOUND", message: "Not found." }, 404);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.code, message: e.message }, e.status);
    console.error(`${req.method} ${path}`, e);
    // Temporary while launching: show the technical reason so it can be reported.
    const detail = `${e?.name || "Error"}: ${String(e?.message || e).slice(0, 240)} [${req.method} ${path}]`;
    return json({ error: "SERVER_ERROR", message: `Something went wrong on our side. Try again in a moment. (Technical detail: ${detail})` }, 500);
  }
};

export const config = { path: "/api/*" };
