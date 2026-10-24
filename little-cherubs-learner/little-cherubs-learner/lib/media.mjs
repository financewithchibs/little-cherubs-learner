// Video and audio: stored in 3 MB pieces and streamed only to signed-in
// learners with an active pass. Browsers ask for byte ranges, so seeking works.

import { media } from "./store.mjs";
import { newId, fail } from "./util.mjs";

export const CHUNK = 3 * 1024 * 1024;
export const QUALITIES = {
  "240": { label: "Data saver", sub: "240p", types: ["video/mp4"] },
  "360": { label: "Phone", sub: "360p", types: ["video/mp4"] },
  audio: { label: "Audio only", sub: "MP3", types: ["audio/mpeg", "audio/mp3"] },
};
const MAX_SIZE = 200 * 1024 * 1024;

const metaKey = (code, q) => `${code}/${q}/meta`;
const chunkKey = (code, q, upload, i) => `${code}/${q}/${upload}/${i}`;

export function checkQuality(q) { if (!QUALITIES[q]) fail(400, "BAD_QUALITY", "Quality must be 240, 360 or audio."); }

export async function mediaInfo(code) {
  const out = {};
  for (const q of Object.keys(QUALITIES)) {
    const m = await media().getJSON(metaKey(code, q));
    if (m?.complete) out[q] = { size: m.size, type: m.type, uploadedAt: m.uploadedAt };
  }
  return out;
}

export async function startUpload(code, q, size, type) {
  checkQuality(q);
  size = Number(size);
  if (!(size > 0) || size > MAX_SIZE) fail(400, "BAD_SIZE", "File must be between 1 byte and 200 MB.");
  type = String(type || "").toLowerCase();
  if (!QUALITIES[q].types.includes(type)) fail(400, "BAD_TYPE", q === "audio" ? "Audio must be an MP3 file." : "Video must be an MP4 file.");
  const uploadId = newId(8);
  await media().setJSON(`${code}/${q}/pending-${uploadId}`, { size, type, chunks: Math.ceil(size / CHUNK), startedAt: Date.now() });
  return { uploadId, chunkSize: CHUNK, chunks: Math.ceil(size / CHUNK) };
}

export async function putChunk(code, q, uploadId, index, bytes) {
  checkQuality(q);
  const pending = await media().getJSON(`${code}/${q}/pending-${uploadId}`);
  if (!pending) fail(404, "NO_UPLOAD", "Upload not found. Start again.");
  const i = Number(index);
  if (!(i >= 0 && i < pending.chunks)) fail(400, "BAD_INDEX", "Bad piece number.");
  const expected = i === pending.chunks - 1 ? pending.size - i * CHUNK : CHUNK;
  if (bytes.byteLength !== expected) fail(400, "BAD_PIECE", `Piece ${i} should be ${expected} bytes, got ${bytes.byteLength}.`);
  await media().setBytes(chunkKey(code, q, uploadId, i), bytes);
  return { ok: true };
}

export async function completeUpload(code, q, uploadId) {
  checkQuality(q);
  const pendingKey = `${code}/${q}/pending-${uploadId}`;
  const pending = await media().getJSON(pendingKey);
  if (!pending) fail(404, "NO_UPLOAD", "Upload not found. Start again.");
  for (let i = 0; i < pending.chunks; i++) {
    const b = await media().getBytes(chunkKey(code, q, uploadId, i));
    if (!b) fail(400, "MISSING_PIECE", `Piece ${i} is missing. Upload again.`);
  }
  const old = await media().getJSON(metaKey(code, q));
  await media().setJSON(metaKey(code, q), { ...pending, uploadId, complete: true, uploadedAt: Date.now() });
  await media().del(pendingKey);
  if (old?.uploadId) await removeChunks(code, q, old.uploadId, old.chunks);
  return { ok: true, size: pending.size };
}

async function removeChunks(code, q, uploadId, n) {
  for (let i = 0; i < n; i++) await media().del(chunkKey(code, q, uploadId, i));
}

export async function deleteMedia(code, q) {
  checkQuality(q);
  const m = await media().getJSON(metaKey(code, q));
  if (m) { await removeChunks(code, q, m.uploadId, m.chunks); await media().del(metaKey(code, q)); }
}

export async function streamMedia(req, code, q) {
  checkQuality(q);
  const m = await media().getJSON(metaKey(code, q));
  if (!m?.complete) fail(404, "NO_MEDIA", "This video hasn't been uploaded yet.");
  const range = req.headers.get("range");
  let start = 0, end = m.size - 1;
  if (range) {
    const r = range.match(/bytes=(\d*)-(\d*)/);
    if (!r) return new Response(null, { status: 416, headers: { "content-range": `bytes */${m.size}` } });
    if (r[1] === "" && r[2] !== "") { start = Math.max(0, m.size - Number(r[2])); }
    else { start = Number(r[1] || 0); if (r[2] !== "") end = Number(r[2]); }
    if (start >= m.size) return new Response(null, { status: 416, headers: { "content-range": `bytes */${m.size}` } });
  }
  const idx = Math.floor(start / CHUNK);
  end = Math.min(end, m.size - 1, (idx + 1) * CHUNK - 1);
  const bytes = await media().getBytes(chunkKey(code, q, m.uploadId, idx));
  if (!bytes) fail(500, "MEDIA_BROKEN", "Part of this video is missing. Ask the admin to upload it again.");
  const slice = bytes.subarray(start - idx * CHUNK, end - idx * CHUNK + 1);
  const whole = start === 0 && end === m.size - 1 && !range;
  return new Response(slice, {
    status: whole ? 200 : 206,
    headers: {
      "content-type": m.type,
      "content-length": String(slice.byteLength),
      "accept-ranges": "bytes",
      ...(whole ? {} : { "content-range": `bytes ${start}-${end}/${m.size}` }),
      "cache-control": "private, no-store",
      "content-disposition": "inline",
    },
  });
}
