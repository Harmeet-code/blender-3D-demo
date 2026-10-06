import * as THREE from 'three';

/** Which graphics backend the canvas renderer was created with. */
export type RendererKind = 'webgpu' | 'webgl';

export interface RendererFactories {
  hasWebGPU?: () => boolean;
  importWebGPU?: () => Promise<{
    WebGPURenderer: new (options: { canvas: unknown }) => { init: () => Promise<void> };
  }>;
  createWebGL?: (canvas: unknown) => unknown;
  /** Max time to wait for WebGPU initialization before falling back. */
  webgpuTimeoutMs?: number;
  /** WebGPU is opt-in: only attempted when explicitly enabled. */
  webgpuEnabled?: boolean;
}

function defaultHasWebGPU(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator && navigator.gpu !== undefined;
}

/**
 * Create the canvas renderer, preferring WebGPU when the browser exposes an
 * adapter and initialization succeeds. Any failure falls back to WebGL2 so the
 * venue stays usable; callers render an in-DOM alert only when both fail.
 */
export async function resolveRendererBackend(
  canvas: unknown,
  factories: RendererFactories = {},
): Promise<{ kind: RendererKind; renderer: unknown }> {
  const hasWebGPU = factories.hasWebGPU ?? defaultHasWebGPU;
  type WebGPUModule = Awaited<ReturnType<NonNullable<RendererFactories['importWebGPU']>>>;
  const importWebGPU: () => Promise<WebGPUModule> =
    factories.importWebGPU ??
    ((() => import('three/webgpu')) as unknown as () => Promise<WebGPUModule>);
  const createWebGL =
    factories.createWebGL ??
    ((target: unknown) => new THREE.WebGLRenderer({ canvas: target as never }));

  if ((factories.webgpuEnabled ?? false) && hasWebGPU()) {
    try {
      const module = await importWebGPU();
      const renderer = new module.WebGPURenderer({ canvas });
      // An adapter that never settles must not block the venue: race init
      // against a timeout and fall back to WebGL2.
      const timeoutMs = factories.webgpuTimeoutMs ?? 5000;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          renderer.init(),
          new Promise<never>((_, reject) => {
            timeout = setTimeout(() => {
              reject(new Error('WebGPU initialization timed out'));
            }, timeoutMs);
          }),
        ]);
      } finally {
        clearTimeout(timeout);
      }
      return { kind: 'webgpu', renderer };
    } catch {
      // Adapter lost or unsupported: fall through to WebGL2.
    }
  }
  return { kind: 'webgl', renderer: createWebGL(canvas) };
}
