// Run the whole app on your computer without Netlify:
//   npm install
//   ADMIN_PASSWORD=choose-a-long-one SELAR_WEBHOOK_KEY=any-16-plus-characters npm run dev
// Then open http://localhost:8888 (app) and http://localhost:8888/admin/ (admin).
// Data is kept in the .data folder.

import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
process.env.LCL_LOCAL_STORE ||= path.join(root, ".data");
process.env.LCL_INSECURE_COOKIES ||= "1";
const { default: api } = await import("../netlify/functions/api.mjs");

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".json": "application/json", ".webmanifest": "application/manifest+json", ".ico": "image/x-icon" };

export function createServer(port = Number(process.env.PORT) || 8888) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://localhost:${port}`);
      if (url.pathname.startsWith("/api/")) {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const body = chunks.length ? Buffer.concat(chunks) : undefined;
        const request = new Request(url, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : body });
        const r = await api(request);
        const headers = {};
        r.headers.forEach((v, k) => { headers[k] = v; });
        res.writeHead(r.status, headers);
        res.end(Buffer.from(await r.arrayBuffer()));
        return;
      }
      let file = url.pathname === "/" ? "/index.html" : url.pathname;
      if (file === "/admin" || file.startsWith("/admin/")) file = "/admin.html";
      const full = path.join(root, "public", path.normalize(file).replace(/^(\.\.[/\\])+/, ""));
      const data = await fs.readFile(full).catch(() => null);
      if (!data) { res.writeHead(404); res.end("Not found"); return; }
      res.writeHead(200, { "content-type": TYPES[path.extname(full)] || "application/octet-stream" });
      res.end(data);
    } catch (e) {
      console.error(e);
      res.writeHead(500); res.end("Server error");
    }
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const port = Number(process.env.PORT) || 8888;
  await createServer(port);
  console.log(`Little Cherubs Learner running at http://localhost:${port}  (admin: /admin/)`);
}
