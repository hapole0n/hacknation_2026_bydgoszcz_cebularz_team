export type AuditKind = 'ok' | 'blocked' | 'error' | 'http';

/** Audit log status: 0 = blocked by the allowlist, -1 = network error, otherwise the HTTP status. */
export const auditStatus = (status: number): { kind: AuditKind } => ({ kind: status === 0 ? 'blocked' : status < 0 ? 'error' : status >= 400 ? 'http' : 'ok' });
