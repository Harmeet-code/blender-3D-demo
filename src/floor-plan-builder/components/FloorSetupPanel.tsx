import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { uploadBuilderMedia } from '@/features/layout-editor/api/media-client.ts';
import { polygonBounds } from '@/utils/geometry/polygon.ts';
import { activeFloor, unfinished, type StudioStore } from '../model/store.ts';
import { validateFloorImage } from '../model/floor-image.ts';

export interface FloorSetupDraftController {
  hasDraft: boolean;
  invalid: boolean;
  apply: () => boolean;
  focusInvalid: () => void;
  discard: () => void;
}

export function FloorSetupPanel({ store, onDraftController }: {
  store: StudioStore;
  onDraftController?: (controller: FloorSetupDraftController | null) => void;
}) {
  const state = store();
  const floor = state.pendingFloor ?? activeFloor(state);
  const applied = activeFloor(state);
  const bounds = polygonBounds(floor.boundary);
  const baseline = polygonBounds(applied.boundary);
  const committedWidth = bounds.maxX - bounds.minX;
  const committedDepth = bounds.maxZ - bounds.minZ;
  const [widthDraft, setWidthDraft] = useState(String(committedWidth));
  const [depthDraft, setDepthDraft] = useState(String(committedDepth));
  const nameRef = useRef<HTMLInputElement>(null);
  const widthRef = useRef<HTMLInputElement>(null);
  const depthRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const patchSource = (updates: Partial<typeof floor.source>) => state.patchFloor({ source: { ...floor.source, ...updates } });
  const width = Number(widthDraft);
  const depth = Number(depthDraft);
  const widthValid = widthDraft.trim() !== '' && Number.isFinite(width) && width >= 0.1;
  const depthValid = depthDraft.trim() !== '' && Number.isFinite(depth) && depth >= 0.1;
  const nameValid = floor.source.name.trim() !== '';
  const valid = nameValid && widthValid && depthValid;
  const hasDimensionDraft = widthDraft !== String(committedWidth) || depthDraft !== String(committedDepth);
  const focusInvalid = useCallback(() => {
    if (!nameValid) nameRef.current?.focus();
    else (widthValid ? depthRef.current : widthRef.current)?.focus();
  }, [nameValid, widthValid]);
  const applyDraft = useCallback(() => {
    if (!widthValid || !depthValid) {
      focusInvalid();
      return false;
    }
    if (hasDimensionDraft) {
      state.patchFloor({ boundary: [
        [baseline.minX, baseline.minZ],
        [baseline.minX + width, baseline.minZ],
        [baseline.minX + width, baseline.minZ + depth],
        [baseline.minX, baseline.minZ + depth],
      ] });
    }
    return store.getState().apply();
  }, [baseline.minX, baseline.minZ, depth, depthValid, focusInvalid, hasDimensionDraft, state, store, width, widthValid]);
  const controller = useMemo<FloorSetupDraftController>(() => ({
    hasDraft: hasDimensionDraft || !!state.pendingFloor,
    invalid: !valid,
    apply: applyDraft,
    focusInvalid,
    discard: () => {
      const committed = activeFloor(store.getState()).boundary;
      const committedBounds = polygonBounds(committed);
      setWidthDraft(String(committedBounds.maxX - committedBounds.minX));
      setDepthDraft(String(committedBounds.maxZ - committedBounds.minZ));
    },
  }), [applyDraft, focusInvalid, hasDimensionDraft, state.pendingFloor, store, valid]);
  useLayoutEffect(() => {
    onDraftController?.(controller);
    return () => onDraftController?.(null);
  }, [controller, onDraftController]);

  useEffect(() => {
    setWidthDraft(String(committedWidth));
    setDepthDraft(String(committedDepth));
  }, [applied.source.id, committedWidth, committedDepth]);
  return (
    <div className="fp-form">
      <Label className="fp-field"><span>Floor name</span><Input ref={nameRef} aria-label="Floor name" aria-invalid={!nameValid} aria-describedby="floor-name-error" value={floor.source.name} onChange={(event) => patchSource({ name: event.target.value })} /></Label>
      {!nameValid && <p id="floor-name-error" className="fp-error" role="alert">Enter a floor name.</p>}
      <div className="fp-two">
        <Label className="fp-field"><span>Width (m)</span><Input ref={widthRef} aria-label="Floor width (m)" aria-invalid={!widthValid} aria-describedby="floor-width-error" type="text" inputMode="decimal" value={widthDraft} onChange={(event) => setWidthDraft(event.target.value)} /></Label>
        <Label className="fp-field"><span>Depth (m)</span><Input ref={depthRef} aria-label="Floor depth (m)" aria-invalid={!depthValid} aria-describedby="floor-depth-error" type="text" inputMode="decimal" value={depthDraft} onChange={(event) => setDepthDraft(event.target.value)} /></Label>
      </div>
      {!widthValid && <p id="floor-width-error" className="fp-error" role="alert">Enter a positive width of at least 0.1 m.</p>}
      {!depthValid && <p id="floor-depth-error" className="fp-error" role="alert">Enter a positive depth of at least 0.1 m.</p>}
      <Label className="fp-field"><span>Floor image (optional)</span><Input aria-label="Floor image" type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading || unfinished(state)} onChange={(event) => {
        const file = event.target.files?.[0]; event.target.value = '';
        if (!file || unfinished(store.getState())) return;
        const validation = validateFloorImage(file);
        if (!validation.ok || file.size > 50 * 1024 * 1024) { state.notify(validation.ok ? 'Choose an image up to 50 MiB.' : validation.message); return; }
        const floorId = applied.source.id;
        const revision = state.revision;
        setUploading(true);
        void uploadBuilderMedia(file).then((uploaded) => {
          const latest = store.getState();
          const current = activeFloor(latest);
          if (current.source.id !== floorId || latest.revision !== revision || unfinished(latest)) throw new Error('The floor changed during upload. The existing image was preserved.');
          const imageWidth = uploaded.originalWidth ?? uploaded.width;
          const imageHeight = uploaded.originalHeight ?? uploaded.height;
          if (typeof imageWidth !== 'number' || typeof imageHeight !== 'number' || !(imageWidth > 0) || !(imageHeight > 0)) throw new Error('The image service did not return valid dimensions.');
          const accepted = latest.updateFloor({ source: { ...current.source, image: uploaded.url, authoring: { ...current.source.authoring, boundary: current.boundary, spawn: current.spawn, obstacles: current.source.authoring?.obstacles ?? [], instances: current.source.authoring?.instances ?? [], underlayOpacity: current.source.authoring?.underlayOpacity ?? 0.85, imageSize: [imageWidth, imageHeight], originalImage: uploaded.originalUrl ?? uploaded.url, tiles: undefined } } });
          if (!accepted) throw new Error(latest.message || 'The image could not be applied.');
        }).catch((error: unknown) => state.notify(error instanceof Error ? error.message : 'Image upload failed.')).finally(() => setUploading(false));
      }} /></Label>
      {uploading && <p role="status">Uploading image…</p>}
      {floor.source.image && <Button size="sm" variant="outline" disabled={uploading || unfinished(state)} onClick={() => {
        const current = activeFloor(store.getState());
        const old = current.source.authoring;
        const accepted = store.getState().updateFloor({ source: { ...current.source, image: '', authoring: { ...old, boundary: current.boundary, spawn: current.spawn, obstacles: old?.obstacles ?? [], instances: old?.instances ?? [], underlayOpacity: old?.underlayOpacity ?? 0.85, originalImage: undefined, imageSize: undefined, tiles: undefined } } });
        if (!accepted) state.notify(store.getState().message || 'The image could not be removed.');
      }}>Remove floor image</Button>}
      <p className="fp-muted">Floor image is fitted proportionally inside the floor. Resizing the floor updates its fit; legacy floor coordinates remain readable.</p>
      <p className="fp-muted">Floor setup changes stay in the shared draft until you use Save in the top-right corner.</p>
    </div>
  );
}
