import type { FastifyInstance, FastifyReply } from 'fastify';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { WorkAdmission } from '@/features/world/model/work-admission.ts';
import { encodePaddedTile, imagePyramid, tileCacheIdentity, TILE_RECIPE } from './tile-recipe.ts';
const tileAdmission = new WorkAdmission(1);
import { dataDirectory } from '../layouts/local-storage.ts';

const MAX_BYTES = 50 * 1024 * 1024;
export async function registerMediaRoutes(app: FastifyInstance): Promise<void> {
  app.addContentTypeParser(
    ['image/png', 'image/jpeg', 'image/webp', 'model/gltf-binary'],
    { parseAs: 'buffer', bodyLimit: MAX_BYTES },
    (_request, body, done) => done(null, body),
  );
  app.post('/media', { bodyLimit: MAX_BYTES }, async (request, reply) => {
    const { body } = request;
    if (!Buffer.isBuffer(body) || !body.length) {
      return reply.code(400).send({ error: 'Upload an image or GLB as a binary request body.' });
    }
    const mime = request.headers['content-type']?.split(';')[0];
    const hash = createHash('sha256').update(body).digest('hex');
    const directory = join(dataDirectory(), 'media');
    await mkdir(directory, { recursive: true });
    if (mime === 'model/gltf-binary') {
      if (
        body.length < 20 ||
        body.toString('ascii', 0, 4) !== 'glTF' ||
        body.readUInt32LE(4) !== 2 ||
        body.readUInt32LE(8) !== body.length
      ) {
        return reply.code(400).send({ error: 'Choose a valid self-contained GLB 2.0 file.' });
      }
      try {
        if (body.toString('ascii', 16, 20) !== 'JSON') {
          throw new Error('Missing JSON chunk');
        }
        const json = JSON.parse(body.toString('utf8', 20, 20 + body.readUInt32LE(12))) as {
          buffers?: { uri?: string }[];
          images?: { uri?: string }[];
        };
        if (
          [...(json.buffers ?? []), ...(json.images ?? [])].some(
            (item) => item.uri && !item.uri.startsWith('data:'),
          )
        ) {
          throw new Error('External dependencies');
        }
      } catch {
        return reply.code(400).send({
          error: 'GLB must contain its geometry and textures; export with embedded resources.',
        });
      }
      await writeFile(join(directory, `${hash}.glb`), body);
      return { url: `/api/media/${hash}.glb` };
    }
    try {
      const image = sharp(body, { limitInputPixels: 150_000_000, failOn: 'error' }).rotate();
      const metadata = await image.metadata();
      if (
        !['png', 'jpeg', 'webp'].includes(metadata.format ?? '') ||
        !metadata.width ||
        !metadata.height ||
        (metadata.pages ?? 1) > 1
      ) {
        return reply.code(400).send({ error: 'Choose a single PNG, JPEG, or WebP image.' });
      }
      const extension = metadata.format === 'jpeg' ? 'jpg' : metadata.format;
      const preview = await image
        .resize({ width: 4096, height: 4096, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 90 })
        .toBuffer({ resolveWithObject: true });
      await writeFile(join(directory, `${hash}.${extension}`), body);
      const previewHash = createHash('sha256').update(preview.data).digest('hex');
      await writeFile(join(directory, `${previewHash}.webp`), preview.data);
      return {
        url: `/api/media/${previewHash}.webp`,
        originalUrl: `/api/media/${hash}.${extension}`,
        width: preview.info.width,
        height: preview.info.height,
        originalWidth: metadata.width,
        originalHeight: metadata.height,
        tiles: {
          template: `/api/media/${hash}.tiles-${TILE_RECIPE}/{level}/{x}/{y}.webp`,
          width:
            metadata.orientation && metadata.orientation >= 5 ? metadata.height : metadata.width,
          height:
            metadata.orientation && metadata.orientation >= 5 ? metadata.width : metadata.height,
          tileSize: 512,
          maxLevel: Math.max(
            0,
            Math.ceil(Math.log2(Math.max(metadata.width, metadata.height) / 512)),
          ),
        },
      };
    } catch {
      return reply.code(400).send({
        error: 'Image could not be decoded. Maximum upload is 50 MiB and 150 megapixels.',
      });
    }
  });
  type TileParams = { hash: string; recipe?: string; level: string; x: string; y: string };
  const serveTile = async ({ hash, recipe, level, x, y }: TileParams, reply: FastifyReply) => {
    if (
      !/^[a-f0-9]{64}$/.test(hash) ||
      (recipe && !/^[a-f0-9]{64}$/.test(recipe)) ||
      ![level, x, y].every((n) => /^\d{1,4}$/.test(n))
    ) {
      return reply.code(404).header('Cache-Control', 'no-store').send({ error: 'Tile not found' });
    }
    const directory = join(dataDirectory(), 'media');
    const identity = tileCacheIdentity(hash, recipe ?? TILE_RECIPE);
    const target = join(directory, `${identity}.tile-${level}-${x}-${y}.webp`);
    try {
      let data: Buffer;
      try {
        data = await readFile(target);
      } catch {
        // Historical generated files keep their identity. Never encode new bytes
        // under an old recipe when that historical tile is unavailable.
        if (recipe && recipe !== TILE_RECIPE) {
          return reply.code(410).header('Cache-Control', 'no-store').send({
            error: 'Tile revision unavailable; upload the source again to generate current tiles.',
          });
        }
        data = await tileAdmission.run(async () => {
          let original: Buffer | undefined;
          for (const extension of ['png', 'jpg', 'webp']) {
            try {
              original = await readFile(join(directory, `${hash}.${extension}`));
              break;
            } catch {
              /* Try the supported source extensions. */
            }
          }
          if (!original) {
            throw new Error('Source not found');
          }
          if (createHash('sha256').update(original).digest('hex') !== hash) {
            throw new Error('Source content identity changed');
          }
          const pyramid = await imagePyramid(original);
          const encoded = await encodePaddedTile(
            original,
            pyramid,
            Number(level),
            Number(x),
            Number(y),
          );
          await writeFile(target, encoded);
          return encoded;
        });
      }
      return reply
        .type('image/webp')
        .header('Cache-Control', recipe ? 'public, max-age=31536000, immutable' : 'no-cache')
        .header('X-Content-Type-Options', 'nosniff')
        .send(data);
    } catch {
      return reply.code(404).header('Cache-Control', 'no-store').send({ error: 'Tile not found' });
    }
  };
  app.get<{ Params: TileParams }>(
    '/media/:hash.tiles-:recipe/:level/:x/:y.webp',
    (request, reply) => serveTile(request.params, reply),
  );
  app.get<{ Params: TileParams }>('/media/:hash.tiles/:level/:x/:y.webp', (request, reply) =>
    serveTile(request.params, reply),
  );
  app.get<{ Params: { filename: string } }>('/media/:filename', async (request, reply) => {
    const { filename } = request.params;
    if (!/^[a-f0-9]{64}(\.preview)?\.(png|jpg|webp|glb)$/.test(filename)) {
      return reply.code(404).header('Cache-Control', 'no-store').send({ error: 'Media not found' });
    }
    try {
      const data = await readFile(join(dataDirectory(), 'media', filename));
      const extension = filename.split('.').at(-1);
      return reply
        .header(
          'Cache-Control',
          filename.includes('.preview.') ? 'no-cache' : 'public, max-age=31536000, immutable',
        )
        .header('X-Content-Type-Options', 'nosniff')
        .type(
          extension === 'glb'
            ? 'model/gltf-binary'
            : extension === 'jpg'
              ? 'image/jpeg'
              : `image/${extension}`,
        )
        .send(data);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
      return reply.code(404).header('Cache-Control', 'no-store').send({ error: 'Media not found' });
    }
  });
}
