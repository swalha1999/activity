import { randomUUID } from "node:crypto";
import type {
  ActivityAdapter,
  ActivityEntry,
  ActivityLog,
  ActivityQuery,
  ActivityStats,
  StatsQuery,
} from "../types.js";

export function createMockAdapter(): ActivityAdapter & {
  records: ActivityLog[];
} {
  const records: ActivityLog[] = [];

  function entryToLog(entry: ActivityEntry): ActivityLog {
    return {
      id: randomUUID(),
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId ?? null,
      previousState: entry.previousState ?? null,
      newState: entry.newState ?? null,
      changedFields: entry.changedFields ?? null,
      userId: entry.userId,
      organizationId: entry.organizationId ?? null,
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent ?? null,
      requestId: entry.requestId ?? null,
      parentId: entry.parentId ?? null,
      batchId: entry.batchId ?? null,
      isUndone: false,
      undoneBy: null,
      undoneAt: null,
      metadata: entry.metadata ?? {},
      createdAt: new Date(),
    };
  }

  function matchesQuery(log: ActivityLog, query: ActivityQuery): boolean {
    if (query.userId && log.userId !== query.userId) return false;
    if (query.organizationId && log.organizationId !== query.organizationId)
      return false;
    if (query.resourceType && log.resourceType !== query.resourceType)
      return false;
    if (query.resourceId && log.resourceId !== query.resourceId) return false;
    if (query.action && log.action !== query.action) return false;
    if (query.actions && !query.actions.includes(log.action)) return false;
    if (
      query.resourceTypes &&
      !query.resourceTypes.includes(log.resourceType)
    )
      return false;
    if (query.requestId && log.requestId !== query.requestId) return false;
    if (query.batchId && log.batchId !== query.batchId) return false;
    if (query.isUndone !== undefined && log.isUndone !== query.isUndone)
      return false;
    if (query.dateRange?.from && log.createdAt < query.dateRange.from)
      return false;
    if (query.dateRange?.to && log.createdAt > query.dateRange.to)
      return false;
    return true;
  }

  return {
    records,

    async insert(entry) {
      const log = entryToLog(entry);
      records.push(log);
      return log;
    },

    async insertMany(entries) {
      const logs = entries.map(entryToLog);
      records.push(...logs);
      return logs;
    },

    async findById(id) {
      return records.find((r) => r.id === id) ?? null;
    },

    async findMany(query) {
      let results = records.filter((r) => matchesQuery(r, query));

      if (query.orderBy === "created_at_asc") {
        results.sort(
          (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
        );
      } else {
        results.sort(
          (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
        );
      }

      if (query.offset) {
        results = results.slice(query.offset);
      }
      if (query.limit) {
        results = results.slice(0, query.limit);
      }

      return results;
    },

    async update(id, data) {
      const index = records.findIndex((r) => r.id === id);
      if (index === -1) throw new Error("Not found");

      const existing = records[index];

      // Handle special _isUndone, _undoneBy, _undoneAt metadata fields
      const meta = data.metadata as Record<string, unknown> | undefined;
      let isUndone = existing.isUndone;
      let undoneBy = existing.undoneBy;
      let undoneAt = existing.undoneAt;

      if (meta) {
        if (meta._isUndone !== undefined) {
          isUndone = meta._isUndone as boolean;
          delete meta._isUndone;
        }
        if (meta._undoneBy !== undefined) {
          undoneBy = meta._undoneBy as string | null;
          delete meta._undoneBy;
        }
        if (meta._undoneAt !== undefined) {
          undoneAt = meta._undoneAt
            ? new Date(meta._undoneAt as string)
            : null;
          delete meta._undoneAt;
        }
      }

      const updated: ActivityLog = {
        ...existing,
        ...data,
        isUndone,
        undoneBy,
        undoneAt,
        id: existing.id,
        createdAt: existing.createdAt,
      } as ActivityLog;

      records[index] = updated;
      return updated;
    },

    async delete(query) {
      const before = records.length;
      const remaining = records.filter(
        (r) => r.createdAt >= query.olderThan,
      );
      records.length = 0;
      records.push(...remaining);
      return { deleted: before - records.length };
    },

    async count(query?) {
      if (!query) return records.length;
      return records.filter((r) => matchesQuery(r, query)).length;
    },

    async getStats(query: StatsQuery): Promise<ActivityStats> {
      const filtered = records.filter((r) => {
        if (query.userId && r.userId !== query.userId) return false;
        if (
          query.organizationId &&
          r.organizationId !== query.organizationId
        )
          return false;
        if (query.resourceType && r.resourceType !== query.resourceType)
          return false;
        if (query.dateRange?.from && r.createdAt < query.dateRange.from)
          return false;
        if (query.dateRange?.to && r.createdAt > query.dateRange.to)
          return false;
        return true;
      });

      const byAction: Record<string, number> = {};
      const byResourceType: Record<string, number> = {};
      const byUser: Record<string, number> = {};
      const byDate: Record<string, number> = {};

      for (const r of filtered) {
        byAction[r.action] = (byAction[r.action] ?? 0) + 1;
        byResourceType[r.resourceType] =
          (byResourceType[r.resourceType] ?? 0) + 1;
        byUser[r.userId] = (byUser[r.userId] ?? 0) + 1;
        const dateKey = r.createdAt.toISOString().split("T")[0];
        byDate[dateKey] = (byDate[dateKey] ?? 0) + 1;
      }

      return {
        total: filtered.length,
        byAction,
        byResourceType,
        byUser,
        byDate,
      };
    },
  };
}
