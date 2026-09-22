import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { rotateAutomaticBackups } from "../src/domain/backup";

describe("automatic backup rotation", () => {
  const temporaryDirectories: string[] = [];

  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
  });

  it("keeps the three newest automatic backups and removes older ones", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "marble-backups-"));
    temporaryDirectories.push(directory);
    for (let index = 1; index <= 4; index += 1) {
      const file = path.join(directory, `marble-backup-${index}.sqlite`);
      fs.writeFileSync(file, String(index));
      const time = new Date(2026, 0, index);
      fs.utimesSync(file, time, time);
    }

    const remaining = rotateAutomaticBackups(directory, 3).map((file) => path.basename(file));

    expect(remaining).toEqual([
      "marble-backup-4.sqlite",
      "marble-backup-3.sqlite",
      "marble-backup-2.sqlite",
    ]);
    expect(fs.existsSync(path.join(directory, "marble-backup-1.sqlite"))).toBe(false);
  });
});
