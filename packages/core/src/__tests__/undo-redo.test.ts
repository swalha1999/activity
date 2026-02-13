import { describe, it, expect, beforeEach } from "vitest";
import { createActivity } from "../create-activity.js";
import { createMockAdapter } from "./mock-adapter.js";

describe("Undo/Redo", () => {
  let adapter: ReturnType<typeof createMockAdapter>;
  let activity: ReturnType<typeof createActivity<readonly ["create", "update", "delete"], readonly ["property", "user"]>>;

  beforeEach(() => {
    adapter = createMockAdapter();
    activity = createActivity({
      adapter,
      actions: ["create", "update", "delete"] as const,
      resourceTypes: ["property", "user"] as const,
      undoableActions: ["update", "delete"],
      undoBehavior: {
        update: "restore_state",
        delete: "restore",
      },
    });
  });

  it("canUndo returns true for undoable actions", async () => {
    const log = await activity.log({
      action: "update",
      resourceType: "property",
      userId: "user-1",
      resourceId: "prop-1",
      previousState: { name: "Old" },
      newState: { name: "New" },
    });

    expect(activity.canUndo(log)).toBe(true);
  });

  it("canUndo returns false for non-undoable actions", async () => {
    const log = await activity.log({
      action: "create",
      resourceType: "property",
      userId: "user-1",
    });

    expect(activity.canUndo(log)).toBe(false);
  });

  it("canUndo returns false for already undone actions", async () => {
    const log = await activity.log({
      action: "update",
      resourceType: "property",
      userId: "user-1",
      previousState: { name: "Old" },
      newState: { name: "New" },
    });

    // Manually mark as undone
    log.isUndone = true;

    expect(activity.canUndo(log)).toBe(false);
  });

  it("should undo an activity", async () => {
    const original = await activity.log({
      action: "update",
      resourceType: "property",
      userId: "user-1",
      resourceId: "prop-1",
      previousState: { name: "Old" },
      newState: { name: "New" },
    });

    const result = await activity.undo({
      activityId: original.id,
      userId: "user-1",
      reason: "mistake",
    });

    expect(result.success).toBe(true);
    expect(result.activity).toBeDefined();
    expect(result.activity!.action).toBe("undo_update");
    expect(result.activity!.parentId).toBe(original.id);
  });

  it("should fail to undo non-existent activity", async () => {
    const result = await activity.undo({
      activityId: "non-existent",
      userId: "user-1",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Activity not found");
  });

  it("canRedo returns true for undone activities", async () => {
    const log = await activity.log({
      action: "update",
      resourceType: "property",
      userId: "user-1",
      previousState: { name: "Old" },
      newState: { name: "New" },
    });

    log.isUndone = true;

    expect(activity.canRedo(log)).toBe(true);
  });

  it("canRedo returns false for non-undone activities", async () => {
    const log = await activity.log({
      action: "update",
      resourceType: "property",
      userId: "user-1",
    });

    expect(activity.canRedo(log)).toBe(false);
  });

  it("should undo a batch", async () => {
    const batchId = "batch-123";

    await activity.log({
      action: "update",
      resourceType: "property",
      userId: "user-1",
      resourceId: "p1",
      batchId,
      previousState: { name: "Old1" },
      newState: { name: "New1" },
    });

    await activity.log({
      action: "update",
      resourceType: "property",
      userId: "user-1",
      resourceId: "p2",
      batchId,
      previousState: { name: "Old2" },
      newState: { name: "New2" },
    });

    const result = await activity.undoBatch({
      batchId,
      userId: "user-1",
    });

    expect(result.success).toBe(true);
  });
});
