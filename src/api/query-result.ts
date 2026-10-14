import type { Result } from 'neverthrow';

/** Adapt a neverthrow Result to TanStack Query's reject-on-failure contract. */
export function unwrapQueryResult<T, E>(result: Result<T, E>): T {
  if (result.isErr()) {
    throw result.error;
  }
  return result.value;
}
