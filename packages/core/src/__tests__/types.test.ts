import { describe, it, expectTypeOf } from "vitest";
import { createActivity } from "../create-activity.js";
import { createMockAdapter } from "./mock-adapter.js";
import type { ActivityInstance } from "../types.js";

describe("Type Inference", () => {
  const adapter = createMockAdapter();

  it("should infer action and resourceType literals", () => {
    const activity = createActivity({
      adapter,
      actions: ["create_property", "update_property", "login"] as const,
      resourceTypes: ["property", "user"] as const,
    });

    type Instance = typeof activity;

    expectTypeOf(activity).toMatchTypeOf<
      ActivityInstance<
        "create_property" | "update_property" | "login",
        "property" | "user"
      >
    >();
  });

  it("should type-check log action parameter", () => {
    const activity = createActivity({
      adapter,
      actions: ["create", "update"] as const,
      resourceTypes: ["property"] as const,
    });

    // Valid calls
    activity.log({ action: "create", resourceType: "property", userId: "u1" });
    activity.log({ action: "update", resourceType: "property", userId: "u1" });
  });

  it("should type-check format methods", () => {
    const activity = createActivity({
      adapter,
      actions: ["create", "update"] as const,
      resourceTypes: ["property", "user"] as const,
    });

    expectTypeOf(activity.format.action).parameter(0).toEqualTypeOf<
      "create" | "update"
    >();
    expectTypeOf(activity.format.resourceType).parameter(0).toEqualTypeOf<
      "property" | "user"
    >();
    expectTypeOf(activity.format.icon).parameter(0).toEqualTypeOf<
      "create" | "update"
    >();
    expectTypeOf(activity.format.color).parameter(0).toEqualTypeOf<
      "create" | "update"
    >();
  });
});
