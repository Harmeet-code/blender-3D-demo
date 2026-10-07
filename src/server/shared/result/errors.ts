import { err, ok, type Result } from 'neverthrow';

/** Closed error taxonomy for the API. Services return these, routes map them to HTTP. */
export type ErrorCode =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'UNAVAILABLE'
  | 'INTERNAL';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  UNAVAILABLE: 503,
  INTERNAL: 500,
};

export interface AppError {
  readonly name: 'AppError';
  readonly code: ErrorCode;
  readonly status: number;
  readonly message: string;
  readonly details?: unknown;
}

function createAppError(code: ErrorCode, message: string, details?: unknown): AppError {
  return {
    name: 'AppError',
    code,
    status: STATUS_BY_CODE[code],
    message,
    details,
  };
}

export function validationError(message: string, details?: unknown): AppError {
  return createAppError('VALIDATION', message, details);
}

export function notFoundError(message: string): AppError {
  return createAppError('NOT_FOUND', message);
}

export function conflictError(message: string): AppError {
  return createAppError('CONFLICT', message);
}

export function rateLimitError(): AppError {
  return createAppError('RATE_LIMITED', 'Reservation rate limit exceeded');
}

export function unavailableError(message: string): AppError {
  return createAppError('UNAVAILABLE', message);
}

export function internalError(message: string, details?: unknown): AppError {
  return createAppError('INTERNAL', message, details);
}

/** Typed details for persistence failures: what statement, what cause. */
export interface DbFailureDetails {
  statement: string;
  cause: string;
}

export function dbError(statement: string, cause: unknown): AppError {
  const message = cause instanceof Error ? cause.message : String(cause);
  return createAppError('INTERNAL', `${statement} failed: ${message}`, {
    statement,
    cause: message,
  } satisfies DbFailureDetails);
}

/**
 * Exhaustiveness guard for switches over closed unions. Returns (never throws)
 * so every branch stays inside the Result pattern.
 */
export function assertNever(value: never, what = 'Unhandled variant'): AppError {
  return internalError(`${what}: ${JSON.stringify(value)}`);
}

/** Shape sent over the wire for every service failure. */
export function toHttpBody(error: AppError): { error: string; code: ErrorCode; details?: unknown } {
  return { error: error.message, code: error.code, details: error.details };
}

/** Run a throwing repository call, mapping any failure to INTERNAL. */
export async function fromRepository<T>(
  run: () => Promise<T>,
  what: string,
): Promise<Result<T, AppError>> {
  try {
    return ok(await run());
  } catch (cause) {
    return err(dbError(what, cause));
  }
}

export { err, ok, type Result };
