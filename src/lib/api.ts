// Authenticated API client — holds Bearer token strictly in JS memory (never localStorage)
let inMemoryToken: string | null = null;
let firebaseTokenProvider: (() => Promise<string | null>) | null = null;

export function setSessionToken(token: string | null) {
  inMemoryToken = token;
}

export function setFirebaseTokenProvider(fn: (() => Promise<string | null>) | null) {
  firebaseTokenProvider = fn;
}

async function resolveAuthHeader(): Promise<string | null> {
  if (inMemoryToken) return `Bearer ${inMemoryToken}`;
  if (firebaseTokenProvider) {
    const fbToken = await firebaseTokenProvider();
    if (fbToken) return `Bearer ${fbToken}`;
  }
  return null;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('X-Requested-With', 'XMLHttpRequest');

  if (!(options.body instanceof FormData) && !headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }

  const authHeader = await resolveAuthHeader();
  if (authHeader && !headers.has('Authorization')) {
    headers.set('Authorization', authHeader);
  }

  const res = await fetch(path, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) msg = data.error;
    } catch {
      // ignore non-json error body
    }
    throw new ApiError(msg, res.status);
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return (await res.json()) as T;
  }
  return (await res.blob()) as unknown as T;
}

export async function apiDownload(path: string, fallbackName: string): Promise<void> {
  const headers = new Headers({ 'X-Requested-With': 'XMLHttpRequest' });
  const authHeader = await resolveAuthHeader();
  if (authHeader) headers.set('Authorization', authHeader);

  const res = await fetch(path, {
    method: 'GET',
    headers,
    credentials: 'include',
  });

  if (!res.ok) {
    let msg = 'Download failed.';
    try {
      const err = await res.json();
      if (err?.error) msg = err.error;
    } catch {
      // ignore
    }
    throw new ApiError(msg, res.status);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fallbackName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
