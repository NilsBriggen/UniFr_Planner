import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const directory = fileURLToPath(new URL("../apps/web/dist/", import.meta.url));
const manifest = JSON.parse(
  readFileSync(resolve(directory, ".vite/manifest.json"), "utf8"),
);
const entries = Object.keys(manifest).filter((key) => manifest[key].isEntry);
if (!entries.length) throw new Error("Build manifest has no entry point");
const budget = Number(process.argv[2] ?? 200_000);
if (!Number.isSafeInteger(budget) || budget < 1)
  throw new Error("Invalid byte budget");
const visited = new Set();
function bytes(key) {
  if (visited.has(key)) return 0;
  visited.add(key);
  const chunk = manifest[key];
  if (!chunk) throw new Error(`Missing manifest chunk: ${key}`);
  return (
    gzipSync(readFileSync(resolve(directory, chunk.file))).length +
    (chunk.imports ?? []).reduce((sum, child) => sum + bytes(child), 0)
  );
}
const total = entries.reduce((sum, key) => sum + bytes(key), 0);
console.log(
  `Initial JavaScript: ${total.toLocaleString("en")} bytes gzip; budget ${budget.toLocaleString("en")}`,
);
if (total > budget)
  throw new Error("Initial JavaScript exceeds the delivery budget");
