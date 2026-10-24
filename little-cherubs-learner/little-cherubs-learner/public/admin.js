// Little Cherubs Learner: admin area (families, sales, passes, content, video).

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtD = (t) => (t ? new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "–");
const fmtDT = (t) => new Date(t).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const mb = (b) => (b / 1048576).toFixed(1) + " MB";

class ApiError extends Error { constructor(s, c, m) { super(m); this.status = s; this.code = c; } }
async function api(method, path, body, raw) {
  const opts = { method, credentials: "same-origin", headers: {} };
  if (raw !== undefined) { opts.body = raw; opts.headers["content-type"] = body || "application/octet-stream"; }
  else if (body) { opts.body = JSON.stringify(body); opts.headers["content-type"] = "application/json"; }
  let r;
  try { r = await fetch(path, opts); } catch { throw new ApiError(0, "OFFLINE", "No connection."); }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, data.error, data.message || "Request failed.");
  return data;
}
function toast(m) { const t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2600); }
const errBox = (e) => `<div class="err" role="alert">${esc(e.message || e)}</div>`;
const copyField = (v, id) => `<div class="copy"><input id="${id}" value="${esc(v)}" readonly aria-label="Link"><button class="btn alt" data-act="copy" data-target="${id}">Copy</button></div>`;
const passPill = (p) => !p.endsAt ? `<span class="pill">No pass</span>` : p.active ? `<span class="pill ${p.daysLeft <= 10 ? "cop" : "on"}">${p.daysLeft} days left</span>` : `<span class="pill" style="background:var(--bad-soft);color:var(--bad)">Ended ${fmtD(p.endsAt)}</span>`;

let route = { name: "", arg: "" };
const parse = () => { const [n, ...r] = location.hash.replace(/^#\/?/, "").split("/"); return { name: n || "overview", arg: decodeURIComponent(r.join("/")) }; };
const go = (h) => { if (location.hash === "#" + h) render(); else location.hash = h; };

function shell(inner) {
  const tabs = [["overview", "Overview"], ["families", "Families"], ["sale", "Record a sale"], ["sales", "Sales log"], ["content", "Content and video"]];
  const cur = route.name === "family" ? "families" : route.name === "topic" ? "content" : route.name;
  return `<header class="top"><div class="wrap"><div class="brand"><img src="/assets/emblem.png" alt="" width="40" height="40"><span class="wm"><small>LITTLE</small><b>Cherubs</b><i>Admin</i></span></div>
    <a class="btn alt" style="min-height:38px;padding:6px 12px;font-size:.85rem" href="/" target="_blank" rel="noopener">Open app</a>
    <button class="btn alt" style="min-height:38px;padding:6px 12px;font-size:.85rem" data-act="logout">Sign out</button></div>
    <nav class="wrap anav" aria-label="Admin">${tabs.map(([k, l]) => `<button data-go="${k}" ${cur === k ? 'aria-current="page"' : ""}>${l}</button>`).join("")}</nav></header>
  <main class="wrap stack">${inner}</main>`;
}

/* ---------- screens ---------- */
function Login() {
  return `<main class="wrap welcome" style="max-width:420px;margin:0 auto">
    <img class="logo" src="/assets/logo.png" alt="Little Cherubs logo" style="width:120px;height:120px">
    <h1 class="center">Admin sign in</h1>
    <form class="card stack" data-form="login"><div class="field"><label for="ap">Admin password</label><input id="ap" name="password" type="password" autocomplete="current-password" required></div>
    <div id="formerr"></div><button class="btn block" type="submit">Sign in</button></form></main>`;
}

async function Overview() {
  const d = await api("GET", "/api/admin/overview");
  const c = d.counts, cfg = d.config;
  const tile = (n, l) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`;
  const check = (ok, label, help) => `<div class="log"><span class="dot ${ok ? "done" : ""}" style="width:24px;height:24px">${ok ? "✓" : "!"}</span><span class="grow"><b>${label}</b>${ok ? "" : `<br><span class="muted" style="font-size:.85rem">${help}</span>`}</span></div>`;
  return shell(`
    <h1>Overview</h1>
    <div class="tiles6">${tile(c.families, "families set up")}${tile(c.activePasses, "active passes")}${tile(c.endingSoon, "ending in 10 days")}${tile(c.ended, "ended passes")}${tile(c.pendingSetup, "waiting to set up")}${tile(c.sales30, "sales in 30 days")}</div>
    <div class="grid2">
      <section class="card"><h3 style="margin-bottom:6px">Setup check</h3>
        ${check(true, "Admin password set", "")}
        ${check(cfg.webhookKey, "Selar webhook key set", "Add SELAR_WEBHOOK_KEY (16+ characters) in Netlify > Site configuration > Environment variables, then redeploy.")}
        ${check(cfg.notifyWebhook, "Reminder and reset messages connected", "Add NOTIFY_WEBHOOK_URL (your Zapier Catch Hook) so parents get reminders and reset links.")}
        ${check(!/selar\.com\/?$/.test(cfg.renewUrl), "Renewal link set", "Set RENEW_URL to your Selar product page so parents can renew.")}
        <p class="muted" style="font-size:.85rem;margin-top:8px">Selar webhook address for Zapier:<br><code>${esc(cfg.siteUrl)}/api/webhooks/selar</code></p>
      </section>
      <section class="card"><h3 style="margin-bottom:6px">Passes ending in the next 10 days</h3>
        ${d.endingSoon.length ? d.endingSoon.map((x) => `<div class="log"><time>${x.daysLeft} days</time><span class="grow"><button class="linkbtn" data-go="family/${esc(x.familyId)}">${esc(x.learner)}</button> · ${esc(x.parent || x.email)}</span></div>`).join("") : `<p class="muted">None.</p>`}
      </section>
    </div>
    <section class="stack-s"><h3>Recent sales</h3>${salesTable(d.recentSales)}</section>`);
}

function salesTable(sales) {
  if (!sales.length) return `<p class="muted">No sales yet.</p>`;
  return `<div class="admin-table"><table><thead><tr><th>When</th><th>Buyer</th><th>Product</th><th>Reference</th><th>Source</th><th>Result</th></tr></thead><tbody>
    ${sales.map((s) => `<tr><td>${fmtDT(s.at)}</td><td>${s.familyId ? `<button class="linkbtn" data-go="family/${esc(s.familyId)}">${esc(s.email)}</button>` : esc(s.email)}</td><td class="wrap">${esc(s.product)}</td><td><code>${esc(s.ref || "–")}</code></td><td>${esc(s.source)}</td><td class="wrap">${esc(s.result)}</td></tr>`).join("")}
  </tbody></table></div>`;
}

async function Families() {
  const q = route.arg || "";
  const d = await api("GET", "/api/admin/families?q=" + encodeURIComponent(q));
  return shell(`<h1>Families</h1>
    <form class="row" data-form="search"><input name="q" value="${esc(q)}" placeholder="Search by email, name, phone or child" aria-label="Search" style="flex:1;font:inherit;padding:11px 14px;border:1px solid var(--line);border-radius:12px;background:var(--surface);color:var(--ink)"><button class="btn" type="submit">Search</button></form>
    ${d.families.length ? `<div class="admin-table"><table><thead><tr><th>Parent</th><th>Email</th><th>Children and passes</th><th>Status</th><th>Joined</th></tr></thead><tbody>
      ${d.families.map((f) => `<tr><td><button class="linkbtn" data-go="family/${esc(f.id)}">${esc(f.parentName || "(not set)")}</button></td><td>${esc(f.email)}</td>
        <td class="wrap">${f.learners.map((l) => `${esc(l.name)} (F${l.form}) ${passPill(l.pass)}`).join("<br>") || "–"}${f.waitingCredits ? `<br><span class="pill cop">${f.waitingCredits} pass waiting</span>` : ""}</td>
        <td>${f.status === "active" ? "Set up" : `<span class="pill cop">Waiting to set up</span>`}</td><td>${fmtD(f.createdAt)}</td></tr>`).join("")}
    </tbody></table></div>` : `<p class="muted">No families found.</p>`}`);
}

let lastLink = null;
async function Family(id) {
  const f = await api("GET", "/api/admin/families/" + encodeURIComponent(id));
  const link = lastLink && lastLink.id === id ? lastLink : null;
  return shell(`<button class="linkbtn" data-go="families">← All families</button>
    <div class="stack-s"><span class="eyebrow">${f.status === "active" ? "Family" : "Waiting to set up"}</span><h1>${esc(f.parentName || f.email)}</h1>
      <p class="muted">${esc(f.email)}${f.phone ? " · " + esc(f.phone) : ""} · joined ${fmtD(f.createdAt)}</p></div>
    <div class="row" style="flex-wrap:wrap;gap:8px">
      ${f.status === "active" ? `<button class="btn alt" data-act="reset-link" data-id="${esc(f.id)}">Make password reset link</button>` : `<button class="btn alt" data-act="setup-link" data-id="${esc(f.id)}">Make new set-up link</button>`}
    </div>
    ${link ? `<div class="card stack-s"><b>${esc(link.label)}</b><p class="muted" style="font-size:.88rem">Send this to the parent by WhatsApp or email. ${link.label.startsWith("Set-up") ? "It works once." : "It works once, for 24 hours."}</p>${copyField(link.url, "famlink")}</div>` : ""}
    <div class="grid2">
      ${f.learners.map((l) => `<section class="card stack-s"><div class="row"><span class="av kid sm">${esc(l.name[0] || "?")}</span><div class="grow"><b>${esc(l.name)}</b><div class="muted" style="font-size:.85rem">Form ${l.form}</div></div>${passPill(l.pass)}</div>
        <dl class="kv"><dt>Pass ends</dt><dd>${fmtD(l.pass.endsAt)}</dd><dt>Devices</dt><dd>${l.devices.length ? l.devices.map((d) => esc(d.label)).join(", ") : "none"}</dd></dl>
        <form class="stack-s" data-form="days" data-id="${esc(f.id)}" data-learner="${esc(l.id)}"><label class="eyebrow" for="d-${esc(l.id)}">Add or remove days</label>
          <div class="row"><input id="d-${esc(l.id)}" name="days" type="number" value="90" style="width:90px;font:inherit;padding:9px;border:1px solid var(--line);border-radius:10px;background:var(--surface);color:var(--ink)">
          <input name="note" placeholder="Reason (e.g. paid by mobile money)" aria-label="Reason" style="flex:1;min-width:0;font:inherit;padding:9px;border:1px solid var(--line);border-radius:10px;background:var(--surface);color:var(--ink)"><button class="btn alt" type="submit">Apply</button></div></form>
        ${l.devices.length ? `<button class="linkbtn" data-act="clear-devices" data-id="${esc(f.id)}" data-learner="${esc(l.id)}">Clear all devices for ${esc(l.name)}</button>` : ""}
        ${(f.history.find((h) => h.learnerId === l.id)?.history || []).length ? `<details><summary class="muted" style="cursor:pointer">Pass history</summary>${f.history.find((h) => h.learnerId === l.id).history.map((h) => `<div class="log"><time>${fmtD(h.at)}</time><span>${h.days > 0 ? "+" : ""}${h.days} days ${h.note ? "· " + esc(h.note) : h.ref ? "· " + esc(h.ref) : ""}</span></div>`).join("")}</details>` : ""}
      </section>`).join("") || `<div class="box">No children added yet. The parent adds their child when they finish setting up.</div>`}
    </div>
    ${f.credits.length ? `<section class="card stack-s"><h3>Passes waiting to be used</h3>${f.credits.map((c) => `<div class="row" style="flex-wrap:wrap;gap:8px"><span class="grow">${esc(c.label)} · ${fmtD(c.createdAt)}</span>${f.learners.filter((l) => l.form === c.form).map((l) => `<button class="btn alt" data-act="apply" data-id="${esc(f.id)}" data-credit="${esc(c.id)}" data-learner="${esc(l.id)}">Add to ${esc(l.name)}</button>`).join("")}</div>`).join("")}</section>` : ""}
    <section class="card"><h3 style="margin-bottom:6px">Payments</h3>${f.payments.length ? f.payments.map((p) => `<div class="log"><time>${fmtD(p.at)}</time><span>${esc(p.product)} · ${esc(p.source)}${p.ref ? " · " + esc(p.ref) : ""}${p.amount ? ` · ${esc(p.currency || "")} ${esc(p.amount)}` : ""}</span></div>`).join("") : `<p class="muted">None.</p>`}</section>`);
}

let saleResult = null;
async function Sale() {
  const { products } = await api("GET", "/api/admin/products");
  return shell(`<h1>Record a sale</h1>
    <p class="muted" style="max-width:65ch">Use this when a parent pays outside Selar, or if a Selar sale didn't come through. It works exactly like a Selar sale: a new parent gets a set-up link, an existing parent gets 90 more days.</p>
    ${saleResult ? `<div class="card stack-s"><b>${saleResult.newFamily ? "New family created" : "Pass added to existing family"}</b>
      ${saleResult.setupUrl ? `<p class="muted" style="font-size:.88rem">Send this set-up link to the parent:</p>${copyField(saleResult.setupUrl, "salelink")}` : `<p>${saleResult.applied?.length ? "Added to " + esc(saleResult.applied.map((a) => a.learner).join(", ")) + "." : "The parent will choose which child gets this pass."}</p>`}
      <button class="linkbtn" data-go="family/${esc(saleResult.familyId)}">Open family</button></div>` : ""}
    <form class="card stack" data-form="sale" style="max-width:560px">
      <div class="field"><label for="se">Parent's email</label><input id="se" name="email" type="email" required></div>
      <div class="field"><label for="sn">Parent's name</label><input id="sn" name="name"></div>
      <div class="field"><label for="sp">WhatsApp number</label><input id="sp" name="phone" inputmode="tel"></div>
      <div class="field"><label for="spr">Product</label><select id="spr" name="product">${products.map((p) => `<option value="${esc(p.match)}">${esc(p.label)}</option>`).join("")}</select></div>
      <div class="field"><label for="sr">Payment reference (optional)</label><input id="sr" name="reference" placeholder="e.g. Airtel Money transaction ID"></div>
      <div class="field"><label for="sa">Amount in kwacha (optional)</label><input id="sa" name="amount" inputmode="decimal"></div>
      <div id="formerr"></div><button class="btn" type="submit">Record sale</button></form>`);
}

async function Sales() {
  const d = await api("GET", "/api/admin/sales");
  return shell(`<h1>Sales log</h1><p class="muted">Every sale received from Selar or recorded here, including any that were rejected and why.</p>${salesTable(d.sales)}`);
}

let contentForm = "1", uploadReport = null;
async function Content() {
  const d = await api("GET", "/api/admin/content");
  const list = d.forms[contentForm] || [];
  return shell(`<h1>Content and video</h1>
    <div class="grid2">
      <form class="card stack" data-form="content"><h3>Upload a content set</h3>
        <p class="muted" style="font-size:.9rem">Export the finished doc from your Claude Project as Markdown (.md) and choose it here. The Competence ID in the doc decides which topic it updates. Uploading again replaces the old version; learners' progress is kept.</p>
        <input type="file" name="file" accept=".md,.markdown,.txt,text/markdown,text/plain" required aria-label="Content file">
        <div id="formerr"></div><button class="btn" type="submit">Upload and check</button></form>
      ${uploadReport ? `<section class="card stack-s"><h3>${esc(uploadReport.code)} ${esc(uploadReport.title)}</h3>
        <p>${uploadReport.questions} questions · ${uploadReport.totalMarks} marks (A ${uploadReport.aoMax.A}, B ${uploadReport.aoMax.B}, C ${uploadReport.aoMax.C}) · ${uploadReport.scenes} video scenes</p>
        ${uploadReport.warnings.length ? `<div class="warn"><b>Check these before learners see it:</b><ul class="warnlist">${uploadReport.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>` : `<div class="ok-note">No problems found. It's live for learners now.</div>`}
        <button class="linkbtn" data-go="topic/${esc(uploadReport.code)}">Preview and add video</button></section>` : ""}
    </div>
    <div class="toggle" role="group" aria-label="Form">${["1", "2", "3", "4"].map((f) => `<button data-act="form" data-f="${f}" aria-pressed="${f === contentForm}">Form ${f}</button>`).join("")}</div>
    <p class="muted">${list.filter((x) => x.content).length} of ${list.length} Form ${contentForm} topics have content.</p>
    <div class="admin-table"><table><thead><tr><th>Code</th><th>Topic</th><th>Content</th><th>Video</th><th></th></tr></thead><tbody>
      ${list.map((x) => `<tr><td><code>${esc(x.code)}</code></td><td class="wrap">${esc(x.title)}</td>
        <td>${x.content ? `<span class="pill on">${x.content.questions} Qs · ${x.content.totalMarks} marks</span>` : `<span class="pill">Not yet</span>`}</td>
        <td>${x.content ? (Object.keys(x.content.media).length ? Object.keys(x.content.media).map((q) => `<span class="pill on">${q === "audio" ? "Audio" : q + "p"}</span>`).join(" ") : `<span class="pill cop">No video</span>`) : ""}</td>
        <td>${x.content ? `<button class="linkbtn" data-go="topic/${esc(x.code)}">Open</button>` : ""}</td></tr>`).join("")}
    </tbody></table></div>`);
}

async function Topic(code) {
  const c = await api("GET", "/api/admin/content/" + encodeURIComponent(code));
  const all = await api("GET", "/api/admin/content");
  const row = Object.values(all.forms).flat().find((x) => x.code === code);
  const m = row?.content?.media || {};
  const Q = [["240", "Data saver (240p MP4)", "video/mp4,.mp4"], ["360", "Phone (360p MP4)", "video/mp4,.mp4"], ["audio", "Audio only (MP3)", "audio/mpeg,.mp3"]];
  return shell(`<button class="linkbtn" data-go="content">← All content</button>
    <div class="stack-s"><span class="code">BIO-F${c.form}-${esc(code)}</span><h1>${esc(c.title)}</h1><p class="muted">Updated ${fmtD(c.updatedAt)} · ${c.questions.length} questions · ${c.totalMarks} marks</p></div>
    <section class="card stack-s"><h3>Video and audio</h3>
      <p class="muted" style="font-size:.9rem">Upload each version separately. Learners choose between the versions you upload; data saver is the default. Uploads go up in 3 MB pieces, so large files are fine on a steady connection.</p>
      ${Q.map(([q, label, accept]) => `<div class="uprow"><b>${label.split(" (")[0]}</b>
        <div class="stack-s" style="gap:4px;min-width:0">${m[q] ? `<span class="muted" style="font-size:.88rem">Uploaded ${fmtD(m[q].uploadedAt)} · ${mb(m[q].size)}</span><video controls preload="none" src="/api/admin/media/${encodeURIComponent(code)}/${q}" style="max-width:280px;width:100%;${q === "audio" ? "height:40px" : ""}"></video>` : `<span class="muted" style="font-size:.88rem">Not uploaded</span>`}
          <div class="bar" id="bar-${q}" hidden><i style="width:0%"></i></div></div>
        <span class="row" style="gap:6px"><label class="btn alt" style="min-height:38px;padding:6px 12px;font-size:.85rem;cursor:pointer">${m[q] ? "Replace" : "Upload"}<input type="file" accept="${accept}" data-act="media" data-code="${esc(code)}" data-q="${q}" hidden></label>
        ${m[q] ? `<button class="linkbtn" data-act="rm-media" data-code="${esc(code)}" data-q="${q}">Remove</button>` : ""}</span></div>`).join("")}
    </section>
    <div class="grid2">
      <section class="stack-s"><h3>Lesson preview</h3><div class="preview content">${c.lessonHtml || "<p>No lesson.</p>"}</div></section>
      <section class="stack-s"><h3>Questions with answers</h3><div class="preview">${c.questions.map((q) => `<div class="stack-s" style="padding-block:10px;border-top:1px solid var(--line)"><span class="code">${esc(q.id)} · ${esc(q.type)} · ${q.marks} marks · ${esc(q.type === "MCQ" ? q.ao : q.parts.map((p) => `${p.label} ${p.ao}${p.marks}`).join(" "))}</span>
        <div class="content">${q.questionHtml}</div>${q.type === "MCQ" ? `<ol type="A">${q.options.map((o, i) => `<li ${i === q.answer ? 'style="font-weight:700;color:var(--good)"' : ""}>${esc(o)}</li>`).join("")}</ol>` : `<div class="content">${q.markingHtml}</div>`}</div>`).join("")}</div></section>
    </div>
    ${c.teacherHtml ? `<details class="script"><summary>Teacher notes</summary><div class="content" style="margin-top:10px">${c.teacherHtml}</div></details>` : ""}
    <button class="linkbtn" data-act="rm-content" data-code="${esc(code)}" style="color:var(--bad)">Remove this content from the app</button>`);
}

/* ---------- router ---------- */
const VIEWS = { overview: Overview, families: Families, family: Family, sale: Sale, sales: Sales, content: Content, topic: Topic };
let signedIn = null;
async function render() {
  route = parse();
  try {
    if (signedIn === null) { try { await api("GET", "/api/admin/me"); signedIn = true; } catch { signedIn = false; } }
    if (!signedIn) { $("#app").innerHTML = Login(); return; }
    const v = VIEWS[route.name] || Overview;
    $("#app").innerHTML = await v(route.arg);
  } catch (e) {
    if (e.code === "ADMIN_SIGNED_OUT") { signedIn = false; return render(); }
    $("#app").innerHTML = shell(errBox(e));
  }
}

async function uploadMedia(input) {
  const file = input.files[0];
  if (!file) return;
  const { code, q } = input.dataset;
  const bar = $("#bar-" + q); bar.hidden = false;
  try {
    const type = file.type || (q === "audio" ? "audio/mpeg" : "video/mp4");
    const st = await api("POST", `/api/admin/media/${encodeURIComponent(code)}/${q}/start`, { size: file.size, type });
    for (let i = 0; i < st.chunks; i++) {
      const piece = new Uint8Array(await file.slice(i * st.chunkSize, Math.min(file.size, (i + 1) * st.chunkSize)).arrayBuffer());
      let tries = 0;
      for (;;) {
        try { await api("PUT", `/api/admin/media/${encodeURIComponent(code)}/${q}/${st.uploadId}/${i}`, "application/octet-stream", piece); break; }
        catch (e) { if (++tries >= 3) throw e; await new Promise((r) => setTimeout(r, 1500 * tries)); }
      }
      bar.firstElementChild.style.width = Math.round(((i + 1) / st.chunks) * 100) + "%";
    }
    await api("POST", `/api/admin/media/${encodeURIComponent(code)}/${q}/${st.uploadId}/complete`, {});
    toast("Upload complete"); render();
  } catch (e) { bar.hidden = true; toast(e.message); }
}

document.addEventListener("click", async (e) => {
  const g = e.target.closest("[data-go]");
  if (g) { e.preventDefault(); go(g.dataset.go); window.scrollTo(0, 0); return; }
  const el = e.target.closest("[data-act]");
  if (!el || el.tagName === "INPUT") return;
  const a = el.dataset.act;
  try {
    if (a === "logout") { await api("POST", "/api/admin/logout"); signedIn = false; render(); }
    else if (a === "copy") {
      const inp = document.getElementById(el.dataset.target);
      try { await navigator.clipboard.writeText(inp.value); toast("Copied"); } catch { inp.select(); toast("Selected. Press copy on your keyboard."); }
    }
    else if (a === "reset-link") { const r = await api("POST", `/api/admin/families/${el.dataset.id}/reset-link`); lastLink = { id: el.dataset.id, url: r.url, label: "Password reset link" }; render(); }
    else if (a === "setup-link") { const r = await api("POST", `/api/admin/families/${el.dataset.id}/setup-link`); lastLink = { id: el.dataset.id, url: r.url, label: "Set-up link" }; render(); }
    else if (a === "clear-devices") { await api("POST", `/api/admin/families/${el.dataset.id}/clear-devices`, { learnerId: el.dataset.learner }); toast("Devices cleared"); render(); }
    else if (a === "apply") { await api("POST", `/api/admin/families/${el.dataset.id}/apply-credit`, { creditId: el.dataset.credit, learnerId: el.dataset.learner }); toast("Pass added"); render(); }
    else if (a === "form") { contentForm = el.dataset.f; render(); }
    else if (a === "rm-media") { if (el.dataset.sure) { await api("DELETE", `/api/admin/media/${encodeURIComponent(el.dataset.code)}/${el.dataset.q}`); toast("Removed"); render(); } else { el.dataset.sure = "1"; el.textContent = "Tap again to remove"; } }
    else if (a === "rm-content") { if (el.dataset.sure) { await api("DELETE", `/api/admin/content/${encodeURIComponent(el.dataset.code)}`); toast("Content removed"); go("content"); } else { el.dataset.sure = "1"; el.textContent = "Tap again to remove this topic's content"; } }
  } catch (err) { toast(err.message); }
});
document.addEventListener("change", (e) => { if (e.target.dataset.act === "media") uploadMedia(e.target); });

document.addEventListener("submit", async (e) => {
  const f = e.target, kind = f.dataset.form;
  if (!kind) return;
  e.preventDefault();
  const errEl = f.querySelector("#formerr"); if (errEl) errEl.innerHTML = "";
  const btn = f.querySelector("[type=submit]"); if (btn) btn.disabled = true;
  try {
    const data = Object.fromEntries(new FormData(f));
    if (kind === "login") { await api("POST", "/api/admin/login", data); signedIn = true; render(); }
    else if (kind === "search") go("families/" + encodeURIComponent(data.q || ""));
    else if (kind === "days") { await api("POST", `/api/admin/families/${f.dataset.id}/add-days`, { learnerId: f.dataset.learner, days: Number(data.days), note: data.note }); toast("Pass updated"); render(); }
    else if (kind === "sale") { saleResult = await api("POST", "/api/admin/sale", data); render(); window.scrollTo(0, 0); }
    else if (kind === "content") {
      const file = f.querySelector("input[type=file]").files[0];
      uploadReport = await api("POST", "/api/admin/content", "text/markdown", await file.text());
      render(); window.scrollTo(0, 0);
    }
  } catch (err) { if (errEl) errEl.innerHTML = errBox(err); else toast(err.message); }
  finally { if (btn && document.body.contains(btn)) btn.disabled = false; }
});

window.addEventListener("hashchange", render);
render();
