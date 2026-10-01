import type { FastifyReply } from 'fastify';
import { toHttpBody, type AppError, type Result } from './errors.ts';

/** Unwrap a service Result into a payload or a coded error body. No throws. */
export function replyResult<T>(reply: FastifyReply, result: Result<T, AppError>): T | FastifyReply {
  if (result.isOk()) {
    return result.value;
  }
  return reply.code(result.error.status).send(toHttpBody(result.error));
}
