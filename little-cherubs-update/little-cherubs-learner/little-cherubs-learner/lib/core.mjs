// Families, learners, passes, sales and sessions.

import { families, indexes, sessions, logs, progress } from "./store.mjs";
import { DAY, newId, hashSecret, normEmail, cleanText, fail } from "./util.mjs";
import products, { TRIAL } from "../config/products.mjs";

export const MAX_DEVICES = 2;
export const SESSION_IDLE_DAYS = 30;
export const now = () => Date.now();

/* ---------------- families ---------------- */
export async function getFamily(id) { return id ? families().getJSON(id) : null; }
export async function saveFamily(f) { f.updatedAt = now(); await families().setJSON(f.id, f); return f; }

export async function familyByEmail(email) {
  const ref = await indexes().getJSON("email:" + normEmail(email));
  return ref ? getFamily(ref.familyId) : null;
}

export function findLearner(family, learnerId) {
  return (family?.learners || []).find((l) => l.id === learnerId) || null;
}

export function passStatus(learner, subject = "biology", t = now()) {
  const p = learner?.passes?.[subject];
  if (!p?.endsAt) return { active: false, endsAt: null, daysLeft: 0, startedAt: null };
  const ms = p.endsAt - t;
  return { active: ms > 0, endsAt: p.endsAt, startedAt: p.startedAt, daysLeft: ms > 0 ? Math.ceil(ms / DAY) : 0, trial: !!p.trial };
}

/* ---------------- free trial ---------------- */
// Phone numbers are compared on their last 9 digits, so 0977…, 260977… and +260 977… match.
export function phoneKey(phone) {
  const d = String(phone || "").replace(/\D/g, "");
  return d.length >= 9 ? d.slice(-9) : "";
}
export function startTrial(learner, t = now()) {
  for (const subject of TRIAL.subjects) {
    learner.passes[subject] = { startedAt: t, endsAt: t + TRIAL.days * DAY, trial: true,
      history: [{ at: t, days: TRIAL.days, note: "Free trial" }] };
  }
  learner.reminders = {};
  return learner;
}

export function newLearner(name, form) {
  return { id: newId(9), name: cleanText(name, 40), form: Number(form) || 1, devices: [], activeSid: null, passes: {}, reminders: {}, createdAt: now() };
}

/* Public view of a family for the parent's browser (no secrets). */
export function familyView(f) {
  return {
    id: f.id, email: f.email, parentName: f.parentName, phone: f.phone, status: f.status,
    learners: f.learners.map((l) => ({
      id: l.id, name: l.name, form: l.form, pass: passStatus(l),
      devices: l.devices.map((d) => ({ id: d.id, label: d.label, lastSeen: d.lastSeen })),
    })),
    credits: f.credits.filter((c) => !c.appliedTo).map((c) => ({ id: c.id, label: c.label, form: c.form, days: c.days, createdAt: c.createdAt })),
    payments: f.payments.slice().reverse(),
  };
}

/* ---------------- passes and credits ---------------- */
export function matchProduct(name) {
  const n = String(name || "").toLowerCase();
  return products.find((p) => n.includes(p.match.toLowerCase()) || n === p.id) || null;
}

export function applyCredit(family, creditId, learnerId, t = now()) {
  const credit = family.credits.find((c) => c.id === creditId && !c.appliedTo);
  if (!credit) fail(404, "NO_CREDIT", "That pass has already been used or doesn't exist.");
  const learner = findLearner(family, learnerId);
  if (!learner) fail(404, "NO_LEARNER", "Learner not found.");
  if (learner.form !== credit.form) fail(400, "WRONG_FORM", `This pass is for Form ${credit.form}, but ${learner.name} is in Form ${learner.form}.`);
  for (const subject of credit.subjects) {
    const p = learner.passes[subject] || (learner.passes[subject] = { history: [] });
    const base = Math.max(t, p.endsAt || 0);
    p.startedAt = p.startedAt && p.endsAt > t ? p.startedAt : t;
    p.endsAt = base + credit.days * DAY;
    p.trial = false; // a paid pass replaces the trial (any trial days left are kept)
    p.history.push({ at: t, days: credit.days, creditId: credit.id, ref: credit.ref || null });
  }
  learner.reminders = {}; // new end date, so reminders can be sent again
  credit.appliedTo = learner.id;
  credit.appliedAt = t;
  return learner;
}

/* Apply waiting credits where there is exactly one child in the right Form. */
export function autoApply(family) {
  const applied = [];
  for (const c of family.credits.filter((x) => !x.appliedTo)) {
    const eligible = family.learners.filter((l) => l.form === c.form);
    if (eligible.length === 1) { applyCredit(family, c.id, eligible[0].id); applied.push({ credit: c.label, learner: eligible[0].name }); }
  }
  return applied;
}

export async function addDays(family, learnerId, days, note, subject = "biology") {
  const learner = findLearner(family, learnerId);
  if (!learner) fail(404, "NO_LEARNER", "Learner not found.");
  const t = now();
  const p = learner.passes[subject] || (learner.passes[subject] = { history: [] });
  const base = days > 0 ? Math.max(t, p.endsAt || 0) : (p.endsAt || t);
  p.startedAt = p.startedAt || t;
  p.endsAt = base + days * DAY;
  p.history.push({ at: t, days, note: cleanText(note, 120) || "Adjusted by admin" });
  learner.reminders = {};
  return learner;
}

/* ---------------- sales (from Selar via Zapier, or entered by admin) ---------------- */
export async function recordSale(sale, { siteUrl, source = "selar" }) {
  const email = normEmail(sale.email);
  const ref = cleanText(sale.reference || sale.ref || sale.order_id || "", 80) || null;
  const productName = cleanText(sale.product || sale.product_name || "", 120);
  const entry = { at: now(), source, email, phone: cleanText(sale.phone, 30), name: cleanText(sale.name, 60), product: productName, ref,
    amount: sale.amount ?? null, currency: cleanText(sale.currency, 8) || null };

  if (!email || !email.includes("@")) { entry.result = "rejected: no buyer email"; await logSale(entry); fail(400, "NO_EMAIL", "The sale has no buyer email."); }
  if (ref) {
    const seen = await indexes().getJSON("sale:" + ref);
    if (seen) { entry.result = "duplicate (already processed)"; await logSale(entry); return { status: "duplicate", familyId: seen.familyId }; }
  }
  const product = matchProduct(productName);
  if (!product) { entry.result = "rejected: product not recognised"; await logSale(entry); fail(422, "UNKNOWN_PRODUCT", `No product in config/products.mjs matches "${productName}".`); }

  let family = await familyByEmail(email);
  let setupUrl = null;
  if (!family) {
    family = { id: newId(10), email, parentName: entry.name, phone: entry.phone, status: "pending", passwordHash: null, pinHash: null,
      learners: [], credits: [], payments: [], createdAt: now() };
    await indexes().setJSON("email:" + email, { familyId: family.id });
  }
  family.credits.push({ id: newId(8), productId: product.id, label: product.label, form: product.form, subjects: product.subjects,
    days: product.days, ref, createdAt: now(), appliedTo: null });
  family.payments.push({ at: now(), product: product.label, ref, amount: entry.amount, currency: entry.currency, source });
  if (!family.phone && entry.phone) family.phone = entry.phone;
  const applied = family.status === "active" ? autoApply(family) : [];
  if (family.status !== "active") setupUrl = await setupLink(family, siteUrl);
  await saveFamily(family);
  if (ref) await indexes().setJSON("sale:" + ref, { familyId: family.id, at: now() });

  entry.result = family.status === "active"
    ? (applied.length ? `added to ${applied.map((a) => a.learner).join(", ")}` : "credit waiting for parent to choose a child")
    : "new family: set-up link created";
  entry.familyId = family.id;
  await logSale(entry);
  return { status: "credited", familyId: family.id, newFamily: family.status !== "active", setupUrl, applied,
    parentName: family.parentName || entry.name, email };
}

async function logSale(entry) {
  await logs().setJSON(`sale/${String(entry.at).padStart(15, "0")}-${newId(4)}`, entry);
}

export async function setupLink(family, siteUrl) {
  const token = newId(18);
  await indexes().setJSON("setup:" + token, { familyId: family.id, createdAt: now() });
  family.setupToken = token;
  return `${siteUrl}/#setup/${token}`;
}

export async function resetLink(family, siteUrl) {
  const token = newId(18);
  await indexes().setJSON("reset:" + token, { familyId: family.id, createdAt: now(), expires: now() + DAY });
  return `${siteUrl}/#reset/${token}`;
}

/* ---------------- sessions ---------------- */
export async function createSession(familyId) {
  const s = { sid: newId(24), familyId, role: null, learnerId: null, pinOk: false, createdAt: now(), lastSeen: now() };
  await sessions().setJSON(s.sid, s);
  return s;
}
export async function getSession(sid) {
  if (!sid) return null;
  const s = await sessions().getJSON(sid);
  if (!s) return null;
  if (now() - s.lastSeen > SESSION_IDLE_DAYS * DAY) { await sessions().del(sid); return null; }
  if (now() - s.lastSeen > 3600_000) { s.lastSeen = now(); await sessions().setJSON(sid, s); }
  return s;
}
export const saveSession = (s) => sessions().setJSON(s.sid, s);
export const endSession = (sid) => sid && sessions().del(sid);

/* Learner chooses their profile on this device: device limit and one active session. */
export function claimDevice(family, learner, session, deviceId, label) {
  const id = cleanText(deviceId, 64);
  if (!id) fail(400, "NO_DEVICE", "This browser could not be identified. Refresh and try again.");
  let d = learner.devices.find((x) => x.id === id);
  if (!d) {
    if (learner.devices.length >= MAX_DEVICES)
      fail(403, "DEVICE_LIMIT", `${learner.name}'s pass is already used on ${MAX_DEVICES} devices. A parent can remove one in Parent > Pass.`);
    d = { id, label: cleanText(label, 60) || "Browser", addedAt: now(), lastSeen: now() };
    learner.devices.push(d);
  }
  d.lastSeen = now();
  learner.activeSid = session.sid;
}

/* ---------------- progress ---------------- */
export async function getProgress(learnerId) {
  return (await progress().getJSON(learnerId)) || { comps: {}, log: [] };
}
export async function saveProgress(learnerId, p) { await progress().setJSON(learnerId, p); }
export function compProgress(p, code) {
  return p.comps[code] || (p.comps[code] = { lesson: false, video: false, prac: false, attempts: [], best: null, current: { mcq: {} } });
}
export function logActivity(p, text) {
  p.log.unshift({ at: now(), text: cleanText(text, 120) });
  p.log = p.log.slice(0, 40);
}
export const MASTERY = 0.7;
export function mastery(cp, total) {
  if (cp?.best == null || !total) return null;
  const r = cp.best / total;
  return r >= MASTERY ? "Mastered" : r >= 0.5 ? "Nearly there" : "Keep practising";
}

export { hashSecret };
