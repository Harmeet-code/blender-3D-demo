import type { z } from 'zod';
import { err, internalError, ok, validationError, type AppError, type Result } from './errors.ts';

/**
 * Validate an inbound request DTO. VALIDATION err carrying zod issues.
 * Services use this instead of try/catch around `.parse`.
 *
 * NOTE: output and input are bound as separate generics so inference picks
 * the schema's output type (`.default()` fields required), not its input type.
 */
export function parseRequest<TOutput, TInput>(
  schema: z.ZodType<TOutput, z.ZodTypeDef, TInput>,
  input: unknown,
  what: string,
): Result<TOutput, AppError> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return err(validationError(`Invalid ${what}`, parsed.error.issues));
  }
  return ok(parsed.data);
}

/**
 * Validate an outbound response DTO before it leaves the service. Mismatch is
 * INTERNAL (contract drift, e.g. unexpected DB shape), never client error.
 */
export function validateResponse<TOutput, TInput>(
  schema: z.ZodType<TOutput, z.ZodTypeDef, TInput>,
  data: unknown,
  what: string,
): Result<TOutput, AppError> {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    return err(internalError(`${what} failed response validation`, parsed.error.issues));
  }
  return ok(parsed.data);
}
