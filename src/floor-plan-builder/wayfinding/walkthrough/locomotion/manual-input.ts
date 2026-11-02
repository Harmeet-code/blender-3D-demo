import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';

export interface ManualInputState {
  forward: number;
  strafe: number;
  sprint: boolean;
  lookX: number;
  lookY: number;
  dragging: boolean;
}

const emptyInput = (): ManualInputState => ({
  forward: 0,
  strafe: 0,
  sprint: false,
  lookX: 0,
  lookY: 0,
  dragging: false,
});

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (
    target.isContentEditable ||
    /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName)
  );
}

/** Collects transient walk input; consumers read the ref from the existing R3F frame loop. */
export function useManualInput(
  active: boolean,
  movementEnabled: boolean,
  onToggleView: () => void,
  onStop: () => void,
) {
  const input = useRef<ManualInputState>(emptyInput());
  const canvas = useThree((state) => state.gl.domElement);
  const invalidate = useThree((state) => state.invalidate);
  const callbacks = useRef({ onToggleView, onStop });
  callbacks.current = { onToggleView, onStop };

  useEffect(() => {
    const keys = new Set<string>();
    let pointerId: number | null = null;
    let x = 0;
    let y = 0;
    const clear = () => {
      keys.clear();
      input.current = emptyInput();
      pointerId = null;
    };
    const updateKeys = () => {
      const held = (...codes: string[]) => codes.some((code) => keys.has(code));
      input.current.forward = Number(held('KeyW', 'ArrowUp')) - Number(held('KeyS', 'ArrowDown'));
      input.current.strafe = Number(held('KeyD', 'ArrowRight')) - Number(held('KeyA', 'ArrowLeft'));
      input.current.sprint = held('ShiftLeft', 'ShiftRight');
    };
    const down = (event: KeyboardEvent) => {
      if (!active) return;
      if (event.code === 'Escape') {
        callbacks.current.onStop();
        clear();
        event.preventDefault();
        return;
      }
      if (isEditableTarget(event.target)) return;
      if (event.code === 'KeyV' && !event.repeat) {
        callbacks.current.onToggleView();
        return;
      }
      if (!movementEnabled) return;
      if (/^(KeyW|KeyA|KeyS|KeyD|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|ShiftLeft|ShiftRight)$/.test(event.code)) {
        keys.add(event.code);
        updateKeys();
        event.preventDefault();
        invalidate();
      }
    };
    const up = (event: KeyboardEvent) => {
      keys.delete(event.code);
      updateKeys();
      invalidate();
    };
    const pointerDown = (event: PointerEvent) => {
      if (!active || !movementEnabled || event.button !== 0 || isEditableTarget(event.target)) return;
      pointerId = event.pointerId;
      x = event.clientX;
      y = event.clientY;
      input.current.dragging = true;
      canvas?.setPointerCapture?.(event.pointerId);
      invalidate();
    };
    const pointerMove = (event: PointerEvent) => {
      if (!active || !movementEnabled || event.pointerId !== pointerId) return;
      input.current.lookX += event.clientX - x;
      input.current.lookY += event.clientY - y;
      x = event.clientX;
      y = event.clientY;
      invalidate();
    };
    const pointerUp = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      if (canvas?.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      pointerId = null;
      input.current.dragging = false;
      invalidate();
    };
    const visibility = () => { if (document.hidden) clear(); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', visibility);
    canvas?.addEventListener('pointerdown', pointerDown);
    canvas?.addEventListener('pointermove', pointerMove);
    canvas?.addEventListener('pointerup', pointerUp);
    canvas?.addEventListener('pointercancel', pointerUp);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
      document.removeEventListener('visibilitychange', visibility);
      canvas?.removeEventListener('pointerdown', pointerDown);
      canvas?.removeEventListener('pointermove', pointerMove);
      canvas?.removeEventListener('pointerup', pointerUp);
      canvas?.removeEventListener('pointercancel', pointerUp);
      clear();
    };
  }, [active, canvas, invalidate, movementEnabled]);

  return input;
}
