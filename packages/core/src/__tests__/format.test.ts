import { describe, it, expect } from "vitest";
import { createActivity } from "../create-activity.js";
import { createMockAdapter } from "./mock-adapter.js";
import type { ActivityLog } from "../types.js";

describe("Format", () => {
  const adapter = createMockAdapter();
  const activity = createActivity({
    adapter,
    actions: ["create_property", "update_property", "login"] as const,
    resourceTypes: ["property", "user"] as const,
    format: {
      action: {
        create_property: "Created",
        update_property: "Updated",
        login: "Logged in",
      },
      resourceType: {
        property: "Property",
        user: "User",
      },
      icon: {
        create_property: "plus",
        update_property: "edit",
        login: "key",
      },
      color: {
        create_property: "green",
        update_property: "blue",
        login: "gray",
      },
    },
  });

  it("should format action label", () => {
    expect(activity.format.action("create_property")).toBe("Created");
    expect(activity.format.action("login")).toBe("Logged in");
  });

  it("should format resource type label", () => {
    expect(activity.format.resourceType("property")).toBe("Property");
    expect(activity.format.resourceType("user")).toBe("User");
  });

  it("should return icon", () => {
    expect(activity.format.icon("create_property")).toBe("plus");
    expect(activity.format.icon("update_property")).toBe("edit");
  });

  it("should return color", () => {
    expect(activity.format.color("create_property")).toBe("green");
    expect(activity.format.color("update_property")).toBe("blue");
  });

  it("should format full sentence", () => {
    const log: ActivityLog = {
      id: "1",
      action: "create_property",
      resourceType: "property",
      resourceId: null,
      previousState: null,
      newState: null,
      changedFields: null,
      userId: "u1",
      organizationId: null,
      ipAddress: null,
      userAgent: null,
      requestId: null,
      parentId: null,
      batchId: null,
      isUndone: false,
      undoneBy: null,
      undoneAt: null,
      metadata: {},
      createdAt: new Date(),
    };

    expect(activity.format.full(log, { userName: "John" })).toBe(
      "John created property",
    );
  });

  it("should format short label", () => {
    const log: ActivityLog = {
      id: "1",
      action: "create_property",
      resourceType: "property",
      resourceId: null,
      previousState: null,
      newState: null,
      changedFields: null,
      userId: "u1",
      organizationId: null,
      ipAddress: null,
      userAgent: null,
      requestId: null,
      parentId: null,
      batchId: null,
      isUndone: false,
      undoneBy: null,
      undoneAt: null,
      metadata: {},
      createdAt: new Date(),
    };

    expect(activity.format.short(log)).toBe("Created property");
  });

  it("should fall back to raw action string", () => {
    const activity2 = createActivity({
      adapter,
      actions: ["custom_action"] as const,
      resourceTypes: ["thing"] as const,
    });

    expect(activity2.format.action("custom_action")).toBe("custom_action");
  });
});
