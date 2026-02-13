export function captureState(obj: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(obj, (_key, value) => {
    if (typeof value === "function") return undefined;
    if (value instanceof Map) return Object.fromEntries(value);
    if (value instanceof Set) return [...value];
    if (value instanceof Date) return value.toISOString();
    if (value instanceof RegExp) return value.toString();
    return value;
  }));
}
