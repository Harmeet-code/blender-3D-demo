import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const archive = 'archive/legacy-2026-10-14';
if (existsSync(join(root, archive, 'manifest.json')) &&
    JSON.parse(readFileSync(join(root, archive, 'manifest.json'), 'utf8')).status !== 'planned') {
  throw new Error('An executed archive already exists; do not overwrite its restoration ledger.');
}
const slash = (path) => path.replaceAll('\\', '/');
const hash = (path) => createHash('sha256').update(readFileSync(join(root, path))).digest('hex');
function files(directory) {
  if (!existsSync(join(root, directory))) {return [];}
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    if (entry.isSymbolicLink()) {throw new Error(`Refusing symlink: ${directory}/${entry.name}`);}
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? files(path) : [path];
  });
}
const codeFiles = [...files('src'), ...files('scripts'), ...files('.github'), ...files('docker')]
  .filter((path) => /\.(?:tsx?|jsx?|mjs|css|html|yml)$/.test(path) && path !== slash(relative(root, fileURLToPath(import.meta.url))));
const codeReferences = new Map();
const missingImports = [];
const imports = [];
const addReference = (target, source) => {
  const sources = codeReferences.get(target) ?? new Set();
  sources.add(source);
  codeReferences.set(target, sources);
};
for (const path of [...codeFiles, 'vite.config.ts']) {
  const text = readFileSync(join(root, path), 'utf8');
  if (!/\.(?:tsx?|jsx?|mjs)$/.test(path)) {continue;}
  const ast = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  function visit(node) {
    if (ts.isStringLiteralLike(node)) {
      const value = slash(node.text).split('?')[0];
      let target;
      if (value.startsWith('@/')) {target = `src/${value.slice(2)}`;}
      else if (value.startsWith('.')) {target = slash(relative(root, resolve(root, dirname(path), value)));}
      else if (value.startsWith('/floor-assets/') || value.startsWith('/mall-assets/')) {target = `public${value}`;}
      else if (value.startsWith('mall-assets/')) {target = `public/${value}`;}
      if (target && existsSync(join(root, target))) {addReference(target, path);}
      const isImport = (ts.isImportDeclaration(node.parent) || ts.isExportDeclaration(node.parent))
        && node.parent.moduleSpecifier === node;
      if (isImport && target) {
        const resolved = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx']
          .map((suffix) => `${target}${suffix}`).find((p) => existsSync(join(root, p)));
        if (resolved) {imports.push({ source: path, target: resolved });}
        else {missingImports.push({ source: path, target });}
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
}
const persistedFiles = [...files('data'), ...files('.local')].filter((path) => path.endsWith('.json'));
const persistedReferences = new Map();
function collectStrings(value, source) {
  if (typeof value === 'string') {
    const url = slash(value).split('?')[0];
    if (url.startsWith('/floor-assets/') || url.startsWith('/mall-assets/')) {
      const path = `public${url}`;
      const sources = persistedReferences.get(path) ?? new Set();
      sources.add(source);
      persistedReferences.set(path, sources);
    }
  } else if (Array.isArray(value)) {value.forEach((item) => collectStrings(item, source));}
  else if (value && typeof value === 'object') {Object.values(value).forEach((item) => collectStrings(item, source));}
}
for (const path of persistedFiles) {collectStrings(JSON.parse(readFileSync(join(root, path), 'utf8')), path);}
// Seed documents are live dependencies even when they are fetched only through the admin UI.
for (const path of ['public/floor-assets/luminary-layout.json', 'src/assets/metadata/booth-sizes.v1.json']) {
  collectStrings(JSON.parse(readFileSync(join(root, path), 'utf8')), path);
}
const candidates = new Map();
const add = (path, reason) => { if (existsSync(join(root, path))) {candidates.set(path, reason);} };
for (const path of files('src/assets/models').filter((p) => p.endsWith('.glb'))) {
  add(path, 'Detached built-in GLB; built-in provider now constructs procedural geometry.');
}
for (const path of files('src/assets/metadata').filter((p) => p.endsWith('.json'))) {
  if (!codeReferences.has(path)) {add(path, 'Unused per-export metadata; active rolled-up catalog retains the interface.');}
}
for (const path of files('src/assets/images/asset-previews')) {
  add(path, 'Historical native preview; current inventory/gallery render procedural assets. Preserved for modeling comparison.');
}
for (const path of [
  'public/mall-assets/luminary-original.glb', 'public/mall-assets/luminary-original.json',
  'public/mall-assets/procedural-scene.de910adf57ba68fb4ee2.json',
  'public/floor-assets/luminary-metres.json', 'public/floor-assets/calibration.json',
]) {add(path, 'Superseded local export/report; not referenced by current code, seed layout or inspected persisted documents.');}
for (const path of files('public/mall-assets/draco')) {add(path, 'Decoder for retired original-mall GLB; current mall uses the compressed geometry blueprint.');}
for (const path of [
  'docs/R3F-plan.md', 'docs/R3F-plan-review.md', 'docs/R3F-performance-plan.md',
  'docs/R3F-plan-audit.ts', 'docs/R3F-migration-inventory.md', 'docs/opencode-v2-task.md',
  'docs/v2-v3-execution-plan.md',
  'src/assets/README.md',
]) {add(path, 'Historical plan, handoff or audit superseded by current execution/status guides.');}
for (const path of files('assets-source').filter((p) => p.endsWith('.blend1') || p.includes('/__pycache__/'))) {
  add(path, 'Old Blender autosave or generated Python bytecode; editable .blend sources and generators remain.');
}
for (const path of files('.cache/assets')) {add(path, 'Temporary native candidate/test fixture; active application does not use this cache.');}
for (const path of files('.cache').filter((p) => !p.slice('.cache/'.length).includes('/') && !p.startsWith('.cache/archive-'))) {
  if (/\.(?:log|txt)$/.test(path) || /asset-apply-.*\.json$/.test(path)) {add(path, 'Historical scratch log/search or asset application receipt.');}
}
const blocked = [];
for (const [path] of candidates) {
  const referencedBy = [...(codeReferences.get(path) ?? []), ...(persistedReferences.get(path) ?? [])];
  if (referencedBy.length) { blocked.push({ path, referencedBy }); candidates.delete(path); }
}
const entries = [...candidates].sort(([a], [b]) => a.localeCompare(b)).map(([path, reason]) => ({
  original: path, archived: `${archive}/payload/${path}`, bytes: statSync(join(root, path)).size,
  sha256: hash(path), reason,
}));
const protectedFiles = [...files('src'), ...files('public'), ...files('assets-source'), ...persistedFiles,
  'package.json', 'package-lock.json', 'bun.lock', 'vite.config.ts', 'tsconfig.json']
  .filter((path) => !candidates.has(path)).map((path) => ({ path, bytes: statSync(join(root, path)).size, sha256: hash(path) }));
const manifest = {
  schemaVersion: 1, date: '2026-10-14', status: 'planned', strategy: 'verified-move-no-deletion',
  fileCount: entries.length, bytes: entries.reduce((n, e) => n + e.bytes, 0), entries,
  checks: {
    imports, blocked, protectedFiles,
    inspectedPersistedFiles: persistedFiles,
    preexistingMissingImports: missingImports,
    limitations: ['External PostgreSQL records and browser-local drafts are not accessible to this filesystem audit.',
      'Public seed images, shells, booth exports/previews and uploaded media remain protected.',
      'Previous fingerprinted compressed mall blueprint retained for cached-client compatibility.',
      'Existing missing build scripts and tile files are not caused or fixed by this archive.'],
  },
};
mkdirSync(join(root, archive), { recursive: true });
writeFileSync(join(root, archive, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
const summary = JSON.stringify({ archive, files: manifest.fileCount, bytes: manifest.bytes,
  byExtension: entries.reduce((counts, entry) => { const extension = extname(entry.original); counts[extension] = (counts[extension] ?? 0) + 1; return counts; }, {}),
  blocked, preexistingMissingImports: missingImports }, null, 2);
process.stdout.write(`${summary}\n`);
