import { err, ok, type Result } from 'neverthrow';
import type { z } from 'zod';

/** Closed error taxonomy for frontend data access. No throws past this boundary. */
export type ApiErrorKind = 'http' | 'network' | 'parse';

export interface ApiError {
  kind: ApiErrorKind;
  status?: number;
  message: string;
}

/** Fetch JSON, returning ok/err instead of throwing. Absolute or same-origin URL. */
export async function apiResult<T>(url: string, init?: RequestInit): Promise<Result<T, ApiError>> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { 'content-type': 'application/json', ...init?.headers },
    });
  } catch {
    return err({ kind: 'network', message: `Network failure for ${url}` });
  }
  if (!res.ok) {
    return err({ kind: 'http', status: res.status, message: `API ${res.status} ${url}` });
  }
  try {
    return ok((await res.json()) as T);
  } catch {
    return err({ kind: 'parse', status: res.status, message: `Invalid JSON from ${url}` });
  }
}

/**
 * Fetch JSON and validate it against a DTO schema. Contract mismatches
 * surface as typed `parse` errors, never as corrupt data. Entity clients
 * must use this instead of casting.
 *
 * NOTE: output and input are bound as separate generics so inference picks
 * the schema's output type (`.default()` fields required), not its input type.
 */
export async function apiResultValidated<TOutput, TInput>(
  url: string,
  schema: z.ZodType<TOutput, z.ZodTypeDef, TInput>,
  init?: RequestInit,
): Promise<Result<TOutput, ApiError>> {
  const result = await apiResult<unknown>(url, init);
  if (result.isErr()) {
    return err(result.error);
  }
  const parsed = schema.safeParse(result.value);
  if (!parsed.success) {
    return err({ kind: 'parse', message: `Response validation failed for ${url}` });
  }
  return ok(parsed.data);
}

export { err, ok, type Result };
