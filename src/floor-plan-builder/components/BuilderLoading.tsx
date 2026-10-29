import { useEffect, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';

export type BuilderLoadingPhase = 'floor' | 'assets' | 'navigation';
export interface BuilderLoadingState {
  loading: boolean;
  phase: BuilderLoadingPhase;
  /** 0–1 only when the current phase has measurable progress. */
  progress?: number;
  /** Set after the first complete frame at the requested high/default quality. */
  stableHighQualityFrame: boolean;
  error?: string | null;
}

export function builderLoadingVisible(state: BuilderLoadingState, delayElapsed: boolean): boolean {
  return delayElapsed && (state.loading || !state.stableHighQualityFrame || !!state.error);
}

export function useBuilderLoadingVisible(state: BuilderLoadingState, delayMs = 400): boolean {
  const [delayElapsed, setDelayElapsed] = useState(false);
  useEffect(() => {
    const pending = state.loading || !state.stableHighQualityFrame || !!state.error;
    if (!pending) {
      setDelayElapsed(false);
      return;
    }
    const timer = window.setTimeout(() => setDelayElapsed(true), Math.max(0, delayMs));
    return () => window.clearTimeout(timer);
  }, [state.loading, state.stableHighQualityFrame, state.error, delayMs]);
  return builderLoadingVisible(state, delayElapsed);
}

/** Small overlay contract for later canvas integration; contains no 3D scene or loader hooks. */
export function BuilderLoading({
  state,
  retry,
  delayMs = 400,
}: {
  state: BuilderLoadingState;
  retry?: () => void;
  delayMs?: number;
}) {
  const visible = useBuilderLoadingVisible(state, delayMs);
  if (!visible) {
    return null;
  }
  const titles: Record<BuilderLoadingPhase, string> = {
    floor: 'Preparing floor',
    assets: 'Preparing objects',
    navigation: 'Preparing routes',
  };
  const progress =
    state.progress === undefined ? undefined : Math.max(0, Math.min(1, state.progress));
  return (
    <div
      role={state.error ? 'alert' : 'status'}
      aria-live="polite"
      className="absolute inset-0 z-40 grid place-items-center bg-background/80 backdrop-blur-sm"
    >
      <div className="grid gap-3 rounded-xl border bg-background/95 p-5 text-center shadow-lg">
        <svg viewBox="0 0 120 70" width="120" height="70" aria-hidden="true">
          <path
            d="M8 8h44v22H8zM52 8h60v22H52zM8 30h26v32H8zM34 30h46v32H34zM80 30h32v32H80z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            opacity=".45"
          />
          <path
            d="M34 30h18M80 44H63"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="4 3"
          />
          <circle cx="62" cy="44" r="5" fill="currentColor" />
        </svg>
        <p className="font-medium">
          {state.error ? 'Could not prepare this view' : titles[state.phase]}
        </p>
        {state.error ? (
          <>
            <p className="max-w-sm text-sm text-muted-foreground">{state.error}</p>
            {retry && (
              <button type="button" className="rounded-md border px-3 py-1.5" onClick={retry}>
                Try again
              </button>
            )}
          </>
        ) : progress === undefined ? (
          <progress aria-label={titles[state.phase]} className="w-full" />
        ) : (
          <progress aria-label={titles[state.phase]} className="w-full" max={1} value={progress} />
        )}
      </div>
    </div>
  );
}

type VenueMotion = { kind: 'visitor' | 'booth'; id: string; nonce: number } | null;

const venueBooths = [
  { id: 'garden', x: 42, y: 62, color: '#77a890', name: 'Garden' },
  { id: 'design', x: 148, y: 48, color: '#e6a568', name: 'Design' },
  { id: 'coffee', x: 258, y: 66, color: '#8c9fc8', name: 'Coffee' },
  { id: 'studio', x: 368, y: 49, color: '#d88c8d', name: 'Studio' },
  { id: 'market', x: 93, y: 162, color: '#deb96d', name: 'Market' },
  { id: 'books', x: 317, y: 164, color: '#83aeb4', name: 'Books' },
] as const;

const venueVisitors = [
  { id: 'visitor-1', x: 119, y: 136, color: '#546b83', route: 'fp-mini-visitor-route-a' },
  { id: 'visitor-2', x: 230, y: 176, color: '#b66d54', route: 'fp-mini-visitor-route-b' },
  { id: 'visitor-3', x: 400, y: 136, color: '#657e63', route: 'fp-mini-visitor-route-c' },
] as const;

function activateOnKeyboard(event: KeyboardEvent<SVGGElement>, activate: () => void) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    activate();
  }
}

/**
 * Prepared miniature venue loader. It stays separate from BuilderLoading until
 * the authoring milestone is accepted; all motion is CSS/SVG and uses no Canvas,
 * external asset, fake progress, or timer that delays the ready scene.
 */
export function MiniatureVenueLoading({
  state,
  retry,
  delayMs = 400,
}: {
  state: BuilderLoadingState;
  retry?: () => void;
  delayMs?: number;
}) {
  const visible = useBuilderLoadingVisible(state, delayMs);
  const [mounted, setMounted] = useState(false);
  const [motion, setMotion] = useState<VenueMotion>(null);
  useEffect(() => {
    if (visible) {
      setMounted(true);
      return;
    }
    if (!mounted) {
      return;
    }
    // Let the ready floor appear immediately beneath a short, non-blocking fade.
    const timer = window.setTimeout(() => setMounted(false), 180);
    return () => window.clearTimeout(timer);
  }, [visible, mounted]);
  if (!mounted) {
    return null;
  }

  const title: Record<BuilderLoadingPhase, string> = {
    floor: 'Making room for your ideas',
    assets: 'Setting up the little details',
    navigation: 'Opening the doors',
  };
  const progress =
    state.progress === undefined ? undefined : Math.max(0, Math.min(1, state.progress));
  const animate = (kind: 'visitor' | 'booth', id: string) => {
    setMotion((current) => ({ kind, id, nonce: (current?.nonce ?? 0) + 1 }));
  };

  return (
    <div
      role={state.error ? 'alert' : 'status'}
      aria-live="polite"
      className="fp-mini-venue-overlay absolute inset-0 z-40 grid place-items-center overflow-hidden"
      data-visible={visible}
      style={{
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
        transition: 'opacity 180ms ease-out',
      }}
    >
      <style>{`
        .fp-mini-venue-overlay { background: radial-gradient(ellipse at 50% 28%, #fff8e9 0%, #e8e5d9 58%, #d8e2df 100%); color: #23342f; }
        .fp-mini-venue-card { width: min(620px, calc(100vw - 32px)); padding: clamp(16px, 3vw, 28px); border: 1px solid rgba(46,68,59,.16); border-radius: 24px; background: rgba(255,255,255,.79); box-shadow: 0 24px 80px rgba(36,57,49,.16); backdrop-filter: blur(12px); }
        .fp-mini-venue-art { display: block; width: 100%; height: auto; overflow: visible; }
        .fp-mini-venue-booth { cursor: pointer; transform-box: fill-box; transform-origin: center bottom; animation: fp-mini-pop .52s cubic-bezier(.2,.9,.25,1.2) both; animation-delay: var(--arrival); }
        .fp-mini-venue-booth:hover { filter: brightness(1.04); }
        .fp-mini-venue-booth:focus-visible, .fp-mini-venue-visitor:focus-visible { outline: 3px solid #315d4d; outline-offset: 5px; }
        .fp-mini-venue-booth.is-bouncing { animation: fp-mini-bounce .58s cubic-bezier(.2,.8,.2,1) both; }
        .fp-mini-venue-visitor { cursor: pointer; transform-box: fill-box; transform-origin: center; animation: var(--route) 7s ease-in-out infinite alternate; }
        .fp-mini-venue-visitor.is-waving .fp-mini-arm { animation: fp-mini-wave .42s ease-in-out 4 alternate; transform-box: fill-box; transform-origin: left center; }
        .fp-mini-venue-progress { height: 4px; border: 0; border-radius: 999px; background: rgba(42,79,63,.14); color: #3f8068; }
        .fp-mini-venue-progress::-webkit-progress-bar { border-radius: 999px; background: rgba(42,79,63,.14); }
        .fp-mini-venue-progress::-webkit-progress-value { border-radius: 999px; background: #3f8068; }
        .fp-mini-venue-progress::-moz-progress-bar { border-radius: 999px; background: #3f8068; }
        @keyframes fp-mini-pop { from { opacity: .35; transform: translateY(10px) scale(.88); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes fp-mini-bounce { 0%,100% { transform: translateY(0) scale(1); } 36% { transform: translateY(-12px) scale(1.035,.96); } 66% { transform: translateY(0) scale(.98,1.03); } }
        @keyframes fp-mini-wave { from { transform: rotate(-15deg); } to { transform: rotate(48deg); } }
        @keyframes fp-mini-visitor-route-a { from { transform: translate(0,0); } to { transform: translate(17px,-4px); } }
        @keyframes fp-mini-visitor-route-b { from { transform: translate(0,0); } to { transform: translate(-14px,-7px); } }
        @keyframes fp-mini-visitor-route-c { from { transform: translate(0,0); } to { transform: translate(11px,5px); } }
        @media (prefers-reduced-motion: reduce) { .fp-mini-venue-booth, .fp-mini-venue-visitor, .fp-mini-venue-visitor.is-waving .fp-mini-arm { animation-duration: .01ms !important; animation-iteration-count: 1 !important; } }
      `}</style>
      <div className="fp-mini-venue-card">
        <svg
          className="fp-mini-venue-art"
          viewBox="0 0 520 252"
          role="group"
          aria-label="A tiny exhibition venue with booths and visitors wandering between them"
        >
          <defs>
            <linearGradient id="fp-mini-floor" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#f5f0e4" />
              <stop offset="1" stopColor="#e8eee6" />
            </linearGradient>
            <filter id="fp-mini-shadow" x="-30%" y="-30%" width="160%" height="180%">
              <feDropShadow
                dx="0"
                dy="5"
                stdDeviation="4"
                floodColor="#40574a"
                floodOpacity=".16"
              />
            </filter>
          </defs>
          <rect x="6" y="7" width="508" height="238" rx="24" fill="url(#fp-mini-floor)" />
          <path
            d="M18 136h484M252 17v218"
            fill="none"
            stroke="#c9d8ce"
            strokeWidth="2"
            strokeDasharray="4 8"
          />
          <path
            d="M18 150c64-24 119 18 181 0s109-21 170 0 90 9 133-3"
            fill="none"
            stroke="#fffdf7"
            strokeWidth="20"
            strokeLinecap="round"
          />
          <g fill="#d3dfd3" opacity=".7">
            <circle cx="26" cy="34" r="4" />
            <circle cx="494" cy="216" r="5" />
            <circle cx="278" cy="224" r="3" />
            <circle cx="487" cy="30" r="3" />
          </g>
          {venueBooths.map((booth, index) => {
            const bouncing = motion?.kind === 'booth' && motion.id === booth.id;
            return (
              <g
                key={bouncing ? `${booth.id}-${motion.nonce}` : booth.id}
                role="button"
                tabIndex={0}
                aria-label={`Make the ${booth.name} booth bounce`}
                className={`fp-mini-venue-booth${bouncing ? ' is-bouncing' : ''}`}
                style={{ '--arrival': `${index * 85}ms` } as CSSProperties}
                onClick={() => animate('booth', booth.id)}
                onKeyDown={(event) => activateOnKeyboard(event, () => animate('booth', booth.id))}
              >
                <ellipse
                  cx={booth.x + 43}
                  cy={booth.y + 43}
                  rx="48"
                  ry="8"
                  fill="#9aab9d"
                  opacity=".35"
                />
                <path
                  d={`M${booth.x} ${booth.y + 12}l13-10h73l-13 10z`}
                  fill={booth.color}
                  opacity=".72"
                />
                <rect
                  x={booth.x}
                  y={booth.y + 12}
                  width="73"
                  height="30"
                  rx="5"
                  fill={booth.color}
                  filter="url(#fp-mini-shadow)"
                />
                <path
                  d={`M${booth.x + 9} ${booth.y + 20}h19v14H${booth.x + 9}z`}
                  fill="#fff9e9"
                  opacity=".8"
                />
                <path
                  d={`M${booth.x + 34} ${booth.y + 20}h27v3h-27zm0 7h20v3h-20z`}
                  fill="#fff9e9"
                  opacity=".76"
                />
                <text
                  x={booth.x + 36}
                  y={booth.y + 55}
                  textAnchor="middle"
                  fill="#40574a"
                  fontSize="9"
                  fontWeight="700"
                >
                  {booth.name}
                </text>
              </g>
            );
          })}
          {venueVisitors.map((visitor) => {
            const waving = motion?.kind === 'visitor' && motion.id === visitor.id;
            return (
              <g
                key={waving ? `${visitor.id}-${motion.nonce}` : visitor.id}
                role="button"
                tabIndex={0}
                aria-label="Ask this visitor to wave"
                className={`fp-mini-venue-visitor ${visitor.route}${waving ? ' is-waving' : ''}`}
                transform={`translate(${visitor.x} ${visitor.y})`}
                onClick={() => animate('visitor', visitor.id)}
                onKeyDown={(event) =>
                  activateOnKeyboard(event, () => animate('visitor', visitor.id))
                }
              >
                <ellipse cx="0" cy="19" rx="8" ry="3" fill="#88998c" opacity=".45" />
                <circle cx="0" cy="-2" r="5" fill="#d99770" />
                <path
                  d="M0 4v10m0-6-6 5m6-5 6 4m-6 2-4 7m4-7 5 7"
                  fill="none"
                  stroke={visitor.color}
                  strokeWidth="3.4"
                  strokeLinecap="round"
                />
                <path
                  className="fp-mini-arm"
                  d="M0 8l-7 2"
                  fill="none"
                  stroke={visitor.color}
                  strokeWidth="3.4"
                  strokeLinecap="round"
                />
              </g>
            );
          })}
          <text x="260" y="232" textAnchor="middle" fill="#648074" fontSize="9" letterSpacing="1.6">
            A LITTLE VENUE TAKING SHAPE
          </text>
        </svg>
        <div className="mt-2 grid gap-2 text-center">
          {state.error ? (
            <>
              <p className="text-base font-semibold">Could not prepare this view</p>
              <p className="mx-auto max-w-md text-sm text-muted-foreground">{state.error}</p>
              {retry && (
                <button
                  type="button"
                  className="mx-auto rounded-lg border px-4 py-2 text-sm font-medium"
                  onClick={retry}
                >
                  Try again
                </button>
              )}
            </>
          ) : (
            <>
              <p className="text-base font-semibold">{title[state.phase]}</p>
              <p className="text-sm text-muted-foreground">
                Click a booth for a tiny bounce, or ask a visitor to wave.
              </p>
              {progress !== undefined && (
                <progress
                  aria-label={title[state.phase]}
                  className="fp-mini-venue-progress w-full"
                  max={1}
                  value={progress}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
