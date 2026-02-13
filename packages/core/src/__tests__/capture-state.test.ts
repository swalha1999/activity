import { describe, it, expect } from "vitest";
import { captureState } from "../capture-state.js";

describe("captureState", () => {
  it("should deep clone an object", () => {
    const obj = { name: "Test", nested: { value: 42 } };
    const captured = captureState(obj);

    expect(captured).toEqual(obj);
    expect(captured).not.toBe(obj);
    expect((captured as any).nested).not.toBe(obj.nested);
  });

  it("should strip functions", () => {
    const obj = { name: "Test", method: () => {} };
    const captured = captureState(obj);

    expect(captured).toEqual({ name: "Test" });
  });

  it("should convert Dates to ISO strings", () => {
    const date = new Date("2024-01-01");
    const obj = { createdAt: date };
    const captured = captureState(obj);

    expect(captured.createdAt).toBe(date.toISOString());
  });

  it("should convert Maps to objects", () => {
    const obj = { data: new Map([["key", "value"]]) };
    const captured = captureState(obj);

    expect(captured.data).toEqual({ key: "value" });
  });

  it("should convert Sets to arrays", () => {
    const obj = { tags: new Set(["a", "b", "c"]) };
    const captured = captureState(obj);

    expect(captured.tags).toEqual(["a", "b", "c"]);
  });

  it("should handle null and undefined", () => {
    const obj = { a: null, b: undefined };
    const captured = captureState(obj);

    expect(captured.a).toBeNull();
    expect(captured.b).toBeUndefined();
  });
});
