// Turns a content set written to the Style Guide (exported from Claude Docs as
// Markdown) into the pieces the app shows: lesson, practical, questions,
// video scenes and teacher notes.

import { marked } from "marked";
import sanitizeHtml from "sanitize-html";
import curriculum from "../config/curriculum-biology.mjs";

const SANITIZE = {
  allowedTags: [
    "h1", "h2", "h3", "h4", "p", "br", "hr", "strong", "b", "em", "i", "u", "sub", "sup", "code", "pre",
    "ul", "ol", "li", "blockquote", "table", "thead", "tbody", "tr", "th", "td", "div", "span",
    "details", "summary", "a",
  ],
  allowedAttributes: { div: ["class"], span: ["class"], a: ["href"], th: ["align"], td: ["align"] },
  allowedSchemes: ["https"],
};

export function mdToHtml(md) {
  let html = marked.parse(md || "", { gfm: true, breaks: false });
  html = sanitizeHtml(html, SANITIZE);
  html = html.replace(/<table>/g, '<div class="tbl"><table>').replace(/<\/table>/g, "</table></div>");
  // Quick check answers stay hidden until the learner taps.
  html = html.replace(/<p><strong>Answers?:<\/strong>([\s\S]*?)<\/p>/g,
    '<details class="answers"><summary>Show answers</summary><p>$1</p></details>');
  return html;
}

export function findCompetence(code) {
  for (const [form, concepts] of Object.entries(curriculum.forms)) {
    for (const c of concepts) {
      const comp = c.competences.find((x) => x.code === code);
      if (comp) return { ...comp, form: Number(form), concept: c.no, conceptName: c.name };
    }
  }
  return null;
}

// Split "## 1. Lesson notes" style sections.
function sections(md) {
  const out = {};
  const parts = md.split(/^##\s+(?=\d+\.)/m);
  for (const part of parts.slice(1)) {
    const nl = part.indexOf("\n");
    const head = part.slice(0, nl).trim();
    const body = part.slice(nl + 1);
    const m = head.match(/^(\d+)\.\s*(.+)$/);
    if (!m) continue;
    const name = m[2].toLowerCase();
    const key = name.startsWith("lesson") ? "lesson"
      : name.startsWith("practical") ? "practical"
      : name.startsWith("question") ? "questions"
      : name.startsWith("video") ? "video"
      : name.startsWith("teacher") ? "teacher" : null;
    if (key) out[key] = { title: m[2].trim(), body };
  }
  return out;
}

// Remove the "**Competence ID:** ..." header paragraph that opens each section.
const stripHeader = (body) => body.replace(/^\s*\*\*Competence ID:\*\*[^\n]*(\n(?!\s*\n)[^\n]*)*\n/, "").trim();

const between = (text, start, ends) => {
  const i = text.indexOf(start);
  if (i < 0) return "";
  let rest = text.slice(i + start.length);
  let cut = rest.length;
  for (const e of ends) { const j = rest.indexOf(e); if (j >= 0 && j < cut) cut = j; }
  return rest.slice(0, cut).trim();
};

function parseQuestions(body, code, warnings) {
  const blocks = body.split(/^###\s+(?=Q\d+)/m).slice(1);
  const qs = [];
  for (const raw of blocks) {
    const qid = (raw.match(/^Q\d+/) || [""])[0];
    const id = (raw.match(/\*\*ID:\*\*\s*([A-Za-z0-9.\-]+)/) || [])[1] || `${code}-${qid}`;
    const type = ((raw.match(/\*\*Type:\*\*\s*([^·\n*]+)/) || [])[1] || "").trim();
    const aoRaw = ((raw.match(/\*\*AO:\*\*\s*([^·\n*]+)/) || [])[1] || "").trim();
    const marks = Number((raw.match(/\*\*Marks:\*\*\s*(\d+)/) || [])[1] || 0);
    const diff = ((raw.match(/\*\*Difficulty:\*\*\s*([A-Za-z]+)/) || [])[1] || "").trim();
    const question = between(raw, "**Question:**", ["**Options:**", "**Correct answer:**"]);
    const correct = between(raw, "**Correct answer:**", ["**Explanation:**", "**Marking points:**"]);
    const explanation = between(raw, "**Explanation:**", ["**Marking points:**"]);
    const marking = raw.includes("**Marking points:**") ? raw.slice(raw.indexOf("**Marking points:**") + 19).trim() : "";
    const isMcq = /mcq|multiple/i.test(type);
    const q = { qid, id, type: isMcq ? "MCQ" : /struct/i.test(type) ? "Structured" : "Short answer", aoRaw, marks, diff,
      questionHtml: mdToHtml(question), explanationHtml: mdToHtml(explanation) };
    if (!question) warnings.push(`${qid}: no question text found.`);
    if (!marks) warnings.push(`${qid}: no marks found.`);
    if (isMcq) {
      const optText = between(raw, "**Options:**", ["**Correct answer:**"]);
      q.options = [...optText.matchAll(/^\s*[-*]\s*([A-D])[.)]\s*(.+)$/gm)].map((m) => m[2].trim());
      const letter = (correct.match(/\b([A-D])\b/) || [])[1];
      q.answer = letter ? "ABCD".indexOf(letter) : -1;
      q.ao = (aoRaw.match(/[ABC]/) || ["A"])[0];
      if (q.options.length !== 4) warnings.push(`${qid}: expected 4 options, found ${q.options.length}.`);
      if (q.answer < 0) warnings.push(`${qid}: correct answer letter not found.`);
    } else {
      // Parts like "(a) \[A\] Complete the table. (5 marks)"
      const parts = [];
      for (const m of question.matchAll(/^\(([a-z])\)\s*\\?\[([ABC])\\?\][^\n]*?\((\d+)\s*marks?\)\s*$/gim)) {
        parts.push({ label: `(${m[1]})`, ao: m[2].toUpperCase(), marks: Number(m[3]) });
      }
      if (!parts.length) parts.push({ label: "", ao: (aoRaw.match(/[ABC]/) || ["A"])[0], marks });
      const sum = parts.reduce((s, p) => s + p.marks, 0);
      if (sum !== marks) warnings.push(`${qid}: parts add up to ${sum} marks but the question says ${marks}.`);
      q.parts = parts;
      q.modelHtml = mdToHtml(correct);
      q.markingHtml = mdToHtml(marking);
    }
    qs.push(q);
  }
  return qs;
}

function parseScenes(body) {
  const scenes = [];
  for (const m of body.matchAll(/^###\s+Scene\s+\d+\s*[—–-]\s*(.+?)\s*\((\d+:\d{2})[^)]*\)\s*$/gm)) {
    scenes.push({ title: m[1].trim(), start: m[2] });
  }
  return scenes;
}

export function parseContentDoc(md) {
  const warnings = [];
  const text = String(md || "").replace(/\r\n/g, "\n");
  const codeMatch = text.match(/BIO-F(\d)-(\d+\.\d+\.\d+\.\d+)/);
  if (!codeMatch) return { ok: false, error: "No Competence ID (e.g. BIO-F1-1.3.1.1) found in the document." };
  const code = codeMatch[2];
  const comp = findCompetence(code);
  if (!comp) return { ok: false, error: `Competence ${code} is not in the curriculum map.` };
  if (comp.form !== Number(codeMatch[1])) warnings.push(`The ID says Form ${codeMatch[1]} but ${code} is a Form ${comp.form} competence.`);

  const sec = sections(text);
  const out = { code, form: comp.form, title: comp.title, updatedAt: Date.now() };
  if (sec.lesson) out.lessonHtml = mdToHtml(stripHeader(sec.lesson.body)); else warnings.push("No lesson notes section.");
  if (sec.practical) { out.practicalTitle = sec.practical.title; out.practicalHtml = mdToHtml(stripHeader(sec.practical.body)); }
  else warnings.push("No practical section.");
  if (sec.questions) out.questions = parseQuestions(sec.questions.body, code, warnings);
  else { out.questions = []; warnings.push("No questions section."); }
  if (sec.video) { out.videoTitle = sec.video.title.replace(/^Video script:\s*/i, "").replace(/^"|"$/g, ""); out.scenes = parseScenes(sec.video.body); out.scriptHtml = mdToHtml(stripHeader(sec.video.body)); }
  if (sec.teacher) out.teacherHtml = mdToHtml(stripHeader(sec.teacher.body));

  const aoMax = { A: 0, B: 0, C: 0 };
  for (const q of out.questions) {
    if (q.type === "MCQ") aoMax[q.ao] += q.marks;
    else for (const p of q.parts) aoMax[p.ao] += p.marks;
  }
  out.aoMax = aoMax;
  out.totalMarks = aoMax.A + aoMax.B + aoMax.C;
  return { ok: true, content: out, warnings };
}

// What the learner's browser receives: no answers, no marking points.
export function learnerView(c) {
  return {
    code: c.code, title: c.title, lessonHtml: c.lessonHtml || "", practicalTitle: c.practicalTitle || "Practical",
    practicalHtml: c.practicalHtml || "", videoTitle: c.videoTitle || "", scenes: c.scenes || [], scriptHtml: c.scriptHtml || "",
    totalMarks: c.totalMarks, aoMax: c.aoMax,
    questions: (c.questions || []).map((q) => ({
      qid: q.qid, id: q.id, type: q.type, marks: q.marks, diff: q.diff, questionHtml: q.questionHtml,
      options: q.options, parts: q.parts,
    })),
  };
}
