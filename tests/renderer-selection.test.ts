import { describe, expect, test } from 'bun:test';
import { resolveRendererBackend } from '../src/frontend/widgets/world-viewport/create-renderer.ts';

function webglStub() {
  return { kind: 'webgl-stub', init: undefined as never };
}

describe('resolveRendererBackend', () => {
  test('uses WebGPU when enabled, available, and initialization succeeds', async () => {
    const created: string[] = [];
    const resolved = await resolveRendererBackend('canvas-stub', {
      webgpuEnabled: true,
      hasWebGPU: () => true,
      importWebGPU: async () => ({
        WebGPURenderer: class {
          constructor() {
            created.push('webgpu');
          }
          async init() {}
        },
      }),
      createWebGL: () => webglStub(),
    });
    expect(resolved.kind).toBe('webgpu');
    expect(created).toEqual(['webgpu']);
  });

  test('stays on WebGL unless WebGPU is explicitly enabled', async () => {
    let webgpuCreated = false;
    const resolved = await resolveRendererBackend('canvas-stub', {
      hasWebGPU: () => true,
      importWebGPU: async () => {
        webgpuCreated = true;
        throw new Error('should not import');
      },
      createWebGL: () => webglStub(),
    });
    expect(resolved.kind).toBe('webgl');
    expect(webgpuCreated).toBe(false);
  });

  test('falls back to WebGL when WebGPU is unavailable', async () => {
    let webgpuCreated = false;
    const resolved = await resolveRendererBackend('canvas-stub', {
      webgpuEnabled: true,
      hasWebGPU: () => false,
      importWebGPU: async () => {
        webgpuCreated = true;
        throw new Error('should not import');
      },
      createWebGL: () => webglStub(),
    });
    expect(resolved.kind).toBe('webgl');
    expect(webgpuCreated).toBe(false);
  });

  test('falls back to WebGL when WebGPU initialization rejects', async () => {
    const resolved = await resolveRendererBackend('canvas-stub', {
      webgpuEnabled: true,
      hasWebGPU: () => true,
      importWebGPU: async () => ({
        WebGPURenderer: class {
          async init() {
            throw new Error('adapter lost');
          }
        },
      }),
      createWebGL: () => webglStub(),
    });
    expect(resolved.kind).toBe('webgl');
  });

  test('falls back to WebGL when WebGPU initialization hangs', async () => {
    const resolved = await resolveRendererBackend('canvas-stub', {
      webgpuEnabled: true,
      hasWebGPU: () => true,
      importWebGPU: async () => ({
        WebGPURenderer: class {
          init(): Promise<void> {
            return new Promise(() => {});
          }
        },
      }),
      createWebGL: () => webglStub(),
      webgpuTimeoutMs: 10,
    });
    expect(resolved.kind).toBe('webgl');
  });
});
