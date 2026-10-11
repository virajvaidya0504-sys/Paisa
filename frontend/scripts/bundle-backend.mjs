// After `vite build --mode demo`: copy the backend's Python source into the demo build so the
// browser can run it. Output: dist-demo/demo-backend.json  { "app/main.py": "<source>", ... }
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("../../backend/app", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const files = {};
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === "__pycache__") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith(".py")) files["app/" + relative(root, p).replaceAll("\\", "/")] = readFileSync(p, "utf8");
  }
})(root);

const out = new URL("../dist-demo/demo-backend.json", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
writeFileSync(out, JSON.stringify(files));
console.log(`bundled ${Object.keys(files).length} backend files`);
