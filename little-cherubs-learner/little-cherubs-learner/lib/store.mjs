// Storage layer.
// On Netlify this uses Netlify Blobs (built in, no database account needed).
// Locally (LCL_LOCAL_STORE=<folder>) it uses plain files, so the app can be run
// and tested without Netlify.

import { getStore } from "@netlify/blobs";
import fs from "node:fs/promises";
import path from "node:path";

const LOCAL_DIR = process.env.LCL_LOCAL_STORE || "";

function localStore(name) {
  const dir = path.join(LOCAL_DIR, name);
  const file = (key) => path.join(dir, encodeURIComponent(key));
  return {
    async getJSON(key) {
      try { return JSON.parse(await fs.readFile(file(key) + ".json", "utf8")); } catch { return null; }
    },
    async setJSON(key, value) {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(file(key) + ".json", JSON.stringify(value));
    },
    async getBytes(key) {
      try { return new Uint8Array(await fs.readFile(file(key) + ".bin")); } catch { return null; }
    },
    async setBytes(key, bytes) {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(file(key) + ".bin", Buffer.from(bytes));
    },
    async del(key) {
      for (const ext of [".json", ".bin"]) { try { await fs.unlink(file(key) + ext); } catch {} }
    },
    async list(prefix = "") {
      let names = [];
      try { names = await fs.readdir(dir); } catch { return []; }
      return names
        .map((n) => decodeURIComponent(n.replace(/\.(json|bin)$/, "")))
        .filter((k) => k.startsWith(prefix))
        .sort();
    },
  };
}

function blobStore(name) {
  const s = getStore({ name, consistency: "strong" });
  return {
    async getJSON(key) { return (await s.get(key, { type: "json" })) ?? null; },
    async setJSON(key, value) { await s.setJSON(key, value); },
    async getBytes(key) {
      const b = await s.get(key, { type: "arrayBuffer" });
      return b ? new Uint8Array(b) : null;
    },
    async setBytes(key, bytes) {
      const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      await s.set(key, buf);
    },
    async del(key) { await s.delete(key); },
    async list(prefix = "") {
      const keys = [];
      for await (const page of s.list({ prefix, paginate: true })) {
        for (const b of page.blobs) keys.push(b.key);
      }
      return keys.sort();
    },
  };
}

const cache = new Map();
export function store(name) {
  if (!cache.has(name)) cache.set(name, LOCAL_DIR ? localStore(name) : blobStore(name));
  return cache.get(name);
}

// Named stores used by the app
export const families = () => store("families");   // familyId -> family record
export const indexes = () => store("index");       // email, setup/reset tokens, processed sales
export const sessions = () => store("sessions");   // session id -> session
export const progress = () => store("progress");   // learnerId -> progress
export const content = () => store("content");     // competence code -> parsed content
export const media = () => store("media");         // video/audio chunks and their details
export const logs = () => store("logs");           // sales and reminder log
