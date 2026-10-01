/** Base URL for the Fastify API. Empty string = same-origin (Vite proxy). */
export function apiBaseUrl(): string {
  return import.meta.env['VITE_API_BASE_URL'] ?? '';
}

/** Typed JSON fetch against the API. Throws on non-2xx with the body text. */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    throw new Error(`API ${res.status} ${path}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}
