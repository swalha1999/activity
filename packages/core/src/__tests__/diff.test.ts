import { describe, it, expect } from "vitest";
import { diffStates, formatDiff, getChangedFieldNames } from "../diff.js";

describe("Diff", () => {
  it("should diff two states", () => {
    const diffs = diffStates(
      { name: "Old", price: 500000, city: "NYC" },
      { name: "New", price: 500000, city: "LA" },
    );

    expect(diffs).toEqual([
      { field: "name", before: "Old", after: "New" },
      { field: "city", before: "NYC", after: "LA" },
    ]);
  });

  it("should detect added fields", () => {
    const diffs = diffStates({ name: "Test" }, { name: "Test", price: 100 });

    expect(diffs).toEqual([
      { field: "price", before: undefined, after: 100 },
    ]);
  });

  it("should detect removed fields", () => {
    const diffs = diffStates({ name: "Test", price: 100 }, { name: "Test" });

    expect(diffs).toEqual([
      { field: "price", before: 100, after: undefined },
    ]);
  });

  it("should handle nested objects", () => {
    const diffs = diffStates(
      { address: { city: "NYC", zip: "10001" } },
      { address: { city: "LA", zip: "90001" } },
    );

    expect(diffs).toHaveLength(1);
    expect(diffs[0].field).toBe("address");
  });

  it("should return empty for identical states", () => {
    const diffs = diffStates(
      { name: "Test", price: 100 },
      { name: "Test", price: 100 },
    );

    expect(diffs).toEqual([]);
  });

  it("should get changed field names", () => {
    const fields = getChangedFieldNames(
      { name: "Old", price: 500000 },
      { name: "New", price: 500000 },
    );

    expect(fields).toEqual(["name"]);
  });

  it("should format diff as human-readable string", () => {
    const diffs = diffStates(
      { price: 500000 },
      { price: 550000 },
    );

    const formatted = formatDiff(diffs);
    expect(formatted).toBe("Changed price from 500000 to 550000");
  });

  it("should format added fields", () => {
    const diffs = diffStates({}, { price: 100 });
    const formatted = formatDiff(diffs);
    expect(formatted).toBe("Added price: 100");
  });

  it("should format removed fields", () => {
    const diffs = diffStates({ price: 100 }, {});
    const formatted = formatDiff(diffs);
    expect(formatted).toBe("Removed price");
  });

  it("should handle no changes", () => {
    const formatted = formatDiff([]);
    expect(formatted).toBe("No changes");
  });
});
