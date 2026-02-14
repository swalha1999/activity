import { and, count, desc, asc, eq, lt, sql, inArray, gte, lte, getTableColumns, type Table } from "drizzle-orm";
import type { PgDatabase, PgTable } from "drizzle-orm/pg-core";
import type {
  ActivityAdapter,
  ActivityEntry,
  ActivityLog,
  ActivityQuery,
  ActivityStats,
  StatsQuery,
} from "@swalha1999/activity";
import { activityLogTable, type ActivityLogRow } from "./schema.js";

export interface DrizzleAdapterOptions {
  /** Map resource type names to their Drizzle tables for undo resource restoration */
  resourceTables?: Record<string, PgTable>;
}

function rowToActivityLog(row: ActivityLogRow): ActivityLog {
  return {
    id: row.id,
    action: row.action,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    previousState: row.previousState ?? null,
    newState: row.newState ?? null,
    changedFields: row.changedFields ?? null,
    userId: row.userId,
    organizationId: row.organizationId,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    requestId: row.requestId,
    parentId: row.parentId,
    batchId: row.batchId,
    isUndone: row.isUndone ?? false,
    undoneBy: row.undoneBy,
    undoneAt: row.undoneAt,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: row.createdAt!,
  };
}

function entryToInsert(entry: ActivityEntry) {
  return {
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId ?? undefined,
    previousState: entry.previousState ?? undefined,
    newState: entry.newState ?? undefined,
    changedFields: entry.changedFields ?? undefined,
    userId: entry.userId,
    organizationId: entry.organizationId ?? undefined,
    ipAddress: entry.ipAddress ?? undefined,
    userAgent: entry.userAgent ?? undefined,
    requestId: entry.requestId ?? undefined,
    parentId: entry.parentId ?? undefined,
    batchId: entry.batchId ?? undefined,
    metadata: entry.metadata ?? {},
  };
}

/** Filter a state object to only include valid DB column names for a table */
function pickColumns(table: Table, state: Record<string, unknown>): Record<string, unknown> {
  const columns = getTableColumns(table);
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(columns)) {
    if (key in state) {
      result[key] = state[key];
    }
  }
  return result;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function drizzleAdapter(db: PgDatabase<any, any, any>, options?: DrizzleAdapterOptions): ActivityAdapter {
  const resourceTables = options?.resourceTables;

  return {
    async insert(entry: ActivityEntry): Promise<ActivityLog> {
      const [row] = await db
        .insert(activityLogTable)
        .values(entryToInsert(entry))
        .returning();
      return rowToActivityLog(row);
    },

    async insertMany(entries: ActivityEntry[]): Promise<ActivityLog[]> {
      if (entries.length === 0) return [];
      const rows = await db
        .insert(activityLogTable)
        .values(entries.map(entryToInsert))
        .returning();
      return rows.map(rowToActivityLog);
    },

    async findById(id: string): Promise<ActivityLog | null> {
      const [row] = await db
        .select()
        .from(activityLogTable)
        .where(eq(activityLogTable.id, id))
        .limit(1);
      return row ? rowToActivityLog(row) : null;
    },

    async findMany(query: ActivityQuery): Promise<ActivityLog[]> {
      const conditions = buildConditions(query);

      let q = db
        .select()
        .from(activityLogTable)
        .where(and(...conditions))
        .$dynamic();

      if (query.orderBy === "created_at_asc") {
        q = q.orderBy(asc(activityLogTable.createdAt));
      } else {
        q = q.orderBy(desc(activityLogTable.createdAt));
      }

      if (query.limit) {
        q = q.limit(query.limit);
      }
      if (query.offset) {
        q = q.offset(query.offset);
      }

      const rows = await q;
      return rows.map(rowToActivityLog);
    },

    async update(
      id: string,
      data: Partial<ActivityEntry>,
    ): Promise<ActivityLog> {
      const updateData: Record<string, unknown> = {};
      if (data.action !== undefined) updateData.action = data.action;
      if (data.resourceType !== undefined)
        updateData.resourceType = data.resourceType;
      if (data.resourceId !== undefined)
        updateData.resourceId = data.resourceId;
      if (data.previousState !== undefined)
        updateData.previousState = data.previousState;
      if (data.newState !== undefined) updateData.newState = data.newState;
      if (data.changedFields !== undefined)
        updateData.changedFields = data.changedFields;
      if (data.userId !== undefined) updateData.userId = data.userId;
      if (data.organizationId !== undefined)
        updateData.organizationId = data.organizationId;
      if (data.metadata !== undefined) updateData.metadata = data.metadata;

      // Handle undo-specific fields from metadata
      const meta = data.metadata as Record<string, unknown> | undefined;
      if (meta) {
        if (meta._isUndone !== undefined) {
          updateData.isUndone = meta._isUndone;
          delete (updateData.metadata as Record<string, unknown>)._isUndone;
        }
        if (meta._undoneBy !== undefined) {
          updateData.undoneBy = meta._undoneBy;
          delete (updateData.metadata as Record<string, unknown>)._undoneBy;
        }
        if (meta._undoneAt !== undefined) {
          updateData.undoneAt = meta._undoneAt
            ? new Date(meta._undoneAt as string)
            : null;
          delete (updateData.metadata as Record<string, unknown>)._undoneAt;
        }
      }

      // If no fields to update, just return the existing row
      if (Object.keys(updateData).length === 0) {
        const existing = await db
          .select()
          .from(activityLogTable)
          .where(eq(activityLogTable.id, id))
          .limit(1);
        return rowToActivityLog(existing[0]);
      }

      const [row] = await db
        .update(activityLogTable)
        .set(updateData)
        .where(eq(activityLogTable.id, id))
        .returning();
      return rowToActivityLog(row);
    },

    async delete(query: { olderThan: Date }): Promise<{ deleted: number }> {
      const result = await db
        .delete(activityLogTable)
        .where(lt(activityLogTable.createdAt, query.olderThan))
        .returning({ id: activityLogTable.id });
      return { deleted: result.length };
    },

    async count(query?: ActivityQuery): Promise<number> {
      const conditions = query ? buildConditions(query) : [];
      const [result] = await db
        .select({ count: count() })
        .from(activityLogTable)
        .where(and(...conditions));
      return result?.count ?? 0;
    },

    async getStats(query: StatsQuery): Promise<ActivityStats> {
      const conditions: ReturnType<typeof eq>[] = [];
      if (query.userId) {
        conditions.push(eq(activityLogTable.userId, query.userId));
      }
      if (query.organizationId) {
        conditions.push(
          eq(activityLogTable.organizationId, query.organizationId),
        );
      }
      if (query.resourceType) {
        conditions.push(
          eq(activityLogTable.resourceType, query.resourceType),
        );
      }
      if (query.dateRange?.from) {
        conditions.push(
          gte(activityLogTable.createdAt, query.dateRange.from),
        );
      }
      if (query.dateRange?.to) {
        conditions.push(lte(activityLogTable.createdAt, query.dateRange.to));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // Get total
      const [totalResult] = await db
        .select({ count: count() })
        .from(activityLogTable)
        .where(whereClause);

      // Get by action
      const byActionRows = await db
        .select({
          action: activityLogTable.action,
          count: count(),
        })
        .from(activityLogTable)
        .where(whereClause)
        .groupBy(activityLogTable.action);

      // Get by resource type
      const byResourceTypeRows = await db
        .select({
          resourceType: activityLogTable.resourceType,
          count: count(),
        })
        .from(activityLogTable)
        .where(whereClause)
        .groupBy(activityLogTable.resourceType);

      // Get by user
      const byUserRows = await db
        .select({
          userId: activityLogTable.userId,
          count: count(),
        })
        .from(activityLogTable)
        .where(whereClause)
        .groupBy(activityLogTable.userId);

      // Get by date
      const byDateRows = await db
        .select({
          date: sql<string>`DATE(${activityLogTable.createdAt})`.as("date"),
          count: count(),
        })
        .from(activityLogTable)
        .where(whereClause)
        .groupBy(sql`DATE(${activityLogTable.createdAt})`);

      return {
        total: totalResult?.count ?? 0,
        byAction: Object.fromEntries(
          byActionRows.map((r) => [r.action, r.count]),
        ),
        byResourceType: Object.fromEntries(
          byResourceTypeRows.map((r) => [r.resourceType, r.count]),
        ),
        byUser: Object.fromEntries(
          byUserRows.map((r) => [r.userId, r.count]),
        ),
        byDate: Object.fromEntries(
          byDateRows.map((r) => [r.date, r.count]),
        ),
      };
    },

    // Resource restoration for undo support
    restoreResource: resourceTables
      ? async (activityLog: ActivityLog): Promise<void> => {
          const table = resourceTables[activityLog.resourceType];
          if (!table) return;

          const { action, resourceId, previousState } = activityLog;
          // Use the id column from the table for where clauses
          const idCol = getTableColumns(table).id;
          if (!idCol) return;

          if (action === "delete" && previousState) {
            // Re-insert the deleted record
            const data = pickColumns(table, previousState);
            await db.insert(table).values(data as never).onConflictDoNothing();
          } else if (action === "soft_delete" && resourceId) {
            // Clear soft-delete fields
            await db
              .update(table)
              .set({ deletedAt: null, deletedBy: null } as never)
              .where(eq(idCol, resourceId));
          } else if (action === "create" && resourceId) {
            // Undo create = delete the record
            await db.delete(table).where(eq(idCol, resourceId));
          } else if (previousState && resourceId) {
            // For update/rename/toggle/change_role/etc: restore to previousState
            const data = pickColumns(table, previousState);
            delete data.id;
            delete data.createdAt;
            data.updatedAt = new Date();
            await db
              .update(table)
              .set(data as never)
              .where(eq(idCol, resourceId));
          }
        }
      : undefined,
  };
}

function buildConditions(query: ActivityQuery) {
  const conditions: ReturnType<typeof eq>[] = [];

  if (query.userId) {
    conditions.push(eq(activityLogTable.userId, query.userId));
  }
  if (query.organizationId) {
    conditions.push(
      eq(activityLogTable.organizationId, query.organizationId),
    );
  }
  if (query.resourceType) {
    conditions.push(eq(activityLogTable.resourceType, query.resourceType));
  }
  if (query.resourceId) {
    conditions.push(eq(activityLogTable.resourceId, query.resourceId));
  }
  if (query.action) {
    conditions.push(eq(activityLogTable.action, query.action));
  }
  if (query.actions && query.actions.length > 0) {
    conditions.push(inArray(activityLogTable.action, query.actions));
  }
  if (query.resourceTypes && query.resourceTypes.length > 0) {
    conditions.push(
      inArray(activityLogTable.resourceType, query.resourceTypes),
    );
  }
  if (query.requestId) {
    conditions.push(eq(activityLogTable.requestId, query.requestId));
  }
  if (query.batchId) {
    conditions.push(eq(activityLogTable.batchId, query.batchId));
  }
  if (query.isUndone !== undefined) {
    conditions.push(eq(activityLogTable.isUndone, query.isUndone));
  }
  if (query.dateRange?.from) {
    conditions.push(gte(activityLogTable.createdAt, query.dateRange.from));
  }
  if (query.dateRange?.to) {
    conditions.push(lte(activityLogTable.createdAt, query.dateRange.to));
  }

  return conditions;
}
