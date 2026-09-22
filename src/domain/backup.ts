import fs from "node:fs";
import path from "node:path";

export function rotateAutomaticBackups(directory: string, keep = 3): string[] {
  fs.mkdirSync(directory, { recursive: true });
  const backups = fs.readdirSync(directory)
    .filter((file) => /^marble-backup-.*\.sqlite$/.test(file))
    .map((file) => {
      const fullPath = path.join(directory, file);
      return { file: fullPath, time: fs.statSync(fullPath).mtimeMs };
    })
    .sort((a, b) => b.time - a.time);
  for (const old of backups.slice(Math.max(keep, 0))) fs.unlinkSync(old.file);
  return backups.slice(0, Math.max(keep, 0)).map((entry) => entry.file);
}
