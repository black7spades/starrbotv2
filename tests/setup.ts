import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// Point the JSON store at a throwaway directory before any module that reads
// STARRBOT_DATA_DIR is imported, so tests never touch the repo's data/ dir.
const dir = mkdtempSync(join(tmpdir(), "starrbot-test-"));
process.env.STARRBOT_DATA_DIR = dir;

process.on("exit", () => {
  rmSync(dir, { recursive: true, force: true });
});
