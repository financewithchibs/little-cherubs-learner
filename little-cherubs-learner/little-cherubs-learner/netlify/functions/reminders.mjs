// Runs once a day. Sends renewal reminders 10 days and 2 days before a pass
// ends, and once on the day it ends. Free trials get the 2-day and the
// "ended" messages only, inviting the parent to buy the 90-Day Access. Messages go to NOTIFY_WEBHOOK_URL
// (a Zapier "Catch Hook"), which sends the email and WhatsApp message.

import { families, logs } from "../../lib/store.mjs";
import { passStatus, saveFamily } from "../../lib/core.mjs";
import { DEFAULT_RENEW_URL, TRIAL } from "../../config/products.mjs";

const STAGES = [ { key: "d10", when: (p) => !p.trial && p.active && p.daysLeft <= 10 && p.daysLeft > 2 },
                 { key: "d2", when: (p) => p.active && p.daysLeft <= 2 },
                 { key: "ended", when: (p) => !p.active && p.endsAt && Date.now() - p.endsAt < 3 * 86400000 } ];

export async function runReminders({ send = defaultSend } = {}) {
  const ids = await families().list("");
  let sent = 0;
  for (const id of ids) {
    const f = await families().getJSON(id);
    if (!f || f.status !== "active") continue;
    let changed = false;
    for (const l of f.learners) {
      const p = passStatus(l);
      if (!p.endsAt) continue;
      l.reminders = l.reminders || {};
      const stage = STAGES.find((s) => s.when(p));
      if (!stage || l.reminders[stage.key]) continue;
      const url = process.env.RENEW_URL || DEFAULT_RENEW_URL;
      const payload = p.trial ? {
        type: stage.key === "ended" ? "trial_ended" : "trial_ending",
        email: f.email, phone: f.phone, parentName: f.parentName, learnerName: l.name, form: l.form,
        daysLeft: p.daysLeft, endsAt: new Date(p.endsAt).toISOString().slice(0, 10), renewUrl: url,
        message: stage.key === "ended"
          ? `Hello ${f.parentName}. ${l.name}'s ${TRIAL.days}-day free trial of Little Cherubs Learner has ended. ${l.name}'s progress is saved. Buy the 90-Day Access to continue: ${url}`
          : `Hello ${f.parentName}. ${l.name}'s free trial of Little Cherubs Learner ends in ${p.daysLeft} day${p.daysLeft === 1 ? "" : "s"}. Buy the 90-Day Access to keep learning without a break: ${url}`,
      } : {
        type: stage.key === "ended" ? "pass_ended" : "pass_ending",
        email: f.email, phone: f.phone, parentName: f.parentName, learnerName: l.name, form: l.form,
        daysLeft: p.daysLeft, endsAt: new Date(p.endsAt).toISOString().slice(0, 10),
        renewUrl: process.env.RENEW_URL || DEFAULT_RENEW_URL,
        message: stage.key === "ended"
          ? `Hello ${f.parentName}. ${l.name}'s Little Cherubs Learner pass has ended. ${l.name}'s progress is saved. Renew to continue: ${process.env.RENEW_URL || DEFAULT_RENEW_URL}`
          : `Hello ${f.parentName}. ${l.name}'s Little Cherubs Learner pass ends in ${p.daysLeft} day${p.daysLeft === 1 ? "" : "s"}. Renew now to avoid a break in learning: ${process.env.RENEW_URL || DEFAULT_RENEW_URL}`,
      };
      const ok = await send(payload);
      await logs().setJSON(`reminder/${String(Date.now()).padStart(15, "0")}-${l.id}`, { at: Date.now(), ...payload, delivered: ok });
      if (ok) { l.reminders[stage.key] = Date.now(); changed = true; sent++; }
    }
    if (changed) await saveFamily(f);
  }
  return sent;
}

async function defaultSend(payload) {
  const url = process.env.NOTIFY_WEBHOOK_URL;
  if (!url) return false;
  try {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    return r.ok;
  } catch { return false; }
}

export default async () => {
  const sent = await runReminders();
  console.log(`Reminders sent: ${sent}`);
};

export const config = { schedule: "0 6 * * *" }; // 06:00 UTC = 08:00 in Zambia
