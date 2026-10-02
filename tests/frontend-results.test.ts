import { afterAll, describe, expect, test } from 'bun:test';
import { apiResult, type ApiError } from '../src/frontend/shared/result/api-result.ts';
import { apiResultValidated } from '../src/frontend/shared/result/api-result.ts';
import { layoutResponseSchema } from '../src/frontend/entities/building/api/dto.ts';
import { getLayout } from '../src/frontend/entities/building/api/layouts-client.ts';
import { demoLayout } from '../src/frontend/entities/building/model/building-schema.ts';
import { useLayoutStore } from '../src/frontend/entities/building/model/layout-store.ts';
import type { AvatarState } from '../src/frontend/entities/building/model/building-schema.ts';
import { buildServer } from '../src/server/app.ts';

const app = buildServer();
const address = await app.listen({ port: 0, host: '127.0.0.1' });
const base = address.replace('[::1]', '127.0.0.1');

afterAll(async () => {
  await app.close();
});

describe('frontend Result api client', () => {
  test('layout store load replaces the current layout with validated API data', async () => {
    const originalFetch = globalThis.fetch;
    const originalBaseUrl = process.env['VITE_API_BASE_URL'];
    const apiLayout = { ...demoLayout, buildingId: 'loaded-event' };
    expect(useLayoutStore.getState().source.buildingId).toBe('convention-center-01');
    process.env['VITE_API_BASE_URL'] = 'http://layout-api.test';
    globalThis.fetch = Object.assign(
      async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json(apiLayout),
      { preconnect: originalFetch.preconnect },
    );
    try {
      await useLayoutStore.getState().load('loaded-event');

      expect(useLayoutStore.getState().source.buildingId).toBe('loaded-event');
      expect(useLayoutStore.getState().layout.buildingId).toBe('loaded-event');
      expect(useLayoutStore.getState().loadStatus).toBe('ready');
      expect(useLayoutStore.getState().loadError).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
      if (originalBaseUrl === undefined) {
        delete process.env['VITE_API_BASE_URL'];
      } else {
        process.env['VITE_API_BASE_URL'] = originalBaseUrl;
      }
    }
  });

  test('layout store load failure retains the last valid layout', async () => {
    const originalFetch = globalThis.fetch;
    const originalBaseUrl = process.env['VITE_API_BASE_URL'];
    const currentLayout = { ...demoLayout, buildingId: 'last-valid-event' };
    useLayoutStore.getState().update(currentLayout);
    process.env['VITE_API_BASE_URL'] = 'http://layout-api.test';
    globalThis.fetch = Object.assign(
      async (_input: RequestInfo | URL, _init?: RequestInit) => {
        throw new Error('offline');
      },
      { preconnect: originalFetch.preconnect },
    );
    try {
      await useLayoutStore.getState().load('unavailable-event');

      expect(useLayoutStore.getState().source.buildingId).toBe('last-valid-event');
      expect(useLayoutStore.getState().layout.buildingId).toBe('last-valid-event');
      expect(useLayoutStore.getState().loadStatus).toBe('error');
      expect(useLayoutStore.getState().loadError).toContain('Network failure');
    } finally {
      globalThis.fetch = originalFetch;
      if (originalBaseUrl === undefined) {
        delete process.env['VITE_API_BASE_URL'];
      } else {
        process.env['VITE_API_BASE_URL'] = originalBaseUrl;
      }
    }
  });

  test('ok on 2xx with parsed body', async () => {
    const result = await apiResult<{ ok: boolean }>(`${base}/api/health`);
    expect(result.isOk()).toBe(true);
  });

  test('entity client resolves layout through the API', async () => {
    const original = process.env['VITE_API_BASE_URL'];
    process.env['VITE_API_BASE_URL'] = base;
    try {
      const result = await getLayout('convention-center-01');
      expect(result.isOk()).toBe(true);
    } finally {
      if (original === undefined) {
        delete process.env['VITE_API_BASE_URL'];
      } else {
        process.env['VITE_API_BASE_URL'] = original;
      }
    }
  });

  test('err on non-2xx with status', async () => {
    const result = await apiResult(`${base}/api/events/e/layout`, {
      method: 'PUT',
      body: JSON.stringify({ nope: true }),
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toMatchObject({ kind: 'http', status: 400 });
    }
  });

  test('err on unreachable host', async () => {
    const result = await apiResult('http://127.0.0.1:1/nope');
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.kind).toBe('network');
    }
  });

  test('presence echo round-trips through the typed handler', async () => {
    const wsUrl = `${base.replace('http', 'ws')}/ws/avatars`;
    const frame: AvatarState = {
      id: 'probe',
      position: [1, 0, 2],
      rotationY: 0,
      floorId: 'F1',
      animationState: 'idle',
    };
    const received = await new Promise<AvatarState | ApiError>((resolve) => {
      const socket = new WebSocket(wsUrl);
      socket.addEventListener('open', () => {
        socket.send(JSON.stringify(frame));
      });
      socket.addEventListener('message', (event) => {
        try {
          const data = JSON.parse(String(event.data)) as AvatarState & { type?: string };
          if (data.type === 'avatar') {
            resolve(data);
          } else {
            resolve({ kind: 'parse', message: 'unexpected frame' });
          }
        } catch {
          resolve({ kind: 'parse', message: 'Invalid presence frame' });
        } finally {
          socket.close();
        }
      });
      socket.addEventListener('error', () => {
        resolve({ kind: 'network', message: 'Presence socket error' });
        socket.close();
      });
    });
    expect('id' in received ? received.id : null).toBe('probe');
  });

  test('DTO mismatch surfaces as typed parse err, never corrupt data', async () => {
    const result = await apiResultValidated(`${base}/api/health`, layoutResponseSchema);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.kind).toBe('parse');
    }
  });
});
