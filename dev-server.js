// Local dev server: serves /public and runs /api/* handlers like Vercel does. Usage: node dev-server.js
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.dirname(fileURLToPath(import.meta.url));
try { for (const l of fs.readFileSync(path.join(root, ".env"), "utf8").split("\n")) { const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; } } catch {}
const routes = { "/api/generate": "./api/generate.js", "/api/create-form": "./api/create-form.js" };
http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (routes[url.pathname]) {
    let body = ""; for await (const c of req) body += c;
    try { req.body = body ? JSON.parse(body) : {}; } catch { req.body = {}; }
    res.status = (c) => ((res.statusCode = c), res);
    res.json = (o) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(o)); };
    return (await import(routes[url.pathname])).default(req, res);
  }
  const f = path.join(root, "public", url.pathname === "/" ? "index.html" : path.normalize(url.pathname));
  if (!f.startsWith(path.join(root, "public")) || !fs.existsSync(f)) { res.statusCode = 404; return res.end("Not found"); }
  res.setHeader("Content-Type", f.endsWith(".html") ? "text/html" : "application/octet-stream");
  fs.createReadStream(f).pipe(res);
}).listen(process.env.PORT || 3000, () => console.log("http://localhost:" + (process.env.PORT || 3000)));
