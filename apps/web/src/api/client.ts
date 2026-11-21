import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuditLogPage, CaseDetail, CaseInput, CaseListItem, ChainAdapterInfo, ChainMode, ConnectorInfo, Decision, ReportBundle, RunDiffDoc, RunResults } from './types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init?.method ?? 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const b = await res.json();
      message = Array.isArray(b.message) ? b.message.join('; ') : (b.message ?? message);
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, message);
  }
  return res.json();
}

export interface RunOptions {
  connectors: string[];
  chain: ChainMode;
}

export const useCases = () => useQuery({ queryKey: ['cases'], queryFn: () => request<CaseListItem[]>('/cases') });
// A case under monitoring gets new runs by itself: poll while the page is open.
export const useCase = (id: string | undefined) =>
  useQuery({ queryKey: ['case', id], queryFn: () => request<CaseDetail>(`/cases/${id}`), enabled: !!id, refetchInterval: (q) => (q.state.data?.scheduleEveryMin ? 15_000 : false) });
export const useRun = (id: string) => useQuery({ queryKey: ['run', id], queryFn: () => request<RunResults>(`/runs/${id}`) });
export const useRunDiff = (id: string) => useQuery({ queryKey: ['run-diff', id], queryFn: () => request<{ diff: RunDiffDoc | null }>(`/runs/${id}/diff`) });
export const useReport = (id: string) => useQuery({ queryKey: ['report', id], queryFn: () => request<ReportBundle>(`/runs/${id}/report`) });
export const useAuditLog = (problems: boolean) => useQuery({ queryKey: ['audit', problems], queryFn: () => request<AuditLogPage>(`/audit-log?limit=300${problems ? '&problems=true' : ''}`) });
export const useConnectors = () => useQuery({ queryKey: ['connectors'], queryFn: () => request<ConnectorInfo[]>('/connectors'), staleTime: Infinity });
export const useChainAdapters = () => useQuery({ queryKey: ['chain-adapters'], queryFn: () => request<ChainAdapterInfo[]>('/chain-adapters'), staleTime: 60_000 });

export function useCreateCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CaseInput) => request<CaseDetail>('/cases', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cases'] }),
  });
}

export function useStartRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ caseId, options }: { caseId: string; options: RunOptions }) => request<RunResults>(`/cases/${caseId}/runs`, { method: 'POST', body: options }),
    onSuccess: (r) => {
      qc.setQueryData(['run', r.run.id], r);
      qc.invalidateQueries({ queryKey: ['cases'] });
      qc.invalidateQueries({ queryKey: ['case', r.run.caseId] });
    },
  });
}

export function useSetSchedule(caseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (everyMinutes: number | null) => request(`/cases/${caseId}/schedule`, { method: 'PUT', body: { everyMinutes } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['case', caseId] }),
  });
}

export function useDemoCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (variant: 'identifiers' | 'address') => request<CaseDetail>(`/demo/case?variant=${variant}`, { method: 'POST', body: {} }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cases'] }),
  });
}

export function useDecide(runId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ linkId, decision, analyst, note }: { linkId: string; decision: Decision | null; analyst?: string; note?: string }) =>
      request(`/links/${linkId}/decision`, { method: 'POST', body: { decision, analyst, note } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['run', runId] }),
  });
}
