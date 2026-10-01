import { z } from 'zod';

const frontendEnvSchema = z.object({
  VITE_API_BASE_URL: z.string().default(''),
  VITE_WS_URL: z.string().default(''),
});

export type FrontendEnv = z.infer<typeof frontendEnvSchema>;

/** Validated frontend env (import.meta.env). Never throws: falls back to defaults. */
export function frontendEnv(): FrontendEnv {
  const parsed = frontendEnvSchema.safeParse(import.meta.env);
  if (parsed.success) {
    return parsed.data;
  }
  return { VITE_API_BASE_URL: '', VITE_WS_URL: '' };
}
