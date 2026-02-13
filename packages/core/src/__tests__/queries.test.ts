import { describe, it, expect, beforeEach } from "vitest";
import { createActivity } from "../create-activity.js";
import { createMockAdapter } from "./mock-adapter.js";

describe("Queries", () => {
  let adapter: ReturnType<typeof createMockAdapter>;
  let activity: ReturnType<typeof createActivity<readonly ["create", "update", "delete"], readonly ["property", "user"]>>;

  beforeEach(() => {
    adapter = createMockAdapter();
    activity = createActivity({
      adapter,
      actions: ["create", "update", "delete"] as const,
      resourceTypes: ["property", "user"] as const,
    });
  });

  it("should get user activity", async () => {
    await activity.log({ action: "create", resourceType: "property", userId: "u1" });
    await activity.log({ action: "update", resourceType: "property", userId: "u2" });
    await activity.log({ action: "delete", resourceType: "property", userId: "u1" });

    const results = await activity.getUserActivity("u1");
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.userId === "u1")).toBe(true);
  });

  it("should get org activity", async () => {
    await activity.log({ action: "create", resourceType: "property", userId: "u1", organizationId: "org-1" });
    await activity.log({ action: "update", resourceType: "property", userId: "u1", organizationId: "org-2" });

    const results = await activity.getOrgActivity("org-1");
    expect(results).toHaveLength(1);
  });

  it("should get resource history", async () => {
    await activity.log({ action: "create", resourceType: "property", userId: "u1", resourceId: "p1" });
    await activity.log({ action: "update", resourceType: "property", userId: "u1", resourceId: "p1" });
    await activity.log({ action: "create", resourceType: "property", userId: "u1", resourceId: "p2" });

    const results = await activity.getResourceHistory({
      resourceType: "property",
      resourceId: "p1",
    });
    expect(results).toHaveLength(2);
  });

  it("should get activity by ID", async () => {
    const created = await activity.log({ action: "create", resourceType: "property", userId: "u1" });
    const result = await activity.getById(created.id);
    expect(result).toBeDefined();
    expect(result!.id).toBe(created.id);
  });

  it("should get by request ID", async () => {
    const reqId = "req-123";
    await activity.log({ action: "create", resourceType: "property", userId: "u1", requestId: reqId });
    await activity.log({ action: "update", resourceType: "property", userId: "u1", requestId: reqId });

    const results = await activity.getByRequestId(reqId);
    expect(results).toHaveLength(2);
  });

  it("should get by batch ID", async () => {
    const batchId = "batch-1";
    await activity.log({ action: "create", resourceType: "property", userId: "u1", batchId });
    await activity.log({ action: "create", resourceType: "property", userId: "u1", batchId });

    const results = await activity.getByBatchId(batchId);
    expect(results).toHaveLength(2);
  });

  it("should get stats", async () => {
    await activity.log({ action: "create", resourceType: "property", userId: "u1" });
    await activity.log({ action: "create", resourceType: "property", userId: "u2" });
    await activity.log({ action: "update", resourceType: "user", userId: "u1" });

    const stats = await activity.getStats({});
    expect(stats.total).toBe(3);
    expect(stats.byAction.create).toBe(2);
    expect(stats.byAction.update).toBe(1);
    expect(stats.byResourceType.property).toBe(2);
    expect(stats.byResourceType.user).toBe(1);
  });

  it("should filter user activity by actions", async () => {
    await activity.log({ action: "create", resourceType: "property", userId: "u1" });
    await activity.log({ action: "update", resourceType: "property", userId: "u1" });
    await activity.log({ action: "delete", resourceType: "property", userId: "u1" });

    const results = await activity.getUserActivity("u1", { actions: ["create", "update"] });
    expect(results).toHaveLength(2);
  });
});
