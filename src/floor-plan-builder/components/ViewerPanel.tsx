import { useEffect, useState, useRef, type Dispatch, type SetStateAction } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { activeFloor, unfinished, type StudioStore } from '../model/store.ts';
import { isBooth } from '../model/types.ts';
import { formatPrice, statusColors, type StudioView } from '../model/view.ts';

export type SetView = Dispatch<SetStateAction<StudioView>>;

export function BoothDirectory({ store }: { store: StudioStore }) {
  const state = store(),
    floor = activeFloor(state);
  const [query, setQuery] = useState('');
  const booths = floor.objects.filter(
    (object) => isBooth(object) && object.id !== state.pendingRemoval?.id,
  );
  const visible = booths.filter((booth) =>
    `${booth.boothNumber} ${booth.name} ${booth.company} ${booth.status}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  return (
    <details className="fp-booth-directory" open>
      <summary>
        Booths <span>{booths.length}</span>
      </summary>
      <Input
        aria-label="Search floor booths"
        placeholder="Find a booth…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="fp-directory" aria-label="Floor booth directory">
        {visible.map((booth) => (
          <button
            key={booth.id}
            className={state.selection?.id === booth.id ? 'active' : ''}
            aria-pressed={state.selection?.id === booth.id}
            onClick={() => state.select({ kind: 'object', id: booth.id })}
          >
            <span className="fp-status-dot" style={{ background: statusColors[booth.status] }} />
            <span>
              <strong>
                {booth.boothNumber || '—'} · {booth.name || 'Unnamed booth'}
              </strong>
              <small>
                {booth.status} · {formatPrice(booth.price)}
              </small>
            </span>
          </button>
        ))}
        {!visible.length && (
          <p className="fp-muted">
            {booths.length ? 'No matching booths.' : 'No booths on this floor yet.'}
          </p>
        )}
      </div>
    </details>
  );
}

export function BoothDetails({ store }: { store: StudioStore }) {
  const state = store(),
    floor = activeFloor(state);
  const booth = floor.objects.find(
    (object) =>
      state.selection?.kind === 'object' &&
      object.id === state.selection.id &&
      isBooth(object) &&
      object.id !== state.pendingRemoval?.id,
  );
  if (!booth) {
    return (
      <p className="fp-muted">
        Select a booth in the scene or Floors directory to see its details.
      </p>
    );
  }
  const rows: [string, string][] = [
    ['Booth number', booth.boothNumber],
    ['Name', booth.name],
    ['Size label', booth.boothSize],
    [
      'Size',
      `${(booth.dimensions[0] * booth.scale[0]).toFixed(2)} × ${(booth.dimensions[2] * booth.scale[2]).toFixed(2)} m`,
    ],
    ['Price', formatPrice(booth.price)],
    ['Status', booth.status],
    ['Company', booth.company],
    ['Contact name', booth.contactName],
    ['Email', booth.contactEmail],
    ['Phone', booth.contactPhone],
    ['Type', booth.boothType],
    ['Height', `${(booth.dimensions[1] * booth.scale[1]).toFixed(2)} m`],
    ['Rotation', `${((booth.yawRadians * 180) / Math.PI).toFixed(1)}°`],
    ['Gate', booth.gate],
    ['Tags', booth.tags],
    ['YouTube', booth.youtubeLink],
  ];
  return (
    <div className="fp-form">
      <dl className="fp-booth-details">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>
              {label === 'Status' && (
                <span
                  className="fp-status-dot"
                  style={{ background: statusColors[booth.status] }}
                />
              )}
              {value || '—'}
            </dd>
          </div>
        ))}
      </dl>
      <Button variant="outline" size="sm" onClick={state.focus}>
        Focus booth
      </Button>
    </div>
  );
}

export function ViewOptions({ view, setView }: { view: StudioView; setView: SetView }) {
  return (
    <div className="fp-form">
      <div className="fp-row" aria-label="Booth display mode">
        {(['surface', 'availability', 'heat'] as const).map((display) => (
          <Button
            key={display}
            size="sm"
            variant={view.display === display ? 'secondary' : 'outline'}
            aria-pressed={view.display === display}
            onClick={() => setView((current) => ({ ...current, display }))}
          >
            {display === 'surface'
              ? 'Surface'
              : display === 'availability'
                ? 'Availability'
                : 'Heat'}
          </Button>
        ))}
      </div>
      {view.display === 'availability' && (
        <div className="fp-view-legend">
          {Object.entries(statusColors).map(([status, color]) => (
            <span key={status}>
              <i style={{ background: color }} />
              {status}
            </span>
          ))}
        </div>
      )}
      {view.display === 'heat' && (
        <div className="fp-heat-legend">
          <span>Lower price</span>
          <i />
          <span>Higher price</span>
        </div>
      )}
      <Button
        variant="outline"
        size="sm"
        aria-pressed={view.night}
        onClick={() => setView((current) => ({ ...current, night: !current.night }))}
      >
        {view.night ? 'Night lighting on' : 'Night lighting off'}
      </Button>
    </div>
  );
}

export function CameraHud({ view, setView }: { view: StudioView; setView: SetView }) {
  return (
    <div className="fp-camera-hud" aria-label="Camera controls">
      {(['iso', 'top'] as const).map((camera) => (
        <Button
          key={camera}
          variant="outline"
          size="sm"
          aria-pressed={view.camera === camera}
          onClick={() =>
            setView((current) => ({
              ...current,
              camera,
              cameraRevision: current.cameraRevision + 1,
            }))
          }
        >
          {camera === 'iso' ? 'Isometric' : 'Top'}
        </Button>
      ))}
      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          setView((current) => ({
            ...current,
            camera: 'iso',
            cameraRevision: current.cameraRevision + 1,
          }))
        }
      >
        Reset camera
      </Button>
      <Button
        variant="outline"
        size="sm"
        aria-pressed={view.orbitLocked}
        onClick={() => setView((current) => ({ ...current, orbitLocked: !current.orbitLocked }))}
      >
        {view.orbitLocked ? 'Unlock orbit' : 'Lock orbit'}
      </Button>
      <Button
        variant="outline"
        size="sm"
        aria-pressed={view.touring}
        data-tour-control
        onClick={() => setView((current) => ({ ...current, touring: !current.touring }))}
      >
        {view.touring ? 'Stop tour' : 'Auto-tour'}
      </Button>
    </div>
  );
}

export function useBoothTour(store: StudioStore, view: StudioView, setView: SetView) {
  const state = store();
  const session = useRef<{ floorId: string; revision: number } | null>(null);
  useEffect(() => {
    if (!view.touring) {
      session.current = null;
      return;
    }
    const stop = () => setView((current) => ({ ...current, touring: false }));
    if (
      session.current &&
      (session.current.floorId !== state.floorId ||
        session.current.revision !== state.revision ||
        state.tool !== 'select')
    ) {
      stop();
      return;
    }
    if (unfinished(store.getState())) {
      store.getState().notify('Apply or discard the unfinished edit before starting the tour.');
      stop();
      return;
    }
    if (store.getState().tool !== 'select') {
      store.getState().setTool('select');
    }
    session.current = { floorId: state.floorId, revision: state.revision };
    let index = -1;
    const step = () => {
      const current = store.getState(),
        booths = activeFloor(current).objects.filter(isBooth);
      if (document.hidden || !booths.length || unfinished(current) || current.tool !== 'select') {
        stop();
        return;
      }
      index = (index + 1) % booths.length;
      current.select({ kind: 'object', id: booths[index]!.id });
    };
    step();
    const timer = window.setInterval(step, 1200);
    document.addEventListener('visibilitychange', stop);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', stop);
    };
  }, [view.touring, state.floorId, state.revision, state.tool, store, setView]);
  useEffect(() => {
    setView((current) => (current.touring ? { ...current, touring: false } : current));
  }, [state.floorId, state.revision, setView]);
}
