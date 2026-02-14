import type {
  ActivityConfig,
  ActivityEntry,
  ActivityInstance,
  ActivityLog,
  ActivityQuery,
  ActivityQueryOptions,
  DiffEntry,
  StatsQuery,
  StorageStats,
  TypedActivityEntry,
  UndoRedoResult,
} from "./types.js";
import { diffStates, formatDiff, getChangedFieldNames } from "./diff.js";
import { createFormatter } from "./format.js";
import { getContext } from "./context.js";

export function createActivity<
  const TActions extends readonly string[],
  const TResourceTypes extends readonly string[],
>(
  config: ActivityConfig<TActions, TResourceTypes>,
): ActivityInstance<TActions[number], TResourceTypes[number]> {
  type TAction = TActions[number];
  type TResourceType = TResourceTypes[number];

  const { adapter } = config;
  const undoableActions = new Set(config.undoableActions ?? []);
  const undoBehavior = config.undoBehavior ?? {};
  const formatter = createFormatter(config);

  let cleanupInterval: NodeJS.Timeout | null = null;

  // Start retention cleanup if configured
  if (config.retention) {
    const intervalMs = parseInterval(config.retention.cleanupInterval ?? "1h");
    cleanupInterval = setInterval(async () => {
      const olderThan = new Date();
      olderThan.setDate(olderThan.getDate() - config.retention!.days);
      try {
        await adapter.delete({ olderThan });
      } catch {
        // Swallow cleanup errors
      }
    }, intervalMs);
    // Don't block process exit
    if (typeof cleanupInterval === "object" && "unref" in cleanupInterval) {
      cleanupInterval.unref();
    }
  }

  function mergeContext(
    entry: TypedActivityEntry<TAction, TResourceType>,
  ): ActivityEntry {
    const ctx = getContext();
    const merged: ActivityEntry = {
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      previousState: entry.previousState,
      newState: entry.newState,
      userId: entry.userId ?? ctx?.userId ?? "",
      organizationId: entry.organizationId ?? ctx?.organizationId,
      ipAddress: entry.ipAddress ?? ctx?.ipAddress,
      userAgent: entry.userAgent ?? ctx?.userAgent,
      requestId: entry.requestId ?? ctx?.requestId,
      parentId: entry.parentId,
      batchId: entry.batchId,
      metadata: entry.metadata,
    };

    // Auto-compute changed_fields
    if (merged.previousState && merged.newState) {
      merged.changedFields = getChangedFieldNames(
        merged.previousState,
        merged.newState,
      );
    }

    return merged;
  }

  const instance: ActivityInstance<TAction, TResourceType> = {
    // ---- Logging ----

    async log(entry) {
      return adapter.insert(mergeContext(entry));
    },

    logAsync(entry) {
      adapter.insert(mergeContext(entry)).catch((err) => {
        console.error("[activity-log] logAsync error:", err);
      });
    },

    async logBatch(entries, sharedFields) {
      const merged = entries.map((e) => {
        const combined = sharedFields ? { ...sharedFields, ...e } : e;
        return mergeContext(
          combined as TypedActivityEntry<TAction, TResourceType>,
        );
      });
      return adapter.insertMany(merged);
    },

    // ---- Queries ----

    async getUserActivity(userId, options) {
      return adapter.findMany(
        buildQuery({ userId }, options as ActivityQueryOptions),
      );
    },

    async getOrgActivity(orgId, options) {
      return adapter.findMany(
        buildQuery({ organizationId: orgId }, options as ActivityQueryOptions),
      );
    },

    async getResourceHistory({ resourceType, resourceId }) {
      return adapter.findMany({
        resourceType,
        resourceId,
        orderBy: "created_at_desc",
      });
    },

    async getById(id) {
      return adapter.findById(id);
    },

    async getByRequestId(requestId) {
      return adapter.findMany({ requestId });
    },

    async getByBatchId(batchId) {
      return adapter.findMany({ batchId });
    },

    async getStats(query: StatsQuery) {
      return adapter.getStats(query);
    },

    // ---- Undo / Redo ----

    canUndo(activityLog: ActivityLog): boolean {
      if (activityLog.isUndone) return false;
      if (!undoableActions.has(activityLog.action)) return false;
      // For updates/deletes, need previous_state
      const behavior = (undoBehavior as Record<string, string>)[
        activityLog.action
      ];
      if (
        (behavior === "restore" || behavior === "restore_state") &&
        !activityLog.previousState
      ) {
        return false;
      }
      return true;
    },

    canRedo(activityLog: ActivityLog): boolean {
      return activityLog.isUndone === true;
    },

    async undo({ activityId, userId, reason }) {
      const original = await adapter.findById(activityId);
      if (!original)
        return { success: false, error: "Activity not found" };
      if (!instance.canUndo(original))
        return { success: false, error: "Activity cannot be undone" };

      const now = new Date();
      const undoEntry: ActivityEntry = {
        action: `undo_${original.action}` as string,
        resourceType: original.resourceType,
        resourceId: original.resourceId,
        previousState: original.newState,
        newState: original.previousState,
        userId,
        organizationId: original.organizationId,
        requestId: original.requestId,
        parentId: original.id,
        metadata: reason ? { reason, undoneActivityId: activityId } : { undoneActivityId: activityId },
      };

      const undoActivity = await adapter.insert(undoEntry);

      // Mark original as undone
      await adapter.update(activityId, {
        metadata: {
          ...original.metadata,
          _isUndone: true,
          _undoneBy: undoActivity.id,
          _undoneAt: now.toISOString(),
        },
      } as Partial<ActivityEntry>);

      // Restore the actual resource if the adapter supports it
      if (adapter.restoreResource) {
        await adapter.restoreResource(original);
      }

      return { success: true, activity: undoActivity };
    },

    async redo({ activityId, userId }) {
      const original = await adapter.findById(activityId);
      if (!original)
        return { success: false, error: "Activity not found" };
      if (!instance.canRedo(original))
        return { success: false, error: "Activity cannot be redone" };

      const redoEntry: ActivityEntry = {
        action: `redo_${original.action}` as string,
        resourceType: original.resourceType,
        resourceId: original.resourceId,
        previousState: original.previousState,
        newState: original.newState,
        userId,
        organizationId: original.organizationId,
        requestId: original.requestId,
        parentId: original.id,
        metadata: { redoneActivityId: activityId },
      };

      const redoActivity = await adapter.insert(redoEntry);

      // Mark original as no longer undone
      await adapter.update(activityId, {
        metadata: {
          ...original.metadata,
          _isUndone: false,
          _undoneBy: null,
          _undoneAt: null,
        },
      } as Partial<ActivityEntry>);

      return { success: true, activity: redoActivity };
    },

    async undoRequest({ requestId, userId, reason }) {
      const activities = await adapter.findMany({
        requestId,
        orderBy: "created_at_desc",
      });

      for (const act of activities) {
        if (instance.canUndo(act)) {
          await instance.undo({ activityId: act.id, userId, reason });
        }
      }

      return { success: true };
    },

    async undoBatch({ batchId, userId, reason }) {
      const activities = await adapter.findMany({
        batchId,
        orderBy: "created_at_desc",
      });

      for (const act of activities) {
        if (instance.canUndo(act)) {
          await instance.undo({ activityId: act.id, userId, reason });
        }
      }

      return { success: true };
    },

    async rollbackTo({ activityId, userId, reason }) {
      const targetActivity = await adapter.findById(activityId);
      if (!targetActivity)
        return { success: false, error: "Activity not found" };

      // Get all activities for this resource after the target
      const history = await adapter.findMany({
        resourceType: targetActivity.resourceType,
        resourceId: targetActivity.resourceId ?? undefined,
        orderBy: "created_at_desc",
      });

      // Find activities after the target and undo them in reverse order
      const toUndo: ActivityLog[] = [];
      for (const act of history) {
        if (act.id === activityId) break;
        if (instance.canUndo(act)) {
          toUndo.push(act);
        }
      }

      for (const act of toUndo) {
        await instance.undo({ activityId: act.id, userId, reason });
      }

      return { success: true };
    },

    // ---- Diff ----

    diff(activityLog: ActivityLog): DiffEntry[] {
      if (!activityLog.previousState || !activityLog.newState) return [];
      return diffStates(activityLog.previousState, activityLog.newState);
    },

    diffStates(
      oldState: Record<string, unknown>,
      newState: Record<string, unknown>,
    ): DiffEntry[] {
      return diffStates(oldState, newState);
    },

    formatDiff(diff: DiffEntry[]): string {
      return formatDiff(diff);
    },

    getChangedFields(activityLog: ActivityLog): string[] {
      if (activityLog.changedFields) return activityLog.changedFields;
      if (!activityLog.previousState || !activityLog.newState) return [];
      return getChangedFieldNames(
        activityLog.previousState,
        activityLog.newState,
      );
    },

    // ---- Format ----

    format: formatter,

    // ---- Cleanup ----

    async cleanup({ olderThan, dryRun }) {
      const date = new Date();
      date.setDate(date.getDate() - olderThan);

      if (dryRun) {
        const count = await adapter.count({
          dateRange: { to: date },
        });
        return { deleted: count };
      }

      return adapter.delete({ olderThan: date });
    },

    async getStorageStats(): Promise<StorageStats> {
      const total = await adapter.count();
      const oldest = await adapter.findMany({
        limit: 1,
        orderBy: "created_at_asc",
      });
      const newest = await adapter.findMany({
        limit: 1,
        orderBy: "created_at_desc",
      });

      return {
        totalRecords: total,
        oldestRecord: oldest[0]?.createdAt ?? null,
        newestRecord: newest[0]?.createdAt ?? null,
        sizeEstimate: estimateSize(total),
      };
    },

    destroy() {
      if (cleanupInterval) {
        clearInterval(cleanupInterval);
        cleanupInterval = null;
      }
    },
  };

  return instance;
}

// ---- Helpers ----

function buildQuery(
  base: Partial<ActivityQuery>,
  options?: ActivityQueryOptions,
): ActivityQuery {
  return {
    ...base,
    limit: options?.limit,
    offset: options?.offset,
    actions: options?.actions,
    resourceTypes: options?.resourceTypes,
    dateRange: options?.dateRange,
    orderBy: "created_at_desc",
  };
}

function parseInterval(interval: string): number {
  const match = interval.match(/^(\d+)(ms|s|m|h|d)$/);
  if (!match) return 3600000; // default 1h

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case "ms":
      return value;
    case "s":
      return value * 1000;
    case "m":
      return value * 60 * 1000;
    case "h":
      return value * 60 * 60 * 1000;
    case "d":
      return value * 24 * 60 * 60 * 1000;
    default:
      return 3600000;
  }
}

function estimateSize(totalRecords: number): string {
  // Rough estimate: ~1KB per record
  const bytes = totalRecords * 1024;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
