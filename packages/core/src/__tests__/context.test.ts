import { describe, it, expect, beforeEach } from "vitest";
import { createActivity } from "../create-activity.js";
import { setContext } from "../context.js";
import { createMockAdapter } from "./mock-adapter.js";

describe("Context (AsyncLocalStorage)", () => {
  let adapter: ReturnType<typeof createMockAdapter>;

  beforeEach(() => {
    adapter = createMockAdapter();
  });

  it("should auto-merge context into log entries", async () => {
    const activity = createActivity({
      adapter,
      actions: ["create"] as const,
      resourceTypes: ["property"] as const,
    });

    const result = await setContext(
      {
        userId: "ctx-user",
        organizationId: "ctx-org",
        requestId: "ctx-req",
        ipAddress: "127.0.0.1",
        userAgent: "TestAgent",
      },
      () =>
        activity.log({
          action: "create",
          resourceType: "property",
          userId: "ctx-user",
        }),
    );

    expect(result.userId).toBe("ctx-user");
    expect(result.organizationId).toBe("ctx-org");
    expect(result.requestId).toBe("ctx-req");
    expect(result.ipAddress).toBe("127.0.0.1");
    expect(result.userAgent).toBe("TestAgent");
  });

  it("should allow entry fields to override context", async () => {
    const activity = createActivity({
      adapter,
      actions: ["create"] as const,
      resourceTypes: ["property"] as const,
    });

    const result = await setContext(
      {
        userId: "ctx-user",
        organizationId: "ctx-org",
      },
      () =>
        activity.log({
          action: "create",
          resourceType: "property",
          userId: "explicit-user",
          organizationId: "explicit-org",
        }),
    );

    expect(result.userId).toBe("explicit-user");
    expect(result.organizationId).toBe("explicit-org");
  });
});
