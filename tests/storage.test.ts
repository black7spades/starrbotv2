import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { existsSync, readdirSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { storageReport, sweep } from "utils/storage";
import { systemLog } from "utils/systemLog";

const DATA_DIR = process.env.STARRBOT_DATA_DIR as string;

function clearDataDir(): void {
  for (const name of readdirSync(DATA_DIR)) {
    try {
      unlinkSync(join(DATA_DIR, name));
    } catch {
      // Directories (transcripts) are left alone.
    }
  }
}

beforeEach(() => {
  clearDataDir();
  systemLog.clear();
});

afterAll(() => {
  systemLog.close();
});

describe("storageReport", () => {
  it("reports every growing store, even when nothing exists yet", () => {
    const report = storageReport();
    const names = report.entries.map((e) => e.name);

    expect(names).toContain("System log");
    expect(names).toContain("Ticket transcripts");
    expect(names).toContain("Ticket index");
    expect(names).toContain("Configuration");
    expect(report.totalBytes).toBeGreaterThanOrEqual(0);
  });

  it("counts records in a JSON array store", () => {
    writeFileSync(
      join(DATA_DIR, "tickets-log.json"),
      JSON.stringify([{ threadId: "1" }, { threadId: "2" }, { threadId: "3" }])
    );

    const index = storageReport().entries.find((e) => e.name === "Ticket index");
    expect(index?.items).toBe(3);
    expect(index?.bytes).toBeGreaterThan(0);
  });

  it("survives a store whose JSON is corrupt", () => {
    writeFileSync(join(DATA_DIR, "tickets-log.json"), "{not json");

    const index = storageReport().entries.find((e) => e.name === "Ticket index");
    expect(index?.items).toBeNull();
    expect(index?.bytes).toBeGreaterThan(0);
  });

  it("tracks the live system log against its limits", () => {
    systemLog.add("info", "hello", "test");
    systemLog.add("warn", "there", "test");

    const report = storageReport();
    expect(report.log.entries).toBe(2);
    expect(report.log.bytes).toBeGreaterThan(0);
    expect(report.log.limits.maxEntries).toBeGreaterThan(0);
    expect(report.log.newest).toBeGreaterThanOrEqual(report.log.oldest as number);
  });

  it("notices temp files left behind by an interrupted write", () => {
    writeFileSync(join(DATA_DIR, "bots.json.999.tmp"), "half-written");
    expect(storageReport().strayTempFiles).toBe(1);
  });
});

describe("sweep", () => {
  it("removes stray temp files and reports what it freed", () => {
    const stray = join(DATA_DIR, "bots.json.999.tmp");
    writeFileSync(stray, "x".repeat(1000));

    const result = sweep();

    expect(result.tempFilesRemoved).toBe(1);
    expect(result.freedBytes).toBeGreaterThanOrEqual(1000);
    expect(existsSync(stray)).toBe(false);
    expect(storageReport().strayTempFiles).toBe(0);
  });

  it("leaves transcripts alone unless a retention period is given", () => {
    // No retention period configured is the default, and the default must never
    // delete the only record of a ticket.
    expect(sweep().transcriptsDeleted).toBe(0);
    expect(sweep(0).transcriptsDeleted).toBe(0);
    expect(sweep(-5).transcriptsDeleted).toBe(0);
  });

  it("is a no-op on a clean directory", () => {
    const result = sweep();
    expect(result.tempFilesRemoved).toBe(0);
    expect(result.transcriptsDeleted).toBe(0);
    expect(result.logEntriesDropped).toBe(0);
  });

  it("persists the log so entries survive a restart", () => {
    systemLog.add("error", "something broke", "test");
    sweep();
    expect(storageReport().log.fileBytes).toBeGreaterThan(0);
  });
});
