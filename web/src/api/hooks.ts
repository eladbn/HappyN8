import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { getAll, n8n, request } from './client';
import type {
  AppUser, AuditEntry, OwnerInfo, Person,
  Credential, CredentialType, Execution, Meta, N8nConnection, NodeTypeDetail, NodeTypeSummary, Page, Tag, VersionEntry, Workflow,
  WorkflowVersion,
} from './types';

export const qk = {
  meta: ['meta'] as const,
  workflows: ['workflows'] as const,
  workflow: (id: string) => ['workflow', id] as const,
  executions: (f: object) => ['executions', f] as const,
  execution: (id: string) => ['execution', id] as const,
  history: (id: string) => ['history', id] as const,
  version: (id: string, v: string) => ['version', id, v] as const,
  credentials: ['credentials'] as const,
};

export function useMeta() {
  return useQuery({ queryKey: qk.meta, queryFn: () => request<Meta>('GET', '/api/meta'), staleTime: Infinity });
}

export function useStatus() {
  return useQuery({
    queryKey: ['status'],
    queryFn: () => request<{ api: boolean; apiError?: string; login: boolean | null; loginError?: string }>('GET', '/api/status'),
    refetchInterval: 60_000,
  });
}

export function useWorkflows() {
  return useQuery({ queryKey: qk.workflows, queryFn: () => getAll<Workflow>('/workflows', { excludePinnedData: true }) });
}

export function useWorkflow(id: string | undefined) {
  return useQuery({
    queryKey: qk.workflow(id || ''),
    queryFn: () => n8n.get<Workflow>(`/workflows/${id}`),
    enabled: !!id,
    refetchOnWindowFocus: false,
  });
}

export interface ExecFilter {
  workflowId?: string;
  status?: string;
}

export function useExecutions(filter: ExecFilter, opts: { live?: boolean; pageSize?: number } = {}) {
  return useInfiniteQuery({
    queryKey: qk.executions(filter),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => n8n.get<Page<Execution>>('/executions', {
      workflowId: filter.workflowId, status: filter.status, limit: opts.pageSize ?? 50, cursor: pageParam,
    }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchInterval: opts.live === false ? false : 5000,
  });
}

/** Recent executions across all workflows, used for "last run" columns. */
export function useRecentExecutions(limit = 250) {
  return useQuery({
    queryKey: ['executions-recent', limit],
    queryFn: () => n8n.get<Page<Execution>>('/executions', { limit }),
    refetchInterval: 15_000,
  });
}

export function useExecution(id: string | undefined | null, live = false) {
  return useQuery({
    queryKey: qk.execution(id || ''),
    queryFn: () => n8n.get<Execution>(`/executions/${id}`, { includeData: true }),
    enabled: !!id,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return live || s === 'running' || s === 'new' || s === 'waiting' ? 2000 : false;
    },
  });
}

export function useHistory(workflowId: string) {
  return useInfiniteQuery({
    queryKey: qk.history(workflowId),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => n8n.get<Page<VersionEntry>>(`/workflows/${workflowId}/history`, { limit: 50, cursor: pageParam }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useVersion(workflowId: string, versionId: string | null) {
  return useQuery({
    queryKey: qk.version(workflowId, versionId || ''),
    queryFn: () => n8n.get<WorkflowVersion>(`/workflows/${workflowId}/versions/${versionId}`),
    enabled: !!versionId,
    staleTime: Infinity,
  });
}

export function useCredentials() {
  return useQuery({ queryKey: qk.credentials, queryFn: () => getAll<Credential>('/credentials') });
}

export function useTags() {
  return useQuery({ queryKey: ['tags'], queryFn: () => getAll<Tag>('/tags') });
}

export function useCatalogQuery(enabled: boolean) {
  return useQuery({
    queryKey: ['catalog'],
    queryFn: () => request<NodeTypeSummary[]>('GET', '/api/catalog/nodes'),
    enabled,
    staleTime: Infinity,
    retry: 1,
  });
}

export function useNodeDetail(type: string | undefined, version: number | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['node-detail', type, version],
    queryFn: () => request<NodeTypeDetail>('GET', '/api/catalog/node', undefined, { type, version }),
    enabled: enabled && !!type,
    staleTime: Infinity,
    retry: 1,
  });
}

export function useCredentialTypes(enabled: boolean) {
  return useQuery({
    queryKey: ['credential-types'],
    queryFn: () => request<CredentialType[]>('GET', '/api/catalog/credentials'),
    enabled,
    staleTime: Infinity,
    retry: 1,
  });
}

export function usePeople() {
  return useQuery({ queryKey: ['people'], queryFn: () => request<Person[]>('GET', '/api/people'), staleTime: 60_000 });
}

export function useUsers(enabled: boolean) {
  return useQuery({ queryKey: ['users'], queryFn: () => request<AppUser[]>('GET', '/api/users'), enabled });
}

export function useN8nConnection() {
  return useQuery({ queryKey: ['n8n-connection'], queryFn: () => request<N8nConnection>('GET', '/api/n8n-connection') });
}

export function useOwnership() {
  return useQuery({ queryKey: ['ownership'], queryFn: () => request<Record<string, OwnerInfo>>('GET', '/api/ownership'), refetchInterval: 30_000 });
}

export function useVersionAuthors(workflowId: string) {
  return useQuery({
    queryKey: ['version-authors', workflowId],
    queryFn: () => request<Record<string, { id: number | null; name: string; ts: string }>>('GET', `/api/workflows/${workflowId}/version-authors`),
  });
}

export interface AuditFilter { userId?: string; entityType?: string; entityId?: string; action?: string; q?: string }

export function useAudit(filter: AuditFilter, pageSize = 50) {
  return useInfiniteQuery({
    queryKey: ['audit', filter],
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) => request<{ data: AuditEntry[]; nextBefore: number | null }>('GET', '/api/audit', undefined, { ...filter, before: pageParam, limit: pageSize }),
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    refetchInterval: 20_000,
  });
}
