import axios, { AxiosError, type AxiosRequestConfig, type AxiosResponse } from 'axios';
import { err, ok, ResultAsync, type Result } from 'neverthrow';
import type { z } from 'zod';
import { apiClient } from './client.ts';

export type ApiErrorKind = 'http' | 'network' | 'parse';

export interface ApiError {
  kind: ApiErrorKind;
  status?: number;
  message: string;
}

function normalizeApiError(cause: unknown, url: string): ApiError {
  if (!axios.isAxiosError(cause)) {
    return { kind: 'network', message: `Request failed for ${url}` };
  }
  if (cause.response && cause.response.status >= 400) {
    return {
      kind: 'http',
      status: cause.response.status,
      message: `API ${cause.response.status} ${url}`,
    };
  }
  if (cause.code === AxiosError.ERR_BAD_RESPONSE) {
    return {
      kind: 'parse',
      status: cause.response?.status,
      message: `Invalid JSON from ${url}`,
    };
  }
  return { kind: 'network', message: `Network failure for ${url}` };
}

/** Make an Axios request and translate transport failures into a typed Result. */
export async function apiResult(
  url: string,
  config?: AxiosRequestConfig,
  onResponse?: (response: AxiosResponse<unknown>) => void,
): Promise<Result<unknown, ApiError>> {
  let request: Promise<AxiosResponse<unknown>>;
  try {
    request = apiClient.request<unknown>({ ...config, url });
  } catch (cause) {
    return err(normalizeApiError(cause, url));
  }
  return await ResultAsync.fromPromise(request, (cause) => normalizeApiError(cause, url)).map(
    (response) => {
      onResponse?.(response);
      return response.data;
    },
  );
}

/** Validate response data before exposing it to application code. */
export async function apiResultValidated<TOutput, TInput>(
  url: string,
  schema: z.ZodType<TOutput, z.ZodTypeDef, TInput>,
  config?: AxiosRequestConfig,
  onResponse?: (response: AxiosResponse<unknown>) => void,
): Promise<Result<TOutput, ApiError>> {
  const result = await apiResult(url, config, onResponse);
  if (result.isErr()) {
    return err(result.error);
  }
  const parsed = schema.safeParse(result.value);
  if (!parsed.success) {
    return err({ kind: 'parse', message: `Response validation failed for ${url}` });
  }
  return ok(parsed.data);
}
