import type { DiffEntry } from "./types.js";

export function diffStates(
  oldState: Record<string, unknown>,
  newState: Record<string, unknown>,
): DiffEntry[] {
  const diffs: DiffEntry[] = [];
  const allKeys = new Set([...Object.keys(oldState), ...Object.keys(newState)]);

  for (const key of allKeys) {
    const before = oldState[key];
    const after = newState[key];

    if (!deepEqual(before, after)) {
      diffs.push({ field: key, before, after });
    }
  }

  return diffs;
}

export function getChangedFieldNames(
  oldState: Record<string, unknown>,
  newState: Record<string, unknown>,
): string[] {
  return diffStates(oldState, newState).map((d) => d.field);
}

export function formatDiff(diffs: DiffEntry[]): string {
  if (diffs.length === 0) return "No changes";

  return diffs
    .map((d) => {
      const before = formatValue(d.before);
      const after = formatValue(d.after);

      if (d.before === undefined) {
        return `Added ${d.field}: ${after}`;
      }
      if (d.after === undefined) {
        return `Removed ${d.field}`;
      }
      return `Changed ${d.field} from ${before} to ${after}`;
    })
    .join(", ");
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return "null";
  if (typeof val === "string") return val;
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  return JSON.stringify(val);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (a === undefined || b === undefined) return false;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }

  if (typeof a === "object" && typeof b === "object") {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);

    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key) => deepEqual(aObj[key], bObj[key]));
  }

  return false;
}
