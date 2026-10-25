// Little Cherubs Learner: the parent and learner web app.
// Screens are drawn from the server's answers; nothing is stored on the phone
// except a device ID and two display preferences.

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtD = (t) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const fmtShort = (t) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const pref = {
  get(k, d) { try { const v = localStorage.getItem("lcl_" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("lcl_" + k, JSON.stringify(v)); } catch {} },
};

/* ---------- icons ---------- */
const I = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
  learn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21a2 2 0 0 1 2-2h13"/></svg>',
  signal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 20v-3M9 20v-7M14 20V9M19 20V4"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M8.5 11h7M8.5 14.5h4"/></svg>',
  swap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0 1 10.5-4"/><path d="M16 14h6m-2-2 2 2-2 2M22 20h-6m2-2-2 2 2 2"/></svg>',
  card: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/></svg>',
  back: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  book: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H2zM22 5h-7a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h8z"/></svg>',
  video: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="15" height="14" rx="2"/><path d="m17 10 5-3v10l-5-3"/></svg>',
  flask: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3"/><path d="M7 15h10"/></svg>',
  quiz: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01"/></svg>',
  tick: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>',
  lock: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  chev: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m9 6 6 6-6 6"/></svg>',
};

/* ---------- server calls ---------- */
class ApiError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }
async function api(method, path, body) {
  let r;
  try {
    r = await fetch(path, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined, credentials: "same-origin" });
  } catch { throw new ApiError(0, "OFFLINE", "No connection. Check your data or Wi-Fi and try again."); }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, data.error, data.message || "Something went wrong. Try again.");
  return data;
}

function deviceId() {
  let id = pref.get("device", null);
  if (!id) { id = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()); pref.set("device", id); }
  return id;
}
function deviceLabel() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? "Android phone" : "Android tablet";
  if (/Windows/.test(ua)) return "Windows computer";
  if (/Mac OS X/.test(ua)) return "Mac";
  if (/CrOS/.test(ua)) return "Chromebook";
  return "Browser";
}

/* ---------- app state ---------- */
let me = null;              // answer from /api/me
let route = { name: "", arg: "" };
const cache = { topic: {} };  // topic content per code, for this visit only
const practice = {};          // per code: { qi, text:{}, marks:{}, revealed:{}, mcq:{} }

// "8/30 (27%)": marks plus percentage, so learners see how close they are to 70% mastery.
function score(got, max) { return max ? `${got}/${max} (${Math.round((got / max) * 100)}%)` : `${got}`; }
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2600); }
function go(hash) { if (location.hash === "#" + hash) render(); else location.hash = hash; }
function parseHash() {
  const h = location.hash.replace(/^#\/?/, "");
  const [name, ...rest] = h.split("/");
  return { name: name || "", arg: decodeURIComponent(rest.join("/")) };
}

/* ---------- shared pieces ---------- */
function wordmark() {
  return `<div class="brand"><img src="/assets/emblem.png" alt="" width="40" height="40"><span class="wm"><small>LITTLE</small><b>Cherubs</b><i>Learner</i></span></div>`;
}
// Small round logo for headers that also show a page title. Tapping it goes home.
function mark(to = "home") {
  return `<button class="mark" data-go="${esc(to)}" aria-label="Little Cherubs home"><img src="/assets/emblem.png" alt="Little Cherubs" width="36" height="36"><span class="wm"><small>LITTLE</small><b>Cherubs</b></span></button>`;
}
// Header for signed-out screens: the full wordmark only.
function brandHeader() { return `<header class="top"><div class="wrap">${wordmark()}</div></header>`; }
function backHeader(title, code, to) {
  return `<header class="top"><div class="wrap"><button class="back" data-go="${esc(to)}" aria-label="Back">${I.back}</button><div class="top-title">${code ? `<div class="code">${esc(code)}</div>` : ""}<b>${esc(title)}</b></div>${mark()}</div></header>`;
}
const learnerObj = () => me?.family?.learners?.find((l) => l.id === me.session.learnerId);
const initial = (n) => esc(String(n || "?").trim().charAt(0).toUpperCase());
function errBox(e) { return `<div class="err" role="alert">${esc(e.message || e)}</div>`; }

function setTabs(kind) {
  const nav = document.querySelector(".tabs");
  if (!kind) { nav.hidden = true; return; }
  nav.hidden = false;
  const sets = {
    learner: [["home", "Home", I.home], ["learn", "Learn", I.learn], ["data", "Data", I.signal]],
    parent: [["parent", "Overview", I.home], ["report", "Report", I.chart], ["pass", "Pass", I.card]],
  };
  const map = { topic: "learn", lesson: "learn", video: "learn", practical: "learn", practice: "learn", results: "learn" };
  const cur = map[route.name] || route.name;
  // Feedback remembers the page it was opened from; Switch goes back to "Who's using the app?".
  const from = route.name === "feedback" ? route.arg : `${route.name}/${route.arg || ""}`.replace(/\/$/, "");
  $("#tabs").innerHTML = sets[kind].map(([k, l, ic]) => `<button class="tab" data-go="${k}" ${cur === k ? 'aria-current="page"' : ""}>${ic}${l}</button>`).join("")
    + `<button class="tab" data-go="feedback/${encodeURIComponent(from)}" ${cur === "feedback" ? 'aria-current="page"' : ""}>${I.chat}Feedback</button>`
    + `<button class="tab" data-act="switch">${I.swap}${kind === "parent" ? "Switch" : "Switch profile"}</button>`;
}

/* ===================================================================== */
/* Signed-out screens                                                     */
/* ===================================================================== */
function SignIn() {
  return brandHeader() + `<main class="wrap welcome">
    <img class="logo" src="/assets/logo.png" alt="Little Cherubs logo">
    <div class="stack-s center"><h1>Little Cherubs Learner</h1><p class="muted">Lessons, videos and practice that follow the CDC syllabus, Forms 1 to 4.</p></div>
    <form class="card stack" data-form="signin">
      <div class="field"><label for="em">Email address</label><input id="em" name="email" type="email" autocomplete="username" required></div>
      <div class="field"><label for="pw">Password</label><input id="pw" name="password" type="password" autocomplete="current-password" required></div>
      <div id="formerr"></div>
      <button class="btn block" type="submit">Sign in</button>
      <button class="linkbtn" type="button" data-go="forgot">Forgotten your password?</button>
    </form>
    <div class="box green stack-s"><b>New to Little Cherubs Learner?</b>
      <p style="font-size:.92rem">Try everything free for ${me?.trial?.days || 7} days: lessons, videos, practicals and practice questions. No payment needed to start.</p>
      <button class="btn" data-go="trial">Start your ${me?.trial?.days || 7}-day free trial ${I.chev}</button></div>
    <div class="box stack-s"><b>Ready to buy?</b>
      <p style="font-size:.92rem">Buy the 90-Day Access on Selar. Your set-up link arrives by email within minutes of paying.</p>
      <a class="btn alt" href="${esc(me?.renewUrl || "#")}" target="_blank" rel="noopener">Buy the 90-Day Access</a></div>
  </main>`;
}

function Trial() {
  const tr = me?.trial || { days: 7, forms: [1] };
  return brandHeader() + `<main class="wrap welcome">
    <img class="logo" src="/assets/logo.png" alt="Little Cherubs logo" style="width:110px;height:110px">
    <div class="stack-s center"><h1>Start your ${tr.days}-day free trial</h1><p class="muted">Full access for ${tr.days} days. No payment needed. After the trial, buy the 90-Day Access to carry on, and your child keeps all their progress.</p></div>
    <form class="card stack" data-form="trial">
      <h3>You, the parent</h3>
      <div class="field"><label for="tn">Your name</label><input id="tn" name="parentName" autocomplete="name" required></div>
      <div class="field"><label for="te">Email address</label><input id="te" name="email" type="email" autocomplete="email" required>
        <span class="muted" style="font-size:.85rem">Use this same email when you buy on Selar, so the 90 days are added to this account.</span></div>
      <div class="field"><label for="tp">WhatsApp number</label><input id="tp" name="phone" inputmode="tel" autocomplete="tel" placeholder="e.g. 0977 123 456" required>
        <span class="muted" style="font-size:.85rem">We send a reminder before the trial ends. One free trial per number.</span></div>
      <div class="field"><label for="tpw">Choose a password (8 or more characters)</label><input id="tpw" name="password" type="password" minlength="8" autocomplete="new-password" required></div>
      <div class="field"><label for="tpin">Choose a 4-digit parent PIN</label><input id="tpin" name="pin" inputmode="numeric" pattern="\\d{4}" maxlength="4" required>
        <span class="muted" style="font-size:.85rem">The PIN keeps the parent area private from your child.</span></div>
      <h3>Your child</h3>
      <div class="field"><label for="tl">Child's first name</label><input id="tl" name="learnerName" required></div>
      <div class="field"><label for="tf">Form</label><select id="tf" name="form">${tr.forms.map((f) => `<option value="${f}">Form ${f}</option>`).join("")}</select></div>
      <div id="formerr"></div>
      <button class="btn block" type="submit">Start free trial</button>
      <button class="linkbtn" type="button" data-go="signin">I already have an account</button>
    </form>
  </main>`;
}

function Forgot() {
  return brandHeader() + `<main class="wrap welcome">
    <div class="stack-s center"><h1>Reset your password</h1><p class="muted">Enter the email you used to buy your pass. We'll send a link to choose a new password.</p></div>
    <form class="card stack" data-form="forgot">
      <div class="field"><label for="fem">Email address</label><input id="fem" name="email" type="email" required></div>
      <div id="formerr"></div>
      <button class="btn block" type="submit">Send reset link</button>
      <button class="linkbtn" type="button" data-go="signin">Back to sign in</button>
    </form>
  </main>`;
}

let setupInfo = null;
async function SetUp(token) {
  try { setupInfo = await api("GET", "/api/setup/" + encodeURIComponent(token)); }
  catch (e) { return brandHeader() + `<main class="wrap welcome"><div class="stack-s center"><h1>Set-up link</h1></div>${errBox(e)}<button class="btn" data-go="signin">Go to sign in</button></main>`; }
  const form = setupInfo.credits[0]?.form || 1;
  return brandHeader() + `<main class="wrap welcome">
    <img class="logo" src="/assets/logo.png" alt="Little Cherubs logo" style="width:110px;height:110px">
    <div class="stack-s center"><h1>Welcome to Little Cherubs Learner</h1><p class="muted">Thank you for your payment. Set up your family account in one step.</p></div>
    ${setupInfo.credits.length ? `<div class="ok-note">Paid: <b>${esc(setupInfo.credits.map((c) => c.label).join(", "))}</b></div>` : ""}
    <form class="card stack" data-form="setup" data-token="${esc(token)}">
      <h3>You, the parent</h3>
      <div class="field"><label>Email</label><input value="${esc(setupInfo.email)}" disabled></div>
      <div class="field"><label for="sn">Your name</label><input id="sn" name="parentName" value="${esc(setupInfo.parentName)}" required></div>
      <div class="field"><label for="sp">WhatsApp number</label><input id="sp" name="phone" inputmode="tel" value="${esc(setupInfo.phone)}" placeholder="e.g. 0977 123 456"></div>
      <div class="field"><label for="spw">Choose a password (8 or more characters)</label><input id="spw" name="password" type="password" minlength="8" autocomplete="new-password" required></div>
      <div class="field"><label for="spin">Choose a 4-digit parent PIN</label><input id="spin" name="pin" inputmode="numeric" pattern="\\d{4}" maxlength="4" required>
        <span class="muted" style="font-size:.85rem">The PIN keeps the parent area private from your child.</span></div>
      <h3>Your child</h3>
      <div class="field"><label for="sl">Child's first name</label><input id="sl" name="learnerName" required></div>
      <div class="field"><label for="sf">Form</label><select id="sf" name="form">${[1, 2, 3, 4].map((f) => `<option value="${f}" ${f === form ? "selected" : ""}>Form ${f}</option>`).join("")}</select></div>
      <div id="formerr"></div>
      <button class="btn block" type="submit">Create account</button>
    </form>
  </main>`;
}

function Reset(token) {
  return brandHeader() + `<main class="wrap welcome">
    <div class="stack-s center"><h1>Choose a new password</h1></div>
    <form class="card stack" data-form="reset" data-token="${esc(token)}">
      <div class="field"><label for="rpw">New password (8 or more characters)</label><input id="rpw" name="password" type="password" minlength="8" autocomplete="new-password" required></div>
      <div class="field"><label for="rpin">New parent PIN (optional, 4 digits)</label><input id="rpin" name="pin" inputmode="numeric" pattern="\\d{4}" maxlength="4"></div>
      <div id="formerr"></div>
      <button class="btn block" type="submit">Save and sign in</button>
    </form>
  </main>`;
}

/* ===================================================================== */
/* Who's using the app?                                                   */
/* ===================================================================== */
let pinFor = false;
function Who() {
  const f = me.family;
  return brandHeader() + `<main class="wrap welcome">
    <div class="stack-s center"><span class="eyebrow">${esc(f.parentName)}'s family</span><h1>Who's using the app?</h1></div>
    <div class="tiles">
      ${f.learners.map((l) => `<button class="tile" data-act="as-learner" data-id="${esc(l.id)}"><span class="av kid">${initial(l.name)}</span><b>${esc(l.name)}</b><span class="pill">Form ${l.form}</span></button>`).join("")}
      <button class="tile" data-act="pin-show"><span class="av">${initial(f.parentName)}</span><b>${esc(f.parentName)}</b><span class="pill">Parent · PIN</span></button>
    </div>
    ${pinFor ? `<form class="card stack" data-form="pin"><h3 class="center">Enter your parent PIN</h3>
      <div class="pinrow">${[0, 1, 2, 3].map((i) => `<input inputmode="numeric" maxlength="1" aria-label="PIN digit ${i + 1}" data-pin="${i}" autocomplete="off">`).join("")}</div>
      <div id="formerr"></div><button class="btn block" type="submit">Open parent area</button>
      <button class="linkbtn" type="button" data-act="forgotpin">Forgotten your PIN?</button></form>` : ""}
    <div id="whoerr"></div>
    ${f.learners.length ? `<p class="muted center" style="font-size:.85rem">To sign out of this device, open the parent area.</p>` : `<button class="btn alt" data-act="signout">Sign out</button>`}
  </main>`;
}

/* ===================================================================== */
/* Learner screens                                                        */
/* ===================================================================== */
let homeData = null;
async function loadHome() { homeData = await api("GET", "/api/learner/home"); return homeData; }

function learnerHeader() {
  const l = learnerObj();
  const saver = pref.get("dataSaver", true);
  return `<header class="top"><div class="wrap">${wordmark()}<span class="pill ${saver ? "on" : ""}">Data saver ${saver ? "on" : "off"}</span><button class="av kid sm" data-act="switch" aria-label="Switch profile">${initial(l?.name)}</button></div></header>`;
}

// "Send feedback" link shown at the foot of key screens; it remembers the page it came from.
function feedbackButton() {
  const from = encodeURIComponent(`${route.name}/${route.arg || ""}`.replace(/\/$/, ""));
  return `<section class="box stack-s"><b>Tell us what you think</b><p style="font-size:.92rem">Little Cherubs Learner is new. Your ideas help us make it better.</p><button class="btn alt" data-go="feedback/${from}">Send feedback ${I.chev}</button></section>`;
}
let feedbackSent = false;
function Feedback(from) {
  const back = from || (me.session.role === "parent" ? "parent" : "home");
  const sent = feedbackSent; feedbackSent = false;
  return backHeader("Send feedback", "", back) + `<main class="wrap stack">
    ${sent ? `<div class="box green stack-s"><h2>Thank you!</h2><p>We read every message. Your feedback helps us improve Little Cherubs Learner for every family.</p><button class="btn" data-go="${esc(back)}">Back ${I.chev}</button></div>`
    : `<form class="card stack" data-form="feedback" data-from="${esc(back)}">
      <fieldset class="rate"><legend><b>How would you rate Little Cherubs Learner so far?</b></legend>
        <div class="rate-row">${[[1, "Poor"], [2, "Fair"], [3, "Good"], [4, "Very good"], [5, "Excellent"]].map(([n, l]) => `<label><input type="radio" name="rating" value="${n}"><span><b>${n}</b>${l}</span></label>`).join("")}</div>
      </fieldset>
      <div class="field"><label for="fbt">What did you like, and what should we improve?</label>
        <textarea id="fbt" name="text" rows="5" maxlength="1000" placeholder="For example: the lessons were clear, but the video was slow to start on my phone."></textarea></div>
      <div id="formerr"></div>
      <button class="btn block" type="submit">Send feedback</button>
      <p class="muted" style="font-size:.85rem">We see your name and the page you came from, so we can follow up if needed.</p>
    </form>`}
  </main>`;
}

// The main "next step" card on Home. A competence with all 4 parts done but not
// yet mastered asks for a practice retake instead of a vague "Continue".
function heroCard(d, n) {
  const retake = n.parts >= 4 && !n.mastered;
  const label = n.mastered ? "Review" : retake ? "Retake practice questions" : n.parts ? "Continue learning" : "Start learning";
  const target = retake ? `practice/${n.code}` : `topic/${n.code}`;
  const pill = n.mastered ? "Mastered" : retake ? "4/4 done · not yet mastered" : `${n.parts}/4 done`;
  return `<section class="hero">
      <div class="row"><span class="code">BIO-F${d.learner.form}-${esc(n.code)}</span><span class="grow"></span><span class="pill" style="background:rgba(255,255,255,.16);color:inherit">${pill}</span></div>
      <span class="eyebrow" style="color:inherit;opacity:.85">Topic: ${esc(n.topic || "")}</span>
      <h2>${esc(n.title)}</h2>
      <div class="bar" aria-label="${n.parts} of 4 parts done"><i style="width:${n.parts * 25}%"></i></div>
      ${retake ? `<p style="margin:0;font-size:.92rem;opacity:.9">You have done every part. Score 70% or more in practice questions to master this.${n.best != null && n.total ? ` Your best so far: ${score(n.best, n.total)}.` : ""}</p>` : ""}
      <button class="btn light" data-go="${esc(target)}">${label} ${I.chev}</button>
      ${retake ? `<button class="btn link" data-go="topic/${esc(n.code)}" style="color:inherit">Go over the topic first</button>` : ""}
    </section>`;
}

// Other started competences, the next new one, and a way to pick any competence.
function moreToLearn(d) {
  const f = d.learner.form;
  const row = (x, tag) => `<button class="item" data-go="topic/${esc(x.code)}"><span class="dot ${x.parts ? "on" : ""}">${x.parts}/4</span><span class="grow"><span class="code">BIO-F${f}-${esc(x.code)} · ${esc(x.topic || "")}</span><span class="t">${esc(x.title)}</span></span>${tag ? `<span class="pill">${tag}</span>` : ""}${I.chev}</button>`;
  const rows = (d.inProgress || []).map((x) => row(x, x.parts >= 4 ? "Retake" : "")).concat(d.nextNew ? [row(d.nextNew, "New")] : []);
  return `<section class="stack-s">
      ${rows.length ? `<h3>${(d.inProgress || []).length ? "Pick up where you left off" : "Up next"}</h3><div class="list">${rows.join("")}</div>` : ""}
      <button class="btn alt block" data-go="learn">Choose another competence ${I.chev}</button>
    </section>`;
}

async function Home() {
  const d = await loadHome();
  if (!d.pass.active) return go("ended");
  const n = d.next;
  const days = d.pass.daysLeft;
  const all = d.course.flatMap((c) => c.competences);
  const mastered = all.filter((x) => x.mastered).length;
  const open = all.filter((x) => x.available).length;
  const soon = all.filter((x) => !x.available).slice(0, 3);
  const hr = new Date().getHours();
  return learnerHeader() + `<main class="wrap stack">
    <div class="stack-s"><span class="eyebrow">${fmtD(Date.now())} · Form ${d.learner.form} ${esc(d.subject)}</span><h1>Good ${hr < 12 ? "morning" : hr < 17 ? "afternoon" : "evening"}, ${esc(d.learner.name)}</h1></div>
    ${d.pass.trial ? `<div class="box green stack-s"><b>Free trial: ${plural(days, "day")} left (ends ${fmtD(d.pass.endsAt)}).</b><p style="font-size:.92rem">Enjoy everything during your trial. To keep learning after it ends, ask your parent to buy the 90-Day Access. Your progress is always saved.</p><a class="btn alt" href="${esc(d.renewUrl)}" target="_blank" rel="noopener">Buy the 90-Day Access</a></div>`
    : days <= 10 ? `<div class="warn"><b>Your pass ends in ${plural(days, "day")} (${fmtD(d.pass.endsAt)}).</b><p style="font-size:.92rem">Ask your parent to renew so your learning carries on without a break. Your progress is always saved.</p></div>` : ""}
    ${n ? heroCard(d, n) : `<div class="box">Your first topic opens soon. Check back shortly.</div>`}
    ${n ? moreToLearn(d) : ""}
    <div class="stats">
      <div class="stat"><b>${mastered}<span style="font-size:.9rem;color:var(--muted)">/${all.length}</span></b><span>competences mastered</span></div>
      <div class="stat"><b>${open}</b><span>competences open now</span></div>
      <div class="stat"><b style="font-variant-numeric:tabular-nums">${days}</b><span>days left on pass</span></div>
    </div>
    ${soon.length ? `<section class="stack-s"><h3>Coming soon</h3><div class="list">${soon.map((x) => `<div class="item locked"><span class="dot">${I.lock}</span><span class="grow"><span class="code">BIO-F${d.learner.form}-${esc(x.code)} · ${esc(x.topic || "")}</span><span class="t">${esc(x.title)}</span></span><span class="pill">Soon</span></div>`).join("")}</div></section>` : ""}
    ${feedbackButton()}
  </main>`;
}

async function Learn() {
  const d = await loadHome();
  if (!d.pass.active) return go("ended");
  const total = d.course.reduce((s, c) => s + c.competences.length, 0);
  return `<header class="top"><div class="wrap">${mark()}<div class="top-title"><div class="code">Form ${d.learner.form} · ${d.course.length} concepts · ${total} competences</div><b>${esc(d.subject)} course map</b></div></div></header>
  <main class="wrap stack">${d.course.map((c) => `<section class="concept">
    <div class="concept-h"><span class="num">${c.no}</span><h3>${esc(c.name)}</h3></div>
    <div class="list">${c.competences.map((x) => x.available
      ? `<button class="item" data-go="topic/${esc(x.code)}"><span class="dot ${x.mastered ? "done" : x.parts ? "on" : ""}">${x.mastered ? I.tick : x.parts + "/4"}</span><span class="grow"><span class="code">BIO-F${d.learner.form}-${esc(x.code)} · ${esc(x.topic || "")}</span><span class="t">${esc(x.title)}</span></span>${I.chev}</button>`
      : `<div class="item locked"><span class="dot">${I.lock}</span><span class="grow"><span class="code">BIO-F${d.learner.form}-${esc(x.code)} · ${esc(x.topic || "")}</span><span class="t">${esc(x.title)}</span></span></div>`).join("")}</div>
  </section>`).join("")}</main>`;
}

async function loadTopic(code, fresh = false) {
  if (!cache.topic[code] || fresh) cache.topic[code] = await api("GET", "/api/learner/topic/" + encodeURIComponent(code));
  return cache.topic[code];
}

async function Topic(code) {
  const t = await loadTopic(code, true);
  const p = t.progress, c = t.competence;
  const hasMedia = Object.keys(t.media).length > 0;
  const part = (to, ic, title, sub, done, extra) => `<button class="part" data-go="${to}/${esc(code)}"><span class="ic">${ic}</span><b>${title}</b><small>${sub}</small><span class="st">${done ? `<span class="pill on">${I.tick} ${extra || "Done"}</span>` : `<span class="pill">${extra || "Not started"}</span>`}</span></button>`;
  const smallest = hasMedia ? Math.min(...Object.values(t.media).map((m) => m.size)) / 1048576 : 0;
  return backHeader(c.topic, `BIO-F${c.form}-${code}`, "learn") + `<main class="wrap stack">
    <div class="stack-s"><span class="eyebrow">Concept ${c.concept} · ${esc(c.conceptName)}</span><span class="eyebrow" style="margin-top:6px">Topic</span><h1>${esc(c.topic)}</h1></div>
    <div class="box green"><dl class="kv comp">
      <dt>Specific Competence</dt><dd>${esc(c.title)}</dd>
      <dt>Competence ID</dt><dd class="code">BIO-F${c.form}-${esc(code)}</dd>
      <dt>Expected Standard</dt><dd>${esc(c.standard)}</dd>
    </dl></div>
    <div class="parts">
      ${part("lesson", I.book, "Lesson", "Explanations, worked examples and a quick check", p.lesson)}
      ${part("video", I.video, "Video", hasMedia ? `${esc(t.content.videoTitle || "Watch")} · from ${smallest.toFixed(1)} MB` : "Video coming soon · script available", p.video)}
      ${part("practical", I.flask, "Practical", "Hands-on activity, no lab needed", p.prac)}
      ${part("practice", I.quiz, "Practice Questions", `${t.content.questions.length} questions · ${t.content.totalMarks} marks`, p.best != null, p.best != null ? `Best ${score(p.best, t.content.totalMarks)}` : "")}
    </div>
    ${p.mastery ? `<div class="box ${p.mastery === "Mastered" ? "green" : "cop"}"><b>${p.mastery}</b><p class="muted" style="font-size:.9rem">Mastered means 70% or more in practice questions.</p></div>`
      : `<p class="muted" style="font-size:.9rem">Do the lesson first, then the practice questions. You master a competence at 70%.</p>`}
  </main>`;
}

async function Lesson(code) {
  const t = await loadTopic(code);
  return backHeader("Lesson", `BIO-F${t.competence.form}-${code}`, "topic/" + code) + `<main class="wrap stack">
    <article class="content">${t.content.lessonHtml}</article>
    <button class="btn block" data-act="done" data-part="lesson" data-code="${esc(code)}" ${t.progress.lesson ? "disabled" : ""}>${t.progress.lesson ? "Lesson complete" : "Mark lesson complete"}</button>
    ${t.progress.lesson ? `<button class="btn alt block" data-go="practice/${esc(code)}">Practise questions now ${I.chev}</button>` : ""}
  </main>`;
}

const QUAL = { "240": ["Data saver", "240p"], "360": ["Phone", "360p"], audio: ["Audio only", "MP3"] };
let wmTimer = null;
async function Video(code) {
  const t = await loadTopic(code);
  const avail = Object.keys(QUAL).filter((q) => t.media[q]);
  let q = pref.get("quality", pref.get("dataSaver", true) ? "240" : "360");
  if (!avail.includes(q)) q = avail.includes("240") ? "240" : avail[0];
  const scenes = t.content.scenes || [];
  const src = q ? `/api/media/${encodeURIComponent(code)}/${q}` : "";
  return backHeader(t.content.videoTitle ? `Video: ${t.content.videoTitle}` : "Video", `BIO-F${t.competence.form}-${code}`, "topic/" + code) + `<main class="wrap stack">
    ${avail.length ? `<div class="toggle" role="group" aria-label="Quality">${avail.map((k) => `<button data-act="quality" data-q="${k}" data-code="${esc(code)}" aria-pressed="${k === q}">${QUAL[k][0]}<br><span class="code">${(t.media[k].size / 1048576).toFixed(1)} MB</span></button>`).join("")}</div>
      ${q === "audio"
        ? `<div class="player audio"><div class="stack-s"><span class="code" style="color:inherit;opacity:.8">Audio only · saves data</span><div class="cap">${esc(t.content.videoTitle || t.competence.title)}</div></div><audio id="media" controls preload="metadata" src="${src}" style="width:100%"></audio></div>`
        : `<div class="vwrap"><video id="media" controls playsinline preload="metadata" controlslist="nodownload noplaybackrate" disablepictureinpicture src="${src}"></video><span class="wmk" id="wmk">${esc(t.learnerName)} · Little Cherubs</span></div>`}`
      : `<div class="box"><b>The video for this topic is being made.</b><p style="font-size:.92rem">Read the script below in the meantime. It covers the same ideas.</p></div>`}
    ${scenes.length ? `<section class="stack-s"><h3>In this video</h3>${scenes.map((s) => `<div class="scene"><time>${esc(s.start)}</time><span><b>${esc(s.title)}</b></span></div>`).join("")}</section>` : ""}
    ${t.content.scriptHtml ? `<details class="script" ${avail.length ? "" : "open"}><summary>Read the script</summary><div class="content" style="margin-top:10px">${t.content.scriptHtml}</div></details>` : ""}
    <button class="btn block" data-act="done" data-part="video" data-code="${esc(code)}" ${t.progress.video ? "disabled" : ""}>${t.progress.video ? "Watched" : "Mark as watched"}</button>
  </main>`;
}
function bindVideo(code) {
  clearInterval(wmTimer);
  const el = $("#media");
  if (!el) return;
  el.addEventListener("ended", () => markDone(code, "video", "Video finished", { auto: true }));
  el.addEventListener("contextmenu", (e) => e.preventDefault());
  const w = $("#wmk");
  if (w) {
    const move = () => { w.style.top = 8 + Math.random() * 70 + "%"; w.style.left = 4 + Math.random() * 50 + "%"; };
    move(); wmTimer = setInterval(move, 15000);
  }
}

async function Practical(code) {
  const t = await loadTopic(code);
  return backHeader(t.content.practicalTitle.replace(/^Practical:\s*/i, "Practical: "), `BIO-F${t.competence.form}-${code}`, "topic/" + code) + `<main class="wrap stack">
    <article class="content">${t.content.practicalHtml || "<p>The practical for this topic is coming soon.</p>"}</article>
    <button class="btn block" data-act="done" data-part="prac" data-code="${esc(code)}" ${t.progress.prac ? "disabled" : ""}>${t.progress.prac ? "Practical complete" : "Mark practical complete"}</button>
  </main>`;
}

/* ---------- practice ---------- */
function pstate(code, t) {
  if (!practice[code]) practice[code] = { qi: 0, text: {}, marks: {}, revealed: {}, mcq: {}, saved: {} };
  const st = practice[code];
  for (const [qid, choice] of Object.entries(t.progress.current?.mcq || {})) if (!st.mcq[qid]) st.mcq[qid] = { choice, pending: true };
  return st;
}
function qDone(st, q) {
  if (q.type === "MCQ") return !!st.mcq[q.qid];
  return !!st.saved[q.qid];
}
function qState(st, q) {
  if (!qDone(st, q)) return "";
  if (q.type === "MCQ") { const m = st.mcq[q.qid]; return m.correct == null ? "half" : m.correct ? "ok" : "no"; }
  const got = (st.marks[q.qid] || []).reduce((s, x) => s + (Number(x) || 0), 0);
  return got === q.marks ? "ok" : got === 0 ? "no" : "half";
}

async function Practice(code) {
  const t = await loadTopic(code);
  const st = pstate(code, t);
  const qs = t.content.questions;
  if (!qs.length) return backHeader("Practice Questions", "", "topic/" + code) + `<main class="wrap"><div class="box">Questions for this topic are coming soon.</div></main>`;
  const q = qs[st.qi];
  // Fetch the explanation for an MCQ answered earlier (e.g. after a refresh).
  if (q.type === "MCQ" && st.mcq[q.qid]?.pending) {
    try { const r = await api("POST", `/api/learner/practice/${encodeURIComponent(code)}/answer`, { qid: q.qid, choice: st.mcq[q.qid].choice }); st.mcq[q.qid] = r; } catch {}
  }
  const done = qs.filter((x) => qDone(st, x)).length;
  let body = `<div class="content qtext">${q.questionHtml}</div>`;
  if (q.type === "MCQ") {
    const a = st.mcq[q.qid];
    body += `<div class="stack-s">${q.options.map((o, i) => {
      let c = ""; if (a && !a.pending) { if (i === a.answer) c = "ok"; else if (i === a.choice) c = "no"; }
      return `<button class="opt ${c}" data-act="pick" data-i="${i}" data-code="${esc(code)}" ${a ? "disabled" : ""}><span class="l">${"ABCD"[i]}</span><span>${esc(o)}</span></button>`;
    }).join("")}</div>`;
    if (a && !a.pending) body += `<div class="fb ${a.correct ? "ok" : "no"}"><b>${a.correct ? "Correct." : `Not quite. The answer is ${"ABCD"[a.answer]}.`}</b>${a.explanationHtml.replace(/^<p>|<\/p>\s*$/g, "")}</div>`;
  } else {
    body += `<label for="ans" class="eyebrow">Your answer</label><textarea id="ans" data-act="txt" data-qid="${esc(q.qid)}" data-code="${esc(code)}" placeholder="Write your answer here, then check it against the marking points.">${esc(st.text[q.qid] || "")}</textarea>`;
    const rv = st.revealed[q.qid];
    if (!rv) body += `<button class="btn block" data-act="reveal" data-code="${esc(code)}">Check my answer</button>`;
    else {
      const marks = st.marks[q.qid] || rv.parts.map(() => 0);
      body += `<div class="card stack-s"><span class="eyebrow">Correct answer</span><div class="content">${rv.modelHtml}</div></div>
        <div class="card stack-s"><span class="eyebrow">Marking points</span><div class="content">${rv.markingHtml}</div></div>
        <div class="card"><span class="eyebrow">Give yourself marks honestly</span>
          ${rv.parts.map((p, i) => `<div class="marks"><span class="grow">${p.label ? `<b>${esc(p.label)}</b> ` : ""}<span class="ao">${p.ao}</span> out of ${p.marks}</span>
            <select data-act="mark" data-i="${i}" data-qid="${esc(q.qid)}" data-code="${esc(code)}" aria-label="Marks for ${esc(p.label || "this question")}">${Array.from({ length: p.marks + 1 }, (_, m) => `<option value="${m}" ${Number(marks[i]) === m ? "selected" : ""}>${m}</option>`).join("")}</select></div>`).join("")}
        </div>
        ${st.saved[q.qid] ? `<div class="fb ok"><b>Saved: ${marks.reduce((s, x) => s + Number(x), 0)} of ${q.marks} marks.</b>You can change your marks before you finish.</div>` : `<button class="btn block" data-act="savemark" data-code="${esc(code)}">Save my marks</button>`}`;
    }
  }
  const last = st.qi === qs.length - 1;
  return backHeader("Practice Questions", `BIO-F${t.competence.form}-${code}`, "topic/" + code) + `<main class="wrap stack">
    <div class="dots" aria-label="Questions">${qs.map((x, i) => `<button class="qd ${i === st.qi ? "cur" : ""} ${qState(st, x)}" data-act="jump" data-i="${i}" data-code="${esc(code)}" aria-label="Question ${i + 1}">${i + 1}</button>`).join("")}</div>
    <div class="qhead"><span class="code">${esc(q.id)}</span><span class="grow"></span><span class="pill">${esc(q.type)}</span><span class="pill">${plural(q.marks, "mark")}</span><span class="pill ${q.diff === "Hard" ? "cop" : ""}">${esc(q.diff)}</span></div>
    ${body}
    <div class="navq"><button class="btn alt" data-act="prevq" data-code="${esc(code)}" ${st.qi === 0 ? "disabled" : ""}>Previous</button>${last ? `<button class="btn" data-act="finish" data-code="${esc(code)}">See results</button>` : `<button class="btn" data-act="nextq" data-code="${esc(code)}">Next</button>`}</div>
    <p class="muted center" style="font-size:.85rem">${done} of ${qs.length} answered</p>
  </main>`;
}

let lastResult = null;
function ring(p) {
  const r = 46, c = 2 * Math.PI * r;
  return `<svg class="ring" viewBox="0 0 110 110" role="img" aria-label="${Math.round(p * 100)} percent"><circle cx="55" cy="55" r="${r}" fill="none" stroke="var(--sunk)" stroke-width="10"/><circle cx="55" cy="55" r="${r}" fill="none" stroke="var(--gold-bright)" stroke-width="10" stroke-linecap="round" stroke-dasharray="${(c * p).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 55 55)"/><text x="55" y="62" text-anchor="middle" font-size="22" fill="var(--ink)">${Math.round(p * 100)}%</text></svg>`;
}
const AO_NAMES = [["A", "Knowledge with understanding"], ["B", "Handling information, solving problems"], ["C", "Experimental skills"]];
function aoBars(ao, aoMax) {
  return AO_NAMES.filter(([k]) => aoMax[k]).map(([k, l]) => `<div class="aorow"><b>${k}</b><div class="stack-s" style="gap:4px;min-width:0"><span style="font-size:.85rem">${l}</span><div class="bar"><i style="width:${(ao[k] / aoMax[k]) * 100}%;background:${ao[k] / aoMax[k] >= 0.7 ? "var(--good)" : "var(--gold-bright)"}"></i></div></div><span class="v">${ao[k]}/${aoMax[k]}</span></div>`).join("");
}
async function Results(code) {
  const t = await loadTopic(code);
  if (!lastResult || lastResult.code !== code) return go("topic/" + code);
  const a = lastResult.attempt, p = a.total / a.max;
  const weakest = AO_NAMES.filter(([k]) => a.aoMax[k]).map(([k]) => [k, a.ao[k] / a.aoMax[k]]).sort((x, y) => x[1] - y[1])[0]?.[0];
  const tip = { A: ["Re-read the lesson, especially the tables and key terms.", "lesson", "Open lesson"],
    B: ["Go through the worked examples again, then retry the questions with tables.", "lesson", "Open lesson"],
    C: ["Repeat the practical and compare your results with the expected ones.", "practical", "Open practical"] }[weakest];
  return backHeader("Your results", `BIO-F${t.competence.form}-${code}`, "topic/" + code) + `<main class="wrap stack">
    <div class="card score">${ring(p)}<div class="stack-s"><span class="eyebrow">This attempt</span><h2 style="font-variant-numeric:tabular-nums">${a.total} of ${a.max} marks (${Math.round(p * 100)}%)</h2><span class="pill ${p >= 0.7 ? "on" : "cop"}">${lastResult.mastery || ""}</span></div></div>
    <div class="card stack"><h3>By skill</h3>${aoBars(a.ao, a.aoMax)}</div>
    ${p < 1 && tip ? `<div class="box cop stack-s"><h3>What to do next</h3><p>${tip[0]}</p><button class="btn alt" data-go="${tip[1]}/${esc(code)}">${tip[2]} ${I.chev}</button></div>` : `<div class="box green"><b>Full marks.</b> Move on to the next topic.</div>`}
    <div class="navq"><button class="btn alt" data-act="retry" data-code="${esc(code)}">Try again</button><button class="btn" data-go="topic/${esc(code)}">Back to topic</button></div>
    <p class="muted" style="font-size:.85rem">Best score so far: ${score(lastResult.best, a.max)}. Your parent sees this in their progress report.</p>
    ${feedbackButton()}
  </main>`;
}

function Data() {
  const saver = pref.get("dataSaver", true);
  const q = pref.get("quality", saver ? "240" : "360");
  return `<header class="top"><div class="wrap">${mark()}<div class="top-title"><div class="code">Online only · streams, never stored</div><b>Data and settings</b></div><button class="av kid sm" data-act="switch" aria-label="Switch profile">${initial(learnerObj()?.name)}</button></div></header>
  <main class="wrap stack">
    <div class="card row"><div class="grow"><b>Data saver</b><p class="muted" style="font-size:.88rem">Start videos at 240p. You can still choose another quality on any video.</p></div><button class="sw" data-act="saver" aria-pressed="${saver}" aria-label="Data saver"></button></div>
    <section class="card stack-s"><h3>Default video quality</h3>
      <div class="toggle" role="group" aria-label="Default video quality">${Object.entries(QUAL).map(([k, [l]]) => `<button data-act="quality" data-q="${k}" aria-pressed="${q === k}">${l}</button>`).join("")}</div>
      <p class="muted" style="font-size:.85rem">A 3–4 minute lesson video uses about 6–7 MB at data saver quality, 12–14 MB at phone quality and about 2 MB as audio only.</p>
    </section>
    <div class="box stack-s"><b>Why you need a connection</b><p style="font-size:.92rem">Little Cherubs Learner is online only, so lessons and videos stream each time and nothing is saved on the phone. Your progress saves as you go.</p></div>
    ${feedbackButton()}
    <button class="btn alt block" data-act="switch">Switch profile</button>
  </main>`;
}

function Ended() {
  const l = learnerObj();
  const end = l?.pass?.endsAt;
  return `<header class="top"><div class="wrap">${wordmark()}<button class="av kid sm" data-act="switch" aria-label="Switch profile">${initial(l?.name)}</button></div></header>
  <main class="wrap welcome">
    <div class="av kid" style="align-self:center">${I.lock}</div>
    <div class="stack-s center"><h1>${!end ? "Your pass hasn't started yet" : l.pass.trial ? "Your free trial has ended" : "Your pass has ended"}</h1>
      <p class="muted">${end ? `It ended on ${fmtD(end)}. Everything you've learned and all your scores are saved.` : "Ask your parent to add a pass for you in the parent area."}</p></div>
    <div class="box stack-s"><b>${l?.pass?.trial ? "Ask your parent to buy the 90-Day Access." : "Ask your parent to renew."}</b><p style="font-size:.92rem">When they do, you'll pick up exactly where you left off.</p>
      <a class="btn" href="${esc(me?.renewUrl || "#")}" target="_blank" rel="noopener">Buy the 90-Day Access</a></div>
    <button class="btn alt" data-act="switch">Switch profile</button>
  </main>`;
}

/* ===================================================================== */
/* Parent screens                                                         */
/* ===================================================================== */
let parentData = null;
async function loadParent() { parentData = await api("GET", "/api/parent/overview"); me.family = parentData.family; return parentData; }

function parentHeader(sub) {
  return `<header class="top"><div class="wrap">${mark("parent")}<div class="brand"><span class="av sm">${initial(me.family.parentName)}</span><span class="top-title"><div class="code">Parent</div><b>${esc(sub)}</b></span></div><button class="btn alt" style="min-height:38px;padding:6px 12px;font-size:.85rem" data-act="switch">Switch</button></div></header>`;
}

function passCard(l, renewUrl) {
  const p = l.pass;
  if (!p.endsAt) return `<section class="warn"><b>${esc(l.name)} has no pass yet.</b><p style="font-size:.92rem">Buy the 90-Day Access on Selar with the email you sign in with, and it will be added here.</p><a class="btn" href="${esc(renewUrl)}" target="_blank" rel="noopener">Buy the 90-Day Access</a></section>`;
  if (p.trial && !p.active) return `<section class="alert"><span class="eyebrow" style="color:var(--bad)">Free trial ended</span><h2>${esc(l.name)}'s free trial ended on ${fmtD(p.endsAt)}</h2><p style="font-size:.92rem">Learning is locked, but all progress is saved. Buy the 90-Day Access to pick up exactly where ${esc(l.name)} left off.</p><a class="btn" href="${esc(renewUrl)}" target="_blank" rel="noopener">Buy the 90-Day Access</a><p class="muted" style="font-size:.82rem">Use the same email address you sign in with. The 90 days are added within minutes.</p></section>`;
  if (p.trial) return `<section class="box green stack-s">
    <div class="row"><span class="eyebrow grow">${esc(l.name)} · Form ${l.form}</span><span class="pill on">Free trial</span></div>
    <h2 style="font-variant-numeric:tabular-nums">${plural(p.daysLeft, "day")} of free trial left</h2>
    <p class="muted" style="font-size:.88rem">Trial ends ${fmtD(p.endsAt)}. Buy now and the 90 days are added on top of the trial days left.</p>
    <a class="btn" href="${esc(renewUrl)}" target="_blank" rel="noopener">Buy the 90-Day Access</a>
    <p class="muted" style="font-size:.82rem">Use the same email address you sign in with.</p>
  </section>`;
  if (!p.active) return `<section class="alert"><span class="eyebrow" style="color:var(--bad)">Pass ended</span><h2>${esc(l.name)}'s pass ended on ${fmtD(p.endsAt)}</h2><p style="font-size:.92rem">Learning is locked, but all progress is saved. Renew to pick up exactly where ${esc(l.name)} left off.</p><a class="btn" href="${esc(renewUrl)}" target="_blank" rel="noopener">Renew on Selar</a><p class="muted" style="font-size:.82rem">Use the same email address you sign in with. The new 90 days are added within minutes.</p></section>`;
  const total = Math.max(1, Math.round((p.endsAt - (p.startedAt || p.endsAt - 90 * 864e5)) / 864e5));
  const used = Math.min(100, Math.max(0, ((total - p.daysLeft) / total) * 100));
  const soon = p.daysLeft <= 10;
  return `<section class="${soon ? "warn" : "card"} stack-s">
    <div class="row"><span class="eyebrow grow">${esc(l.name)} · Form ${l.form}</span><span class="pill ${soon ? "cop" : "on"}">${soon ? "Ending soon" : "Active"}</span></div>
    <h2 style="font-variant-numeric:tabular-nums">${plural(p.daysLeft, "day")} left</h2>
    <div class="bar" aria-label="${Math.round(used)}% of the pass used"><i style="width:${used}%"></i></div>
    <p class="muted" style="font-size:.88rem">Ends ${fmtD(p.endsAt)}</p>
    ${soon ? `<a class="btn" href="${esc(renewUrl)}" target="_blank" rel="noopener">Renew on Selar</a>` : ""}
  </section>`;
}

function creditsBox(f) {
  if (!f.credits.length) return "";
  return `<section class="card stack-s"><h3>Pass waiting to be used</h3>
    ${f.credits.map((c) => { const kids = f.learners.filter((l) => l.form === c.form);
      return `<div class="stack-s"><p><b>${esc(c.label)}</b> · bought ${fmtD(c.createdAt)}</p>
      ${kids.length ? `<div class="row" style="flex-wrap:wrap;gap:8px">${kids.map((l) => `<button class="btn alt" data-act="apply" data-credit="${esc(c.id)}" data-id="${esc(l.id)}">Add to ${esc(l.name)}</button>`).join("")}</div>`
        : `<p class="muted" style="font-size:.9rem">Add a Form ${c.form} child below to use this pass.</p>`}</div>`; }).join("")}
  </section>`;
}

async function ParentHome() {
  const d = await loadParent();
  const f = d.family;
  return parentHeader("Overview") + `<main class="wrap stack">
    ${f.learners.map((l) => passCard(l, d.renewUrl)).join("")}
    ${creditsBox(f)}
    ${d.learners.map((s) => `<section class="card stack-s">
      <div class="row"><span class="av kid sm">${initial(s.name)}</span><div class="grow"><b>${esc(s.name)}</b><div class="muted" style="font-size:.85rem">Form ${s.form} · Biology</div></div><button class="btn alt" style="min-height:38px;padding:6px 12px;font-size:.85rem" data-go="report/${esc(s.id)}">Full report</button></div>
      <div class="stats" style="margin-top:6px">
        <div class="stat"><b>${s.totals.mastered}<span style="font-size:.9rem;color:var(--muted)">/${s.totals.competences}</span></b><span>competences mastered</span></div>
        <div class="stat"><b>${s.totals.started}</b><span>competences started</span></div>
        <div class="stat"><b>${s.lastAttempt ? Math.round((s.lastAttempt.total / s.lastAttempt.max) * 100) + "%" : "–"}</b><span>last practice questions score</span></div>
      </div>
    </section>`).join("")}
    <section class="stack-s"><h3>Reminders</h3><p class="muted" style="font-size:.92rem">You'll get a WhatsApp message and an email 10 days and 2 days before a pass ends, with a link to renew on Selar. During a free trial, you get one 2 days before it ends and one when it ends.</p></section>
    <form class="card stack" data-form="addchild"><h3>Add another child</h3>
      <div class="field"><label for="cn">First name</label><input id="cn" name="name" required></div>
      <div class="field"><label for="cf">Form</label><select id="cf" name="form">${[1, 2, 3, 4].map((x) => `<option value="${x}">Form ${x}</option>`).join("")}</select></div>
      <div id="formerr"></div><button class="btn alt" type="submit">Add child</button>
      <p class="muted" style="font-size:.85rem">Each child needs their own pass. Buy it on Selar with the same email address.</p></form>
    ${feedbackButton()}
  </main>`;
}

async function Report(id) {
  if (!parentData) await loadParent();
  const lid = id || parentData.family.learners[0]?.id;
  if (!lid) return parentHeader("Report") + `<main class="wrap"><div class="box">Add a child first.</div></main>`;
  const d = await api("GET", "/api/parent/report/" + encodeURIComponent(lid));
  const s = d.learner, la = s.lastAttempt;
  let weak = null;
  if (la) weak = AO_NAMES.filter(([k]) => la.aoMax[k]).map(([k]) => [k, la.ao[k] / la.aoMax[k]]).sort((a, b) => a[1] - b[1])[0];
  const help = { A: `Ask ${esc(s.name)} to explain this week's topic to you in their own words.`, B: `Give ${esc(s.name)} a real example at home, such as food labels or a plant in the yard, and ask them to apply the topic to it.`, C: `Help ${esc(s.name)} repeat the topic's practical at home with simple items.` };
  const pills = (ok, l) => `<span class="pill ${ok ? "on" : ""}">${ok ? I.tick + " " : ""}${l}</span>`;
  const tabsKids = parentData.family.learners.length > 1 ? `<div class="toggle">${parentData.family.learners.map((l) => `<button data-go="report/${esc(l.id)}" aria-pressed="${l.id === lid}">${esc(l.name)}</button>`).join("")}</div>` : "";
  return parentHeader(`${s.name}'s progress`) + `<main class="wrap stack">
    ${tabsKids}
    <section class="card stack-s"><h3>Form ${s.form} Biology</h3>
      <dl class="kv"><dt>Topics open</dt><dd>${s.totals.open} of ${s.totals.competences}</dd><dt>Topics started</dt><dd>${s.totals.started}</dd><dt>Topics mastered</dt><dd>${s.totals.mastered}</dd>
      <dt>Pass</dt><dd>${s.pass.active ? `${s.pass.trial ? "Free trial · " : ""}${plural(s.pass.daysLeft, "day")} left` : s.pass.endsAt ? (s.pass.trial ? "Trial ended " : "Ended ") + fmtD(s.pass.endsAt) : "No pass yet"}</dd></dl></section>
    <section class="card stack"><h3>Skills in the last practice questions</h3>${la ? aoBars(la.ao, la.aoMax) + `<p class="muted" style="font-size:.85rem">${fmtD(la.at)} · ${la.total} of ${la.max} marks (${Math.round((la.total / la.max) * 100)}%)</p>` : `<p class="muted">${esc(s.name)} hasn't finished a set of practice questions yet.</p>`}</section>
    ${weak && weak[1] < 1 ? `<section class="box green stack-s"><h3>How you can help this week</h3><p>${help[weak[0]]}</p></section>` : ""}
    <section class="stack-s"><h3>Competences</h3>${d.topics.length ? d.topics.map((t) => `<div class="card stack-s"><span class="code">BIO-F${s.form}-${esc(t.code)} · ${esc(t.topic || "")}</span><b>${esc(t.title)}</b>
      <div class="row" style="flex-wrap:wrap;gap:6px">${pills(t.lesson, "Lesson")}${pills(t.video, "Video")}${pills(t.prac, "Practical")}${pills(t.best != null, t.best != null ? `Best ${score(t.best, t.total)}` : "Practice Questions")}</div></div>`).join("") : `<p class="muted">No competences open yet.</p>`}</section>
    <section class="card"><h3 style="margin-bottom:6px">Recent activity</h3>${s.log.length ? s.log.map((e) => `<div class="log"><time>${fmtShort(e.at)}</time><span>${esc(e.text)}</span></div>`).join("") : `<p class="muted">No activity yet.</p>`}</section>
  </main>`;
}

async function Pass() {
  const d = await loadParent();
  const f = d.family;
  return parentHeader("Pass and account") + `<main class="wrap stack">
    ${f.learners.map((l) => passCard(l, d.renewUrl)).join("")}
    ${creditsBox(f)}
    ${f.learners.map((l) => `<section class="card stack-s"><h3>${esc(l.name)}'s devices</h3>
      ${l.devices.length ? l.devices.map((dv) => `<div class="log"><time>${fmtShort(dv.lastSeen)}</time><span class="grow">${esc(dv.label)}</span><button class="linkbtn" data-act="rmdev" data-id="${esc(l.id)}" data-dev="${esc(dv.id)}">Remove</button></div>`).join("") : `<p class="muted">Not used on any device yet.</p>`}
      <p class="muted" style="font-size:.85rem">Each child can use up to ${d.maxDevices} devices. Remove one to add another.</p></section>`).join("")}
    <section class="card"><h3 style="margin-bottom:6px">Payments</h3>${f.payments.length ? f.payments.map((p) => `<div class="log"><time>${fmtShort(p.at)}</time><span class="grow">${esc(p.product)}<br><span class="muted" style="font-size:.85rem">${p.source === "manual" ? "Added by Little Cherubs" : "Paid on Selar"}${p.amount ? ` · ${esc(p.currency || "")} ${esc(p.amount)}` : ""}</span></span></div>`).join("") : `<p class="muted">No payments yet.</p>`}</section>
    <section class="card stack-s"><h3>What happens when a pass ends</h3>
      <ul style="margin:0;padding-left:1.2em;font-size:.92rem"><li>Lessons, videos and practice lock on the end date.</li><li>Progress and scores stay saved.</li><li>Renewing adds 90 days and unlocks everything straight away.</li></ul></section>
    <form class="card stack" data-form="newpin"><h3>Change parent PIN</h3><div class="field"><label for="np">New 4-digit PIN</label><input id="np" name="pin" inputmode="numeric" pattern="\\d{4}" maxlength="4" required></div><div id="formerr"></div><button class="btn alt" type="submit">Save PIN</button></form>
    <section class="card stack-s"><h3>Sign out of this device</h3>
      <p class="muted" style="font-size:.9rem">Signed in as ${esc(f.email)}. Signing out logs this device out of the family account. You'll need your email and password to sign in again. Your children's progress is kept.</p>
      <button class="btn alt block" data-act="signout">Sign out</button></section>
  </main>`;
}

/* ===================================================================== */
/* Router                                                                 */
/* ===================================================================== */
const SIGNED_OUT = { signin: SignIn, trial: Trial, forgot: Forgot, setup: SetUp, reset: Reset };
const LEARNER = { feedback: Feedback, home: Home, learn: Learn, topic: Topic, lesson: Lesson, video: Video, practical: Practical, practice: Practice, results: Results, data: Data, ended: Ended };
const PARENT = { feedback: Feedback, parent: ParentHome, report: Report, pass: Pass };

async function render() {
  route = parseHash();
  clearInterval(wmTimer);
  const app = $("#app");
  try {
    if (!me) me = await api("GET", "/api/me");
    let view, tabs = null;
    if (route.name === "setup" || route.name === "reset") view = SIGNED_OUT[route.name];
    else if (!me.signedIn) { if (!SIGNED_OUT[route.name]) return go("signin"); view = SIGNED_OUT[route.name]; }
    else if (!me.session.role) { if (route.name !== "who") return go("who"); view = Who; }
    else if (me.session.role === "parent") { if (!PARENT[route.name]) return go("parent"); view = PARENT[route.name]; tabs = "parent"; }
    else { if (!LEARNER[route.name]) return go("home"); view = LEARNER[route.name]; tabs = route.name === "ended" ? null : "learner"; }
    const html = await view(route.arg);
    if (typeof html !== "string") return;
    app.innerHTML = html;
    setTabs(tabs);
    if (route.name === "video") bindVideo(route.arg);
    const first = app.querySelector("[data-pin='0']"); if (first) first.focus();
  } catch (e) { handleError(e); }
}

function handleError(e) {
  if (!(e instanceof ApiError)) { console.error(e); $("#app").innerHTML = brandHeader() + `<main class="wrap stack" style="padding-top:40px">${errBox("Something went wrong. Refresh the page to try again.")}</main>`; return; }
  if (e.code === "SIGNED_OUT") { me = { signedIn: false, renewUrl: me?.renewUrl }; return go("signin"); }
  if (e.code === "CHOOSE_PROFILE" || e.code === "PARENT_PIN") { if (me) me.session.role = null; return go("who"); }
  if (e.code === "PASS_ENDED") return go("ended");
  if (e.code === "SIGNED_IN_ELSEWHERE") {
    setTabs(null);
    $("#app").innerHTML = `<main class="wrap welcome"><div class="stack-s center"><h1>Signed in on another device</h1><p class="muted">${esc(e.message)}</p></div>
      <button class="btn" data-act="reclaim">Use Little Cherubs here</button><button class="btn alt" data-act="switch">Switch profile</button></main>`;
    return;
  }
  setTabs(null);
  $("#app").innerHTML = brandHeader() + `<main class="wrap stack" style="padding-top:40px">${errBox(e)}<button class="btn alt" onclick="location.reload()">Try again</button></main>`;
}

/* ---------- actions ---------- */
// Parts in the order learners meet them on the topic page.
const PARTS = [["lesson", "lesson", "Lesson"], ["video", "video", "Video"], ["prac", "practical", "Practical"], ["practice", "practice", "Practice Questions"]];
// After a part is marked done, go straight to the next unfinished part (wrapping round),
// or back to the topic page when everything is done.
function nextPartRoute(code, from) {
  const pr = cache.topic[code]?.progress || {};
  const isDone = (k) => (k === "practice" ? pr.best != null : !!pr[k]);
  const i = PARTS.findIndex(([k]) => k === from);
  const order = PARTS.slice(i + 1).concat(PARTS.slice(0, i));
  const nxt = order.find(([k]) => !isDone(k));
  return nxt ? { route: `${nxt[1]}/${code}`, label: nxt[2] } : { route: `topic/${code}`, label: "" };
}
async function markDone(code, part, msg, { auto = false } = {}) {
  if (auto && cache.topic[code]?.progress?.[part]) return; // re-watching a finished video: stay put
  try {
    await api("POST", `/api/learner/progress/${encodeURIComponent(code)}`, { part });
    if (cache.topic[code]) cache.topic[code].progress[part] = true;
    const n = nextPartRoute(code, part);
    toast(`${msg} ✓${n.label ? ` · Next: ${n.label}` : " · All parts done"}`);
    go(n.route); window.scrollTo(0, 0);
  } catch (e) { handleError(e); }
}

async function chooseLearner(id) {
  me = await api("POST", "/api/session/learner", { learnerId: id, deviceId: deviceId(), deviceLabel: deviceLabel() });
  Object.keys(cache.topic).forEach((k) => delete cache.topic[k]);
  go("home");
}

document.addEventListener("click", async (e) => {
  const g = e.target.closest("[data-go]");
  if (g) { e.preventDefault(); go(g.dataset.go); window.scrollTo(0, 0); return; }
  const el = e.target.closest("[data-act]");
  if (!el || el.tagName === "TEXTAREA" || el.tagName === "SELECT") return;
  const a = el.dataset.act, code = el.dataset.code;
  try {
    switch (a) {
      case "as-learner": el.disabled = true; await chooseLearner(el.dataset.id); break;
      case "pin-show": pinFor = true; render(); break;
      case "switch": me = await api("POST", "/api/session/clear"); pinFor = false; parentData = null; go("who"); break;
      case "reclaim": await chooseLearner(me.session.learnerId); break;
      case "forgotpin": {
        el.disabled = true;
        const r = await api("POST", "/api/auth/forgot", { email: me.family.email });
        toast(r.sent ? "We've sent a link to set a new PIN to your email and WhatsApp" : "We couldn't send the link. Contact Little Cherubs for help.");
        el.disabled = false; break;
      }
      case "signout": await api("POST", "/api/auth/logout"); me = { signedIn: false, renewUrl: me?.renewUrl }; pinFor = false; go("signin"); break;
      case "done": el.disabled = true; await markDone(code, el.dataset.part, { lesson: "Lesson complete", video: "Video watched", prac: "Practical complete" }[el.dataset.part]); break;
      case "quality": pref.set("quality", el.dataset.q); render(); break;
      case "saver": { const v = !pref.get("dataSaver", true); pref.set("dataSaver", v); pref.set("quality", v ? "240" : "360"); render(); break; }
      case "pick": {
        const t = cache.topic[code], st = practice[code], q = t.content.questions[st.qi];
        el.disabled = true;
        st.mcq[q.qid] = await api("POST", `/api/learner/practice/${encodeURIComponent(code)}/answer`, { qid: q.qid, choice: Number(el.dataset.i) });
        render(); break;
      }
      case "reveal": {
        const t = cache.topic[code], st = practice[code], q = t.content.questions[st.qi];
        st.revealed[q.qid] = await api("POST", `/api/learner/practice/${encodeURIComponent(code)}/reveal`, { qid: q.qid });
        st.marks[q.qid] = st.marks[q.qid] || st.revealed[q.qid].parts.map(() => 0);
        render(); break;
      }
      case "savemark": { const st = practice[code], q = cache.topic[code].content.questions[st.qi]; st.saved[q.qid] = true; toast("Marks saved"); render(); break; }
      case "jump": practice[code].qi = Number(el.dataset.i); render(); window.scrollTo(0, 0); break;
      case "prevq": practice[code].qi--; render(); window.scrollTo(0, 0); break;
      case "nextq": practice[code].qi++; render(); window.scrollTo(0, 0); break;
      case "finish": {
        const t = cache.topic[code], st = practice[code];
        const left = t.content.questions.filter((q) => !qDone(st, q)).length;
        if (left && !el.dataset.sure) { el.dataset.sure = "1"; el.textContent = `${left} not answered. Tap again to finish`; break; }
        const self = {};
        for (const q of t.content.questions) if (q.type !== "MCQ") self[q.qid] = (st.saved[q.qid] && st.marks[q.qid]) || q.parts.map(() => 0);
        const r = await api("POST", `/api/learner/practice/${encodeURIComponent(code)}/finish`, { self });
        lastResult = { code, ...r };
        delete practice[code]; delete cache.topic[code];
        go("results/" + code); window.scrollTo(0, 0); break;
      }
      case "retry": await api("POST", `/api/learner/practice/${encodeURIComponent(code)}/restart`); delete practice[code]; delete cache.topic[code]; go("practice/" + code); break;
      case "apply": me.family = (await api("POST", "/api/parent/apply-credit", { creditId: el.dataset.credit, learnerId: el.dataset.id })).family; toast("90 days added"); render(); break;
      case "rmdev": me.family = (await api("POST", "/api/parent/devices/remove", { learnerId: el.dataset.id, deviceId: el.dataset.dev })).family; toast("Device removed"); render(); break;
    }
  } catch (err) {
    const box = $("#formerr") || $("#whoerr");
    if (err instanceof ApiError && box && !["SIGNED_OUT", "PASS_ENDED", "SIGNED_IN_ELSEWHERE"].includes(err.code)) { box.innerHTML = errBox(err); el.disabled = false; }
    else handleError(err);
  }
});

document.addEventListener("input", (e) => {
  const el = e.target;
  if (el.dataset.act === "txt") practice[el.dataset.code].text[el.dataset.qid] = el.value;
  if (el.dataset.pin != null) {
    el.value = el.value.replace(/\D/g, "").slice(-1);
    if (el.value) { const nx = document.querySelector(`[data-pin='${Number(el.dataset.pin) + 1}']`); if (nx) nx.focus(); else el.form.requestSubmit(); }
  }
});
document.addEventListener("keydown", (e) => {
  const el = e.target;
  if (el.dataset?.pin != null && e.key === "Backspace" && !el.value) { const pv = document.querySelector(`[data-pin='${Number(el.dataset.pin) - 1}']`); if (pv) { pv.value = ""; pv.focus(); } }
});
document.addEventListener("change", (e) => {
  const el = e.target;
  if (el.dataset.act === "mark") {
    const st = practice[el.dataset.code];
    st.marks[el.dataset.qid][Number(el.dataset.i)] = Number(el.value);
    if (st.saved[el.dataset.qid]) render();
  }
});

document.addEventListener("submit", async (e) => {
  const f = e.target, kind = f.dataset.form;
  if (!kind) return;
  e.preventDefault();
  const data = Object.fromEntries(new FormData(f));
  const btn = f.querySelector("[type=submit]");
  const errEl = f.querySelector("#formerr");
  if (btn) btn.disabled = true;
  if (errEl) errEl.innerHTML = "";
  try {
    if (kind === "signin") { me = await api("POST", "/api/auth/login", data); go("who"); }
    else if (kind === "forgot") {
      const r = await api("POST", "/api/auth/forgot", data);
      f.outerHTML = `<div class="ok-note">If that email has an account, a reset link is on its way${r.sent ? "" : ". If it doesn't arrive within an hour, contact Little Cherubs on WhatsApp and we'll send one"}.</div><button class="btn alt" data-go="signin">Back to sign in</button>`;
    }
    else if (kind === "trial") { me = await api("POST", "/api/trial/start", data); toast(`Your ${me.trial?.days || 7}-day free trial has started`); go("who"); }
    else if (kind === "setup") { me = await api("POST", "/api/setup/" + encodeURIComponent(f.dataset.token), data); toast("Account created"); go("who"); }
    else if (kind === "reset") { me = await api("POST", "/api/auth/reset/" + encodeURIComponent(f.dataset.token), data); toast("Password saved"); go("who"); }
    else if (kind === "pin") {
      const pin = [...f.querySelectorAll("[data-pin]")].map((i) => i.value).join("");
      me = await api("POST", "/api/session/parent", { pin }); pinFor = false; go("parent");
    }
    else if (kind === "addchild") { me.family = (await api("POST", "/api/parent/learners", data)).family; toast("Child added"); render(); }
    else if (kind === "feedback") {
      await api("POST", "/api/feedback", { rating: data.rating, text: data.text, page: f.dataset.from });
      feedbackSent = true; render(); window.scrollTo(0, 0);
    }
    else if (kind === "newpin") { await api("POST", "/api/parent/pin", data); toast("PIN changed"); f.reset(); }
  } catch (err) {
    if (err instanceof ApiError && errEl && !["SIGNED_OUT"].includes(err.code)) {
      errEl.innerHTML = errBox(err);
      if (kind === "pin") f.querySelectorAll("[data-pin]").forEach((i) => (i.value = ""));
    } else handleError(err);
  } finally { if (btn && document.body.contains(btn)) btn.disabled = false; }
});

window.addEventListener("hashchange", render);
function net() { $("#net").hidden = navigator.onLine !== false; }
window.addEventListener("online", net); window.addEventListener("offline", net);
net();
render();
