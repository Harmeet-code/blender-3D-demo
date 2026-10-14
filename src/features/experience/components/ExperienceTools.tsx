import { useEffect, useRef, useState } from 'react';
import { Share2Icon, DownloadIcon, MonitorIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useActiveLayout } from '@/features/building/model/active-layout.ts';
import { useWorldStore } from '@/features/viewer/model/viewer-store.ts';
import { useConfiguredEventId, useAcceptedEventId } from '@/app/config/constants.ts';
import { useRoutePlanner } from '@/features/navigation/model/route-planner.ts';
import {
  getNavigationDestinations,
  currentAvatarDestination,
} from '@/features/navigation/model/navigation-destinations.ts';
import { avatarRuntime } from '@/features/viewer/model/avatar-runtime.ts';
import {
  clearFloorImages,
  registerFloorImageCache,
  saveFloorImages,
} from '../model/offline-images.ts';
import { useLayoutStore } from '@/features/building/model/layout-store.ts';

export type Presentation = 'normal' | 'embed' | 'kiosk';
export function presentationFromUrl(): Presentation {
  const value = new URLSearchParams(window.location.search).get('presentation');
  return value === 'kiosk' || value === 'embed' ? value : 'normal';
}
export function ExperienceTools({ presentation }: { presentation: Presentation }) {
  const layout = useActiveLayout();
  const eventId = useConfiguredEventId();
  const acceptedEventId = useAcceptedEventId();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState('');
  const [attract, setAttract] = useState(false);
  const plan = useRoutePlanner((state) => state.plan);
  const floorId = useWorldStore((state) => state.currentFloorId);
  const selectedId = useWorldStore((state) => state.selectedBoothId);
  const handledLink = useRef<string>('');
  const generation = useRef(0);
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('event', eventId);
  url.searchParams.set('floor', floorId);
  if (plan && plan.layout === layout) {
    url.searchParams.set('to', plan.to.id);
    if (plan.to.kind === 'point') {
      url.searchParams.set('toPoint', JSON.stringify([plan.to.position[0], plan.to.position[2]]));
      url.searchParams.set('toFloor', plan.to.floorId);
    }
    if (plan.from.kind !== 'avatar') {
      url.searchParams.set('from', plan.from.id);
    }
    if (plan.from.kind === 'point') {
      url.searchParams.set(
        'fromPoint',
        JSON.stringify([plan.from.position[0], plan.from.position[2]]),
      );
      url.searchParams.set('fromFloor', plan.from.floorId);
    }
    if (plan.stepFree) {
      url.searchParams.set('stepFree', '1');
    }
  } else if (selectedId) {
    url.searchParams.set('to', selectedId);
  }
  url.hash = '/world';
  const shareUrl = url.href;
  const embed = new URL(shareUrl);
  embed.searchParams.set('presentation', 'embed');
  const kiosk = new URL(shareUrl);
  kiosk.searchParams.set('presentation', 'kiosk');
  useEffect(() => {
    const current = ++generation.current;
    if (!open) {
      return;
    }
    setQr('');
    void import('qrcode')
      .then((module) =>
        module.default.toDataURL(shareUrl, { width: 240, margin: 2, errorCorrectionLevel: 'M' }),
      )
      .then((image) => {
        if (current === generation.current) {
          setQr(image);
        }
      })
      .catch(() => {
        if (current === generation.current) {
          setMessage('QR encoding unavailable. Use the share link.');
        }
      });
    return () => {
      generation.current++;
    };
  }, [shareUrl, open]);
  useEffect(() => {
    void registerFloorImageCache().catch(() => {});
  }, []);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const targetId = params.get('to');
    // Wait for App to accept a published layout; never resolve links against demo/old event geometry.
    if (acceptedEventId !== eventId) {
      return;
    }
    const key = `${eventId}:${layout.buildingId}:${params}`;
    if (handledLink.current === key) {
      return;
    }
    handledLink.current = key;
    const world = useWorldStore.getState();
    const requestedFloor = params.get('floor');
    if (requestedFloor && layout.floors.some((floor) => floor.id === requestedFloor)) {
      world.setCurrentFloor(requestedFloor);
    }
    if (!targetId) {
      return;
    }
    const destinations = getNavigationDestinations(layout);
    const fromId =
      params.get('from') ??
      currentAvatarDestination(layout, avatarRuntime.snapshot(world.localAvatar)).id;
    const point = (slot: 'from' | 'to') => {
      try {
        const coords = JSON.parse(params.get(`${slot}Point`) ?? 'null');
        const selectedFloor = params.get(`${slot}Floor`);
        if (
          !Array.isArray(coords) ||
          coords.length !== 2 ||
          !coords.every((n) => typeof n === 'number' && Number.isFinite(n)) ||
          !selectedFloor
        ) {
          return undefined;
        }
        const floor = layout.floors.find((candidate) => candidate.id === selectedFloor);
        return floor
          ? {
              id: params.get(slot)!,
              floorId: floor.id,
              position: [coords[0], floor.heightOffset + 1.2, coords[1]] as [
                number,
                number,
                number,
              ],
              label: 'Shared floor point',
              category: 'point',
              kind: 'point' as const,
            }
          : undefined;
      } catch {
        return undefined;
      }
    };
    const fromPoint = point('from');
    const toPoint = point('to');
    if (!toPoint && !destinations.some((destination) => destination.id === targetId)) {
      setMessage('This shared destination was removed or belongs to a different layout.');
      return;
    }
    void useRoutePlanner.getState().preview(layout, fromId, targetId, {
      stepFree: params.get('stepFree') === '1',
      fromPoint,
      toPoint,
      ...(!params.has('from')
        ? { currentAvatar: avatarRuntime.snapshot(useWorldStore.getState().localAvatar) }
        : {}),
    });
    setMessage('Loading the shared route. Open Directions to review the result.');
  }, [eventId, layout, acceptedEventId]);
  useEffect(() => {
    if (presentation !== 'kiosk') {
      return;
    }
    let lastInput = performance.now();
    let lastFloor = 0;
    const active = () => {
      lastInput = performance.now();
      setAttract(false);
    };
    for (const event of ['pointerdown', 'keydown', 'wheel'] as const) {
      window.addEventListener(event, active, { passive: true });
    }
    const timer = window.setInterval(() => {
      const now = performance.now();
      if (now - lastInput < 60_000 || document.hidden) {
        return;
      }
      setAttract(true);
      const state = useWorldStore.getState();
      if (now - lastFloor >= 15_000) {
        lastFloor = now;
        state.setWalkMode(false);
        state.cancelAutopilot();
        state.selectBooth(null);
        const index = layout.floors.findIndex((floor) => floor.id === state.currentFloorId);
        const next = layout.floors[(index + 1) % layout.floors.length];
        if (next) {
          state.setCurrentFloor(next.id);
        }
      }
    }, 1000);
    return () => {
      window.clearInterval(timer);
      for (const event of ['pointerdown', 'keydown', 'wheel'] as const) {
        window.removeEventListener(event, active);
      }
    };
  }, [presentation, layout]);
  async function save() {
    setBusy(true);
    setMessage('Saving current floor images…');
    try {
      const result = await saveFloorImages(useLayoutStore.getState().source);
      setMessage(
        `${result.saved}/${result.requested} images saved.${result.unsupported ? ' Unversioned or external images cannot be saved safely.' : ''} Zoomed tiles cache as viewed. Offline image storage does not install the full application.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {attract && (
        <div className="pointer-events-none absolute inset-x-0 top-20 z-20 text-center">
          <span className="rounded-full bg-background/95 px-6 py-4 shadow-lg">
            Explore the venue · touch to begin
          </span>
        </div>
      )}
      <div className="pointer-events-none absolute bottom-16 left-3 z-30 flex sm:inset-x-0 sm:bottom-3 sm:justify-center">
        <div className="pointer-events-auto">
          <Button
            size="sm"
            variant="outline"
            className="bg-background/95 shadow-md"
            onClick={() => setOpen(!open)}
          >
            <Share2Icon className="size-4" /> Share & visit tools
          </Button>
        </div>
      </div>
      {open && (
        <section
          aria-label="Share and offline visit tools"
          className="absolute right-3 bottom-14 z-40 max-h-[75vh] w-80 max-w-[calc(100%-1.5rem)] overflow-y-auto rounded-xl border bg-background/95 p-4 shadow-xl backdrop-blur"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Take the venue with you</h2>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Close visit tools"
              onClick={() => setOpen(false)}
            >
              <XIcon />
            </Button>
          </div>
          <label className="text-xs" htmlFor="route-share-url">
            Route or entrance link
          </label>
          <Input
            id="route-share-url"
            readOnly
            value={shareUrl}
            onFocus={(event) => event.currentTarget.select()}
          />
          {qr && (
            <img
              className="mx-auto my-3 rounded-lg"
              src={qr}
              width={200}
              height={200}
              alt="QR code for this route or entrance"
            />
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() =>
                void navigator.clipboard
                  .writeText(shareUrl)
                  .then(() => setMessage('Link copied.'))
                  .catch(() => setMessage('Select and copy the link above.'))
              }
            >
              Copy link
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                void navigator.clipboard
                  .writeText(
                    `<iframe src="${embed.href.replaceAll('&', '&amp;')}" title="Venue wayfinding" style="width:100%;height:600px;border:0" loading="lazy"></iframe>`,
                  )
                  .then(() => setMessage('Embed HTML copied.'))
                  .catch(() =>
                    setMessage(
                      'Clipboard is unavailable. Use the share URL with presentation=embed.',
                    ),
                  )
              }
            >
              Copy embed
            </Button>
          </div>
          <a
            className="my-3 flex items-center gap-2 text-sm underline"
            href={presentation === 'normal' ? kiosk.href : shareUrl}
          >
            <MonitorIcon className="size-4" />
            {presentation === 'normal' ? 'Open touch kiosk' : 'Open full application'}
          </a>
          <div className="border-t pt-3">
            <Button disabled={busy} size="sm" variant="outline" onClick={() => void save()}>
              <DownloadIcon className="size-4" />
              {busy ? 'Saving…' : 'Save floor images offline'}
            </Button>
            <Button
              disabled={busy}
              size="sm"
              variant="ghost"
              onClick={() =>
                void clearFloorImages()
                  .then(() => setMessage('Offline images cleared.'))
                  .catch((error) => setMessage(String(error)))
              }
            >
              Remove offline images
            </Button>
          </div>
          {message && (
            <p className="mt-3 text-xs text-muted-foreground" role="status">
              {message}
            </p>
          )}
        </section>
      )}
    </>
  );
}
