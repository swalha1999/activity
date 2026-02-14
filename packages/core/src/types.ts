// ---- Base types ----

export interface ActivityLog {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  previousState: Record<string, unknown> | null;
  newState: Record<string, unknown> | null;
  changedFields: string[] | null;
  userId: string;
  organizationId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  parentId: string | null;
  batchId: string | null;
  isUndone: boolean;
  undoneBy: string | null;
  undoneAt: Date | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface ActivityEntry {
  action: string;
  resourceType: string;
  resourceId?: string | null;
  previousState?: Record<string, unknown> | null;
  newState?: Record<string, unknown> | null;
  changedFields?: string[] | null;
  userId: string;
  organizationId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  parentId?: string | null;
  batchId?: string | null;
  metadata?: Record<string, unknown>;
}

// ---- Query types ----

export interface DateRange {
  from?: Date;
  to?: Date;
}

export interface ActivityQuery {
  userId?: string;
  organizationId?: string;
  resourceType?: string;
  resourceId?: string;
  action?: string;
  actions?: string[];
  resourceTypes?: string[];
  requestId?: string;
  batchId?: string;
  dateRange?: DateRange;
  isUndone?: boolean;
  limit?: number;
  offset?: number;
  orderBy?: "created_at_asc" | "created_at_desc";
}

export interface StatsQuery {
  userId?: string;
  organizationId?: string;
  resourceType?: string;
  dateRange?: DateRange;
}

export interface ActivityStats {
  total: number;
  byAction: Record<string, number>;
  byResourceType: Record<string, number>;
  byUser: Record<string, number>;
  byDate: Record<string, number>;
}

// ---- Adapter interface ----

export interface ActivityAdapter {
  insert(entry: ActivityEntry): Promise<ActivityLog>;
  insertMany(entries: ActivityEntry[]): Promise<ActivityLog[]>;
  findById(id: string): Promise<ActivityLog | null>;
  findMany(query: ActivityQuery): Promise<ActivityLog[]>;
  update(id: string, data: Partial<ActivityEntry>): Promise<ActivityLog>;
  delete(query: { olderThan: Date }): Promise<{ deleted: number }>;
  count(query?: ActivityQuery): Promise<number>;
  getStats(query: StatsQuery): Promise<ActivityStats>;
  /** Restore a resource to its previous state (implemented by adapters with resourceTables) */
  restoreResource?(activityLog: ActivityLog): Promise<void>;
}

// ---- Config types ----

export type UndoBehavior = "soft_delete" | "restore" | "restore_state";

export interface ActivityConfig<
  TActions extends readonly string[],
  TResourceTypes extends readonly string[],
> {
  adapter: ActivityAdapter;
  actions: TActions;
  resourceTypes: TResourceTypes;
  undoableActions?: TActions[number][];
  undoBehavior?: Partial<Record<TActions[number], UndoBehavior>>;
  format?: {
    action?: Partial<Record<TActions[number], string>>;
    resourceType?: Partial<Record<TResourceTypes[number], string>>;
    icon?: Partial<Record<TActions[number], string>>;
    color?: Partial<Record<TActions[number], string>>;
    /** Map resource type to field name(s) used as display name. Tries fields in order, uses first non-empty. */
    resourceName?: Partial<Record<TResourceTypes[number], string | string[]>>;
  };
  retention?: { days: number; cleanupInterval?: string };
}

// ---- Typed entry for logging ----

export interface TypedActivityEntry<
  TAction extends string,
  TResourceType extends string,
> {
  action: TAction;
  resourceType: TResourceType;
  resourceId?: string | null;
  previousState?: Record<string, unknown> | null;
  newState?: Record<string, unknown> | null;
  userId: string;
  organizationId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  parentId?: string | null;
  batchId?: string | null;
  metadata?: Record<string, unknown>;
}

// ---- Diff types ----

export interface DiffEntry {
  field: string;
  before: unknown;
  after: unknown;
}

// ---- Undo/Redo result ----

export interface UndoRedoResult {
  success: boolean;
  activity?: ActivityLog;
  error?: string;
}

// ---- Storage stats ----

export interface StorageStats {
  totalRecords: number;
  oldestRecord: Date | null;
  newestRecord: Date | null;
  sizeEstimate: string;
}

// ---- Context type ----

export interface ActivityContext {
  userId?: string;
  organizationId?: string;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}

// ---- Query options for user/org activity ----

export interface ActivityQueryOptions<
  TAction extends string = string,
  TResourceType extends string = string,
> {
  limit?: number;
  offset?: number;
  actions?: TAction[];
  resourceTypes?: TResourceType[];
  dateRange?: DateRange;
}

// ---- The full typed activity instance ----

export interface ActivityInstance<
  TAction extends string,
  TResourceType extends string,
> {
  // Logging
  log(
    entry: TypedActivityEntry<TAction, TResourceType>,
  ): Promise<ActivityLog>;
  logAsync(entry: TypedActivityEntry<TAction, TResourceType>): void;
  logBatch(
    entries: TypedActivityEntry<TAction, TResourceType>[],
    sharedFields?: Partial<TypedActivityEntry<TAction, TResourceType>>,
  ): Promise<ActivityLog[]>;

  // Queries
  getUserActivity(
    userId: string,
    options?: ActivityQueryOptions<TAction, TResourceType>,
  ): Promise<ActivityLog[]>;
  getOrgActivity(
    orgId: string,
    options?: ActivityQueryOptions<TAction, TResourceType>,
  ): Promise<ActivityLog[]>;
  getResourceHistory(params: {
    resourceType: TResourceType;
    resourceId: string;
  }): Promise<ActivityLog[]>;
  getById(id: string): Promise<ActivityLog | null>;
  getByRequestId(requestId: string): Promise<ActivityLog[]>;
  getByBatchId(batchId: string): Promise<ActivityLog[]>;
  getStats(query: StatsQuery): Promise<ActivityStats>;

  // Undo / Redo
  canUndo(activityLog: ActivityLog): boolean;
  canRedo(activityLog: ActivityLog): boolean;
  undo(params: {
    activityId: string;
    userId: string;
    reason?: string;
  }): Promise<UndoRedoResult>;
  redo(params: {
    activityId: string;
    userId: string;
  }): Promise<UndoRedoResult>;
  undoRequest(params: {
    requestId: string;
    userId: string;
    reason?: string;
  }): Promise<UndoRedoResult>;
  undoBatch(params: {
    batchId: string;
    userId: string;
    reason?: string;
  }): Promise<UndoRedoResult>;
  rollbackTo(params: {
    activityId: string;
    userId: string;
    reason?: string;
  }): Promise<UndoRedoResult>;

  // Diff
  diff(activityLog: ActivityLog): DiffEntry[];
  diffStates(
    oldState: Record<string, unknown>,
    newState: Record<string, unknown>,
  ): DiffEntry[];
  formatDiff(diff: DiffEntry[]): string;
  getChangedFields(activityLog: ActivityLog): string[];

  // Format
  format: {
    action(action: TAction): string;
    resourceType(resourceType: TResourceType): string;
    icon(action: TAction): string;
    color(action: TAction): string;
    full(activityLog: ActivityLog, options?: { userName?: string }): string;
    short(activityLog: ActivityLog): string;
    /** Human-readable message e.g. "Created Event 'Wedding Party'" or "Updated Contact 'Ahmed' (name, phone)" */
    message(activityLog: ActivityLog, options?: { userName?: string }): string;
  };

  // Cleanup
  cleanup(options: {
    olderThan: number;
    dryRun?: boolean;
  }): Promise<{ deleted: number }>;
  getStorageStats(): Promise<StorageStats>;

  // Destroy (cleanup intervals)
  destroy(): void;
}
