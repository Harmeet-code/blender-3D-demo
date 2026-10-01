import { afterAll, describe, expect, test } from 'bun:test';
import { apiResult, type ApiError } from '../src/frontend/shared/result/api-result.ts';
import { apiResultValidated } from '../src/frontend/shared/result/api-result.ts';
import { layoutResponseSchema } from '../src/frontend/entities/building/api/dto.ts';
import { getLayout } from '../src/frontend/entities/building/api/layouts-client.ts';
import type { AvatarState } from '../src/frontend/entities/building/model/building-schema.ts';
import { buildServer } from '../src/server/app.ts';

const app = buildServer();
const address = await app.listen({ port: 0, host: '127.0.0.1' });
const base = address.replace('[::1]', '127.0.0.1');

afterAll(async () => {
  await app.close();
});

describe('frontend Result api client', () => {
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
