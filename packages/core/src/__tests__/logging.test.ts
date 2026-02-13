import { describe, it, expect, beforeEach } from "vitest";
import { createActivity } from "../create-activity.js";
import { createMockAdapter } from "./mock-adapter.js";

describe("Logging", () => {
  const adapter = createMockAdapter();

  beforeEach(() => {
    adapter.records.length = 0;
  });

  const activity = createActivity({
    adapter,
    actions: ["create", "update", "delete"] as const,
    resourceTypes: ["property", "user"] as const,
  });

  it("should log a single activity", async () => {
    const result = await activity.log({
      action: "create",
      resourceType: "property",
      userId: "user-1",
      resourceId: "prop-1",
      newState: { name: "Test Property", price: 500000 },
    });

    expect(result.id).toBeDefined();
    expect(result.action).toBe("create");
    expect(result.resourceType).toBe("property");
    expect(result.userId).toBe("user-1");
    expect(result.newState).toEqual({ name: "Test Property", price: 500000 });
  });

  it("should auto-compute changed_fields", async () => {
    const result = await activity.log({
      action: "update",
      resourceType: "property",
      userId: "user-1",
      resourceId: "prop-1",
      previousState: { name: "Old Name", price: 500000 },
      newState: { name: "New Name", price: 500000 },
    });

    expect(result.changedFields).toEqual(["name"]);
  });

  it("should logAsync without blocking", () => {
    activity.logAsync({
      action: "create",
      resourceType: "user",
      userId: "user-1",
    });
    // Should not throw
  });

  it("should logBatch with shared fields", async () => {
    const results = await activity.logBatch(
      [
        { action: "create", resourceType: "property", userId: "user-1", resourceId: "p1" },
        { action: "create", resourceType: "property", userId: "user-1", resourceId: "p2" },
      ],
      { userId: "user-1", batchId: "batch-1" } as any,
    );

    expect(results).toHaveLength(2);
    expect(results[0].batchId).toBe("batch-1");
    expect(results[1].batchId).toBe("batch-1");
  });
});
