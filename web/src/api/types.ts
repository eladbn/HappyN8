export type Params = Record<string, unknown>;

export interface CredentialRef {
  id: string | null;
  name: string;
}

export interface N8nNode {
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  position: [number, number];
  parameters: Params;
  credentials?: Record<string, CredentialRef>;
  disabled?: boolean;
  notes?: string;
  notesInFlow?: boolean;
  webhookId?: string;
  executeOnce?: boolean;
  alwaysOutputData?: boolean;
  retryOnFail?: boolean;
  maxTries?: number;
  waitBetweenTries?: number;
  onError?: string;
  continueOnFail?: boolean;
  [key: string]: unknown;
}

export interface ConnectionTarget {
  node: string;
  type: string;
  index: number;
}

/** source node name → connection type → output index → targets */
export type Connections = Record<string, Record<string, Array<ConnectionTarget[] | null>>>;

export interface Tag {
  id: string;
  name: string;
}

export interface Workflow {
  id: string;
  name: string;
  active: boolean;
  activeVersionId?: string | null;
  versionId: string;
  versionCounter?: number;
  nodes: N8nNode[];
  connections: Connections;
  settings: Record<string, unknown>;
  staticData?: unknown;
  pinData?: Record<string, unknown>;
  tags?: Tag[];
  createdAt: string;
  updatedAt: string;
  isArchived?: boolean;
  description?: string | null;
  triggerCount?: number;
  meta?: Record<string, unknown>;
  shared?: Array<{ projectId?: string; project?: { id: string; name: string } }>;
}

export type ExecutionStatus = 'canceled' | 'crashed' | 'error' | 'new' | 'running' | 'success' | 'unknown' | 'waiting';

export interface TaskData {
  startTime: number;
  executionTime: number;
  executionIndex?: number;
  executionStatus?: string;
  source?: Array<{ previousNode: string; previousNodeOutput?: number } | null>;
  data?: Record<string, Array<Array<{ json: Record<string, unknown>; binary?: Record<string, unknown> }> | null>>;
  inputOverride?: Record<string, Array<Array<{ json: Record<string, unknown> }> | null>>;
  error?: { message?: string; description?: string; name?: string; stack?: string; node?: { name?: string } };
}

export interface ExecutionData {
  resultData?: {
    runData?: Record<string, TaskData[]>;
    lastNodeExecuted?: string;
    error?: { message?: string; description?: string; node?: { name?: string } };
  };
}

export interface Execution {
  id: string;
  mode: string;
  status: ExecutionStatus;
  startedAt: string | null;
  stoppedAt: string | null;
  createdAt?: string;
  workflowId: string;
  retryOf?: string | null;
  retrySuccessId?: string | null;
  waitTill?: string | null;
  data?: ExecutionData;
  workflowData?: { name?: string; nodes?: N8nNode[]; connections?: Connections };
  dataTooLargeToDisplay?: boolean;
}

export interface Page<T> {
  data: T[];
  nextCursor: string | null;
}

export interface VersionEntry {
  versionId: string;
  workflowId: string;
  authors: string;
  name: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowVersion extends VersionEntry {
  nodes: N8nNode[];
  connections: Connections;
}

export interface Credential {
  id: string;
  name: string;
  type: string;
  createdAt: string;
  updatedAt: string;
}

export type PortSpec = string | { type: string; displayName?: string; required?: boolean; maxConnections?: number };

export interface NodeTypeSummary {
  name: string;
  displayName: string;
  description?: string;
  versions: number[];
  defaultVersion: number;
  defaults?: { name?: string; color?: string };
  group?: string[];
  icon?: string | { light: string; dark: string };
  iconUrl?: string | { light: string; dark: string };
  iconColor?: string;
  inputs?: PortSpec[] | string;
  outputs?: PortSpec[] | string;
  inputNames?: string[];
  outputNames?: string[];
  subtitle?: string;
  hidden?: boolean;
  codex?: { categories?: string[]; subcategories?: Record<string, string[]>; alias?: string[] };
  credentials?: Array<{ name: string; required?: boolean }>;
  hasWebhooks?: boolean;
  isTrigger?: boolean;
}

export interface NodeProperty {
  name: string;
  displayName: string;
  type: string;
  default?: unknown;
  description?: string;
  hint?: string;
  placeholder?: string;
  required?: boolean;
  noDataExpression?: boolean;
  options?: Array<NodePropertyOption | NodeProperty | NodePropertyCollection>;
  typeOptions?: Record<string, unknown>;
  displayOptions?: DisplayOptions;
  modes?: Array<{ name: string; displayName: string; type: string; placeholder?: string; typeOptions?: Record<string, unknown> }>;
  credentialTypes?: string[];
}

export interface NodePropertyOption {
  name: string;
  value: string | number | boolean;
  description?: string;
  action?: string;
}

export interface NodePropertyCollection {
  name: string;
  displayName: string;
  values: NodeProperty[];
}

export interface DisplayOptions {
  show?: Record<string, unknown[]>;
  hide?: Record<string, unknown[]>;
}

export interface NodeTypeDetail extends NodeTypeSummary {
  properties: NodeProperty[];
  version: number | number[];
}

export interface CredentialType {
  name: string;
  displayName: string;
  iconUrl?: string | { light: string; dark: string };
  icon?: string | { light: string; dark: string };
  documentationUrl?: string;
  properties: NodeProperty[];
}

export interface Meta {
  n8nUrl: string;
  login: boolean;
  authDisabled: boolean;
}

export interface N8nConnection {
  /** Effective addresses HappyN8 uses right now. */
  url: string;
  publicUrl: string;
  /** Values saved in the app ('' = not set, the .env value applies). */
  saved: { url: string; publicUrl: string };
  /** Values from .env (N8N_URL / N8N_PUBLIC_URL). */
  env: { url: string; publicUrl: string };
}

export type Role = 'admin' | 'editor' | 'viewer';

export interface AppUser {
  id: number;
  username: string;
  displayName: string;
  role: Role;
  disabled: boolean;
  createdAt?: string;
  lastLoginAt?: string | null;
}

export interface Person {
  id: number;
  username: string;
  displayName: string;
  disabled: boolean;
}

export interface AuditEntry {
  id: number;
  ts: string;
  userId: number | null;
  user: string;
  action: string;
  entityType: 'workflow' | 'credential' | 'tag' | 'execution' | 'variable' | 'user' | string;
  entityId: string | null;
  entityName: string | null;
  details: Record<string, any> | null;
}

export interface OwnerInfo {
  createdBy: { id: number | null; name: string } | null;
  createdAt: string | null;
  changedBy: { id: number | null; name: string } | null;
  changedAt: string | null;
}
