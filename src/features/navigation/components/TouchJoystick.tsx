import { useEffect, useRef } from 'react';
import { manualLocomotion } from '@/features/viewer/model/manual-locomotion.ts';
import { useWorldStore } from '@/features/viewer/model/viewer-store.ts';

/** Pointer capture owns one gesture. Touch values feed the existing fixed-step Rapier controller. */
export function TouchJoystick() {
  const walking = useWorldStore((state) => state.walkMode);
  const thumb = useRef<HTMLSpanElement>(null);
  const pointer = useRef<number | null>(null);
  const release = () => {
    pointer.current = null;
    manualLocomotion.setTouch(0, 0);
    if (thumb.current) {
      thumb.current.style.transform = 'translate(0px, 0px)';
    }
  };
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) {
        release();
      }
    };
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      release();
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, []);
  useEffect(() => {
    if (!walking) {
      release();
    }
  }, [walking]);
  if (!walking) {
    return null;
  }
  return (
    <button
      type="button"
      aria-label="Touch joystick. Drag to walk; keyboard users can use WASD or arrow keys in the scene."
      className="absolute bottom-24 left-5 z-20 hidden size-28 touch-none items-center justify-center rounded-full border border-blue-400/40 bg-background/80 shadow-xl backdrop-blur-md max-sm:flex [@media(pointer:coarse)]:flex"
      onPointerDown={(event) => {
        if (pointer.current !== null || event.button !== 0) {
          return;
        }
        event.preventDefault();
        useWorldStore.getState().cancelAutopilot();
        pointer.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (pointer.current !== event.pointerId) {
          return;
        }
        const bounds = event.currentTarget.getBoundingClientRect();
        let x = (event.clientX - bounds.left - bounds.width / 2) / 38;
        let z = (bounds.top + bounds.height / 2 - event.clientY) / 38;
        const magnitude = Math.max(1, Math.hypot(x, z));
        x /= magnitude;
        z /= magnitude;
        if (Math.hypot(x, z) < 0.08) {
          x = z = 0;
        }
        manualLocomotion.setTouch(x, z);
        if (thumb.current) {
          thumb.current.style.transform = `translate(${x * 38}px, ${-z * 38}px)`;
        }
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
    >
      <span className="pointer-events-none absolute top-2 text-[9px] text-muted-foreground">
        WALK
      </span>
      <span
        ref={thumb}
        className="pointer-events-none size-10 rounded-full border border-blue-300/60 bg-blue-500/60 shadow-md"
      />
    </button>
  );
}
