import type { AccueilView, AdminPasswordResult, AdminUser, AuthOptions, CarnetView, LoginStep, MeView, Patient, Section, TotpSetup } from '../../../server/src/contract.ts';

export type { AccueilView, AdminPasswordResult, AdminUser, MeView, Section } from '../../../server/src/contract.ts';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Appelé quand la session a expiré : l'app revient à l'écran de connexion. */
let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'network', 'Pas de connexion. Vérifiez le réseau puis réessayez.');
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  if (res.status === 401 && data.error === 'no_session') onUnauthorized();
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'unknown', data.message ?? 'Une erreur est survenue.');
  return data as T;
}

export const api = {
  login: (email: string, password: string) => request<LoginStep>('POST', '/api/login', { email, password }),
  code: (code: string) => request<MeView>('POST', '/api/login/code', { code }),
  authOptions: () => request<AuthOptions>('GET', '/api/auth/options'),
  forgot: (email: string) => request<{ ok: true }>('POST', '/api/password/forgot', { email }),
  resetPassword: (token: string, password: string, code?: string) =>
    request<{ ok: true }>('POST', '/api/password/reset', code ? { token, password, code } : { token, password }),
  totpSetup: () => request<TotpSetup>('POST', '/api/totp/setup', {}),
  totpEnable: (code: string) => request<MeView>('POST', '/api/totp/enable', { code }),
  totpDisable: (code: string) => request<MeView>('POST', '/api/totp/disable', { code }),
  adminUsers: () => request<AdminUser[]>('GET', '/api/admin/users'),
  adminCreate: (email: string, displayName: string, sections: Section[]) =>
    request<AdminPasswordResult>('POST', '/api/admin/users', { email, displayName, sections }),
  adminUpdate: (id: number, change: { sections?: Section[]; disabled?: boolean; displayName?: string }) =>
    request<AdminUser>('PATCH', `/api/admin/users/${id}`, change),
  adminResetPassword: (id: number) => request<AdminPasswordResult>('POST', `/api/admin/users/${id}/reset-password`, {}),
  adminSetRole: (id: number, admin: boolean, code: string) => request<AdminUser>('POST', `/api/admin/users/${id}/admin`, { admin, code }),
  adminResetTotp: (id: number) => request<AdminUser>('POST', `/api/admin/users/${id}/reset-totp`, {}),
  logout: () => request<{ ok: true }>('POST', '/api/logout'),
  me: () => request<MeView>('GET', '/api/me'),
  changePassword: (current: string, next: string) => request<MeView>('POST', '/api/password', { current, next }),
  accueil: () => request<AccueilView>('GET', '/api/accueil'),
  carnet: () => request<CarnetView>('GET', '/api/carnet'),
  savePatient: (code: string, p: unknown) => request<Patient>('PUT', `/api/carnet/patients/${encodeURIComponent(code)}`, p),
};
