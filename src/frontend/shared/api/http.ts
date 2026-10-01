/** Base URL for the Fastify API. Empty string = same-origin (Vite proxy). */
export function apiBaseUrl(): string {
  return import.meta.env['VITE_API_BASE_URL'] ?? '';
}
