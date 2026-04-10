const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

let getTokenFn: (() => Promise<string | null>) | null = null;

export function setTokenProvider(fn: () => Promise<string | null>) {
  getTokenFn = fn;
}

/** Exposed so non-fetch consumers (e.g. WebSocket hook) can get a fresh token. */
export async function getAuthToken(): Promise<string | null> {
  return getTokenFn ? getTokenFn() : null;
}

export async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getTokenFn ? await getTokenFn() : null;

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });

  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}
