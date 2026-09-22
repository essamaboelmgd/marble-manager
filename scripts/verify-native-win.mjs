import fs from "node:fs";
import path from "node:path";

const nativePath = path.resolve("node_modules/better-sqlite3/build/Release/better_sqlite3.node");
if (!fs.existsSync(nativePath)) {
  throw new Error(`Missing native SQLite module: ${nativePath}`);
}

const signature = fs.readFileSync(nativePath).subarray(0, 2).toString("ascii");
if (signature !== "MZ") {
  throw new Error(`Windows build requires a PE/Windows native module, but found signature ${JSON.stringify(signature)} in ${nativePath}`);
}

console.log(`Verified Windows native SQLite module: ${nativePath}`);
