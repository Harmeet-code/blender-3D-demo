import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { resolve, join } from 'node:path';
import {
  buildingLayoutSchema,
  type BuildingLayout,
} from '../../../features/building/model/building-schema.ts';

export function dataDirectory(): string {
  return resolve(process.env['VENUE_DATA_DIR'] ?? '.local/venue-data');
}
function layoutPath(eventId: string, folder: 'layouts' | 'drafts' = 'layouts') {
  return join(
    dataDirectory(),
    folder,
    `${createHash('sha256').update(eventId).digest('hex')}.json`,
  );
}
export async function readLocalLayout(eventId: string): Promise<BuildingLayout | null> {
  try {
    return buildingLayoutSchema.parse(JSON.parse(await readFile(layoutPath(eventId), 'utf8')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}
export async function writeLocalLayout(eventId: string, layout: BuildingLayout): Promise<void> {
  await writeDocument(eventId, layout, 'layouts');
}

export async function readLocalLayoutDraft(eventId: string): Promise<BuildingLayout | null> {
  try {
    return buildingLayoutSchema.parse(
      JSON.parse(await readFile(layoutPath(eventId, 'drafts'), 'utf8')),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function writeLocalLayoutDraft(
  eventId: string,
  layout: BuildingLayout,
): Promise<void> {
  await writeDocument(eventId, layout, 'drafts');
}

async function writeDocument(
  eventId: string,
  layout: BuildingLayout,
  folder: 'layouts' | 'drafts',
): Promise<void> {
  await mkdir(join(dataDirectory(), folder), { recursive: true });
  const target = layoutPath(eventId, folder),
    temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(layout), 'utf8');
    await rename(temporary, target);
  } catch (error) {
    // This unique temporary file belongs to this write; never remove the previous good document.
    await unlink(temporary).catch(() => {});
    throw error;
  }
}
