import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';

const baseURL = (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '');

/** Build URLs for API-served assets (images/downloads) as well as JSON calls. */
export const apiUrl = (path: string): string => `${baseURL}/${path.replace(/^\/+/, '')}`;

export const api = axios.create({ baseURL });

let accessToken: string | null = localStorage.getItem('sgs.accessToken');
let refreshToken: string | null = localStorage.getItem('sgs.refreshToken');

export const tokenStore = {
  get access() {
    return accessToken;
  },
  set(access: string | null, refresh: string | null) {
    accessToken = access;
    refreshToken = refresh;
    if (access) localStorage.setItem('sgs.accessToken', access);
    else localStorage.removeItem('sgs.accessToken');
    if (refresh) localStorage.setItem('sgs.refreshToken', refresh);
    else localStorage.removeItem('sgs.refreshToken');
  },
  clear() {
    this.set(null, null);
  },
};

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.set('Authorization', `Bearer ${accessToken}`);
  return config;
});

let refreshing: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (!refreshToken) return false;
  try {
    const { data } = await axios.post(`${baseURL}/auth/refresh`, { refreshToken });
    tokenStore.set(data.accessToken, data.refreshToken);
    window.dispatchEvent(new CustomEvent('sgs:session', { detail: data.user }));
    return true;
  } catch {
    tokenStore.clear();
    return false;
  }
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as
      (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    if (
      error.response?.status === 401 &&
      original &&
      !original._retry &&
      !original.url?.includes('/auth/')
    ) {
      original._retry = true;
      refreshing ??= tryRefresh().finally(() => {
        refreshing = null;
      });
      if (await refreshing) return api(original);
      window.dispatchEvent(new Event('sgs:logout'));
    }
    return Promise.reject(error);
  },
);

/** Extract a human-readable message from our API error envelope. */
export function apiError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const res = err.response;
    const data = res?.data as { error?: { message?: string } } | string | undefined;

    if (typeof data === 'object' && data?.error?.message) return data.error.message;

    // The request reached a server, but not *our* API: a proxy/rewrite returned
    // the SPA's index.html (or another HTML page) instead of the JSON envelope.
    if (typeof data === 'string' && data.trimStart().startsWith('<')) {
      return `The API did not respond to ${err.config?.method?.toUpperCase() ?? 'this request'} ${err.config?.url ?? ''} (got an HTML page instead of JSON). Check that VITE_API_URL points at the running API.`;
    }

    if (res?.status === 404) {
      return `Endpoint not found: ${err.config?.method?.toUpperCase() ?? 'GET'} ${err.config?.url ?? ''}. The API may be running an older build — redeploy the server.`;
    }

    if (!res) {
      return `Cannot reach the API${err.config?.url ? ` (${err.config.url})` : ''}. Check that the server is running and CORS allows this origin.`;
    }

    return err.message;
  }
  return err instanceof Error ? err.message : 'Unexpected error';
}
