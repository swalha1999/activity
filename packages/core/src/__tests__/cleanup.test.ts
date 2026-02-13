import { describe, it, expect, beforeEach } from "vitest";
import { createActivity } from "../create-activity.js";
import { createMockAdapter } from "./mock-adapter.js";

describe("Cleanup", () => {
  let adapter: ReturnType<typeof createMockAdapter>;

  beforeEach(() => {
    adapter = createMockAdapter();
  });

  it("should cleanup old records", async () => {
    const activity = createActivity({
      adapter,
      actions: ["create"] as const,
      resourceTypes: ["property"] as const,
    });

    // Create a record with an old date
    const oldLog = await activity.log({ action: "create", resourceType: "property", userId: "u1" });
    oldLog.createdAt = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000); // 100 days ago
    adapter.records[0] = oldLog;

    // Create a recent record
    await activity.log({ action: "create", resourceType: "property", userId: "u1" });

    const result = await activity.cleanup({ olderThan: 30 });
    expect(result.deleted).toBe(1);
    expect(adapter.records).toHaveLength(1);
  });

  it("should support dry run", async () => {
    const activity = createActivity({
      adapter,
      actions: ["create"] as const,
      resourceTypes: ["property"] as const,
    });

    await activity.log({ action: "create", resourceType: "property", userId: "u1" });
    const oldLog = adapter.records[0];
    oldLog.createdAt = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);

    await activity.log({ action: "create", resourceType: "property", userId: "u1" });

    const result = await activity.cleanup({ olderThan: 30, dryRun: true });
    expect(result.deleted).toBe(1);
    expect(adapter.records).toHaveLength(2); // No actual deletion
  });

  it("should get storage stats", async () => {
    const activity = createActivity({
      adapter,
      actions: ["create"] as const,
      resourceTypes: ["property"] as const,
    });

    await activity.log({ action: "create", resourceType: "property", userId: "u1" });
    await activity.log({ action: "create", resourceType: "property", userId: "u1" });

    const stats = await activity.getStorageStats();
    expect(stats.totalRecords).toBe(2);
    expect(stats.oldestRecord).toBeInstanceOf(Date);
    expect(stats.newestRecord).toBeInstanceOf(Date);
    expect(stats.sizeEstimate).toBe("2.0 KB");
  });
});
