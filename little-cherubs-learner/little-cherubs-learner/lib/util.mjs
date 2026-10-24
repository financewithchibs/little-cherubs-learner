import crypto from "node:crypto";

export const DAY = 86400000;

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

export class HttpError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export const fail = (status, code, message) => { throw new HttpError(status, code, message); };

export async function readJSON(req, maxBytes = 200_000) {
  const text = await req.text();
  if (text.length > maxBytes) fail(413, "TOO_LARGE", "That request is too large.");
  if (!text) return {};
  try { return JSON.parse(text); } catch { fail(400, "BAD_JSON", "The request could not be read."); }
}

export function parseCookies(req) {
  const out = {};
  const raw = req.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function cookie(name, value, { maxAgeDays = 30, clear = false } = {}) {
  const secure = process.env.LCL_INSECURE_COOKIES ? "" : "; Secure";
  if (clear) return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeDays * 86400}${secure}`;
}

export const newId = (bytes = 12) => crypto.randomBytes(bytes).toString("base64url");

export function hashSecret(secret) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(secret), salt, 32);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export function verifySecret(secret, stored) {
  if (!stored || !stored.startsWith("scrypt$")) return false;
  const [, saltB64, hashB64] = stored.split("$");
  const expected = Buffer.from(hashB64, "base64url");
  const actual = crypto.scryptSync(String(secret), Buffer.from(saltB64, "base64url"), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

export function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export const normEmail = (e) => String(e || "").trim().toLowerCase();
export const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
export const cleanText = (s, max = 80) => String(s ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, max);

export function siteUrl(req) {
  return (process.env.SITE_URL || process.env.URL || new URL(req.url).origin).replace(/\/$/, "");
}
