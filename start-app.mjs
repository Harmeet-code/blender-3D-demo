#!/usr/bin/env bun
// Run from any directory: bun /path/to/start-app.mjs
import { spawn } from 'node:child_process';
import { existsSync, createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, request as proxyRequest } from 'node:http';
import { connect } from 'node:net';
import { homedir } from 'node:os';
import { delimiter, dirname, join, resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = dirname(fileURLToPath(import.meta.url));
const windows = process.platform === 'win32';
const args = process.argv.slice(2).filter((arg) => arg !== '--');
const production = args.includes('--production') || process.env.NODE_ENV === 'production';
const port = Number(process.env.FRONTEND_PORT ?? 5175);
const apiPort = Number(process.env.BACKEND_PORT ?? 8000);
const frontendUrl = `http://127.0.0.1:${port}${production ? '/floorplan/' : '/admin/floor-plan'}?eventId=floor-plan-studio`;
const backendUrl = `http://127.0.0.1:${apiPort}/api/health`;
const children = new Set();
let webServer;
let stopping = false;
const log = (message) => process.stdout.write(`${message}\n`);

async function probe(url, backend = false) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    const body = await response.text();
    let ready = false;
    if (response.ok) {
      if (backend) {
        try {
          const health = JSON.parse(body);
          ready = health?.ok === true && health.deps !== null && typeof health.deps === 'object';
        } catch {
          ready = false;
        }
      } else {
        ready = body.includes('<title>Floor plan studio</title>');
      }
    }
    return { ready, occupied: true };
  } catch {
    return { ready: false, occupied: false };
  }
}

function bunExecutable() {
  const name = windows ? 'bun.exe' : 'bun';
  const candidates = [
    process.env.BUN_EXECUTABLE,
    ...(process.env.PATH ?? '').split(delimiter).map((dir) => join(dir, name)),
    join(homedir(), '.bun', 'bin', name),
    process.env.APPDATA && join(process.env.APPDATA, 'npm', 'node_modules', 'bun', 'bin', name),
  ];
  const found = candidates.find((candidate) => candidate && existsSync(candidate));
  if (!found) {
    throw new Error('Bun was not found. Install Bun or set BUN_EXECUTABLE to its executable path.');
  }
  return found;
}

async function stop(code = 0) {
  if (stopping) {
    return;
  }
  stopping = true;
  webServer?.closeAllConnections();
  webServer?.close();
  // Only processes started by this invocation are stopped; reused services are untouched.
  await Promise.all(
    [...children].map(
      (child) =>
        new Promise((done) => {
          if (windows) {
            const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
              windowsHide: true,
              stdio: 'ignore',
            });
            killer.once('error', done);
            killer.once('close', done);
          } else {
            try {
              process.kill(-child.pid, 'SIGTERM');
            } catch {
              /* Already exited. */
            }
            done();
          }
        }),
    ),
  );
  process.exit(code);
}

function launch(name, executable, commandArgs, env = process.env, build = false) {
  log(`Starting ${name}…`);
  const child = spawn(executable, commandArgs, {
    cwd: root,
    env,
    stdio: 'inherit',
    shell: false,
    windowsHide: true,
    detached: !windows,
  });
  children.add(child);
  child.once('error', (error) => {
    children.delete(child);
    log(`${name} could not start: ${error.message}`);
    void stop(1);
  });
  child.once('exit', (code, signal) => {
    children.delete(child);
    if (!stopping && !build) {
      log(`${name} exited (${signal ?? code}). Stopping this launcher's remaining services.`);
      void stop(code === 0 ? 0 : 1);
    }
  });
  return child;
}

// Production serves only build output, never source files or Vite's development server.
async function serveProduction() {
  const output = resolve(root, 'dist/floor-plan-builder');
  const mime = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.wasm': 'application/wasm',
    '.woff2': 'font/woff2',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.webp': 'image/webp',
  };
  webServer = createServer(async (request, response) => {
    if (/^\/api(?:\/|\?|$)/.test(request.url ?? '')) {
      const upstream = proxyRequest(
        {
          hostname: '127.0.0.1',
          port: apiPort,
          path: request.url,
          method: request.method,
          headers: { ...request.headers, host: `127.0.0.1:${apiPort}` },
        },
        (result) => {
          response.writeHead(result.statusCode ?? 502, result.headers);
          result.pipe(response);
        },
      );
      upstream.on('error', () => {
        response.statusCode = 502;
        response.end('Backend unavailable.');
      });
      response.on('close', () => upstream.destroy());
      request.pipe(upstream);
      return;
    }
    try {
      if (!['GET', 'HEAD'].includes(request.method)) {
        response.writeHead(405, { Allow: 'GET, HEAD' });
        response.end();
        return;
      }
      const pathname = decodeURIComponent(new URL(request.url, frontendUrl).pathname);
      const relative = pathname.replace(/^\/floorplan(?:\/|$)/, '/');
      const route =
        /^\/(?:floorplan\/?)?$/.test(pathname) ||
        /^\/(?:admin\/floor-plan\/?|preview\/?|inventory\/?)$/.test(relative);
      const file = route
        ? join(output, 'src/floor-plan-builder/index.html')
        : resolve(output, `.${relative}`);
      if (!file.startsWith(output + sep)) {
        response.writeHead(403);
        response.end();
        return;
      }
      const info = await stat(file);
      if (!info.isFile()) {
        response.writeHead(404);
        response.end();
        return;
      }
      response.writeHead(200, {
        'Content-Type': mime[extname(file)] ?? 'application/octet-stream',
        'Content-Length': info.size,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': file.includes(`${sep}assets${sep}`)
          ? 'public, max-age=31536000, immutable'
          : 'no-cache',
      });
      if (request.method === 'HEAD') {
        response.end();
        return;
      }
      const stream = createReadStream(file);
      stream.on('error', () => response.destroy());
      response.on('close', () => stream.destroy());
      stream.pipe(response);
    } catch {
      response.writeHead(404);
      response.end('Not found.');
    }
  });
  webServer.on('upgrade', (request, socket, head) => {
    if (!/^\/ws(?:\/|\?|$)/.test(request.url ?? '')) {
      socket.destroy();
      return;
    }
    const upstream = connect(apiPort, '127.0.0.1', () => {
      const headers = request.rawHeaders.reduce(
        (text, value, i, raw) => (i % 2 ? text : `${text}${value}: ${raw[i + 1]}\r\n`),
        '',
      );
      upstream.write(
        `${request.method} ${request.url} HTTP/${request.httpVersion}\r\n${headers}\r\n`,
      );
      upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    });
    upstream.on('error', () => socket.destroy());
    socket.on('error', () => upstream.destroy());
    socket.on('close', () => upstream.destroy());
  });
  await new Promise((ready, reject) => {
    webServer.once('error', reject);
    webServer.listen(port, '127.0.0.1', ready);
  });
}

async function main() {
  if (args.includes('--help')) {
    log('bun start                 Start frontend + backend with hot reload.');
    log('bun start --production    Build and serve frontend + backend without watchers.');
    return;
  }
  if (
    args.some((arg) => arg !== '--production') ||
    [port, apiPort].some((value) => !Number.isInteger(value) || value < 1 || value > 65535) ||
    port === apiPort
  ) {
    throw new Error('Invalid option or port. Run bun start --help.');
  }
  const vite = join(root, 'node_modules', 'vite', 'bin', 'vite.js');
  if (!existsSync(vite)) {
    throw new Error('Dependencies are missing. Run bun install first.');
  }
  const [frontend, backend] = await Promise.all([probe(frontendUrl), probe(backendUrl, true)]);
  if (frontend.occupied && !frontend.ready) {
    throw new Error(`Port ${port} is occupied by a different app.`);
  }
  if (backend.occupied && !backend.ready) {
    throw new Error(`Port ${apiPort} is occupied by a different app.`);
  }
  // Resolve requirements before starting either child, avoiding a half-started stack.
  // Every child runs under Bun: Vite serves the frontend with HMR and the backend watches with bun --watch.
  const bun = bunExecutable();
  if (production && (frontend.occupied || backend.occupied)) {
    throw new Error(
      `Production needs free ports ${port} and ${apiPort}. Stop the existing stack first; it will not be reused or terminated.`,
    );
  }
  if (production) {
    log('Building production frontend and backend…');
    await new Promise((done, reject) => {
      const build = launch('build', bun, ['run', 'build'], process.env, true);
      build.once('error', reject);
      build.once('exit', (code) =>
        code === 0 ? done() : reject(new Error('Production build failed.')),
      );
    });
  }
  if (backend.ready) {
    log('Backend is already running; reusing it.');
  } else {
    launch(
      'backend',
      bun,
      production ? ['dist-server/server.js'] : ['--watch', 'src/server/app/server.ts'],
      {
        ...process.env,
        PORT: String(apiPort),
        HOST: '127.0.0.1',
        NODE_ENV: production ? 'production' : 'development',
      },
    );
  }
  if (production) {
    await serveProduction();
  } else if (frontend.ready) {
    log('Frontend is already running; reusing it.');
  } else {
    launch(
      'frontend',
      bun,
      [
        vite,
        '--config',
        'src/floor-plan-builder/vite.config.ts',
        '--host',
        '127.0.0.1',
        '--port',
        String(port),
        '--strictPort',
      ],
      { ...process.env, BACKEND_PORT: String(apiPort), NODE_ENV: 'development' },
    );
  }

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline && !stopping) {
    const [web, api] = await Promise.all([probe(frontendUrl), probe(backendUrl, true)]);
    if (web.ready && api.ready) {
      log('\nBoth services are ready.');
      log(`App:    ${frontendUrl.replace('127.0.0.1', 'localhost')}`);
      log(`Health: ${backendUrl}`);
      if (children.size || webServer) {
        log('Keep this terminal open. Ctrl+C stops the services started here.');
      }
      return;
    }
    await delay(300);
  }
  throw new Error('Services did not become ready within 30 seconds. See startup output above.');
}

process.once('SIGINT', () => void stop(0));
process.once('SIGTERM', () => void stop(0));
main().catch(async (error) => {
  log(error.message);
  await stop(1);
});
