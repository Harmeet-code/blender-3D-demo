import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

/** Fail when the production bundle regresses: empty chunks, missing vendors, or a bloated entry. */
async function check(): Promise<void> {
  const dir = join(process.cwd(), 'dist', 'assets');
  const files = (await readdir(dir)).filter((file) => file.endsWith('.js'));
  if (files.length === 0) {
    throw new Error('No JavaScript chunks found. Run `bun run build` first.');
  }
  const failures: string[] = [];
  let entryBytes = 0;
  const vendors = new Set<string>();
  for (const file of files) {
    const bytes = (await stat(join(dir, file))).size;
    if (bytes === 0) {
      failures.push(`Empty chunk: ${file}`);
    }
    if (/^index-.*\.js$/.test(file)) {
      entryBytes = bytes;
    }
    const vendor = file.match(/^(vendor-[a-z]+)-/)?.[1];
    if (vendor) {
      vendors.add(vendor);
    }
  }
  for (const expected of ['vendor-three', 'vendor-physics', 'vendor-ui']) {
    if (!vendors.has(expected)) {
      failures.push(`Missing chunk group: ${expected}`);
    }
  }
  if (entryBytes > 1024 * 1024) {
    failures.push(`Entry chunk ${(entryBytes / 1024).toFixed(0)} kB exceeds 1024 kB`);
  }
  if (failures.length > 0) {
    throw new Error(failures.join('\n'));
  }
  process.stdout.write(
    `Chunk check passed: entry ${(entryBytes / 1024).toFixed(0)} kB, vendors ${[...vendors].sort().join(', ')}.\n`,
  );
}

await check().catch((cause: unknown) => {
  process.stderr.write(`${cause instanceof Error ? cause.message : cause}\n`);
  process.exit(1);
});
