import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';

export interface ManualInputState {
  forward: number;
  strafe: number;
  sprint: boolean;
}

const emptyInput = (): ManualInputState => ({
  forward: 0,
  strafe: 0,
  sprint: false,
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
  onMovementIntent: () => void,
) {
  const input = useRef<ManualInputState>(emptyInput());
  const invalidate = useThree((state) => state.invalidate);
  const callbacks = useRef({ onToggleView, onStop, onMovementIntent });
  callbacks.current = { onToggleView, onStop, onMovementIntent };

  useEffect(() => {
    const keys = new Set<string>();
    const clear = () => {
      keys.clear();
      input.current = emptyInput();
      invalidate();
    };
    const updateKeys = () => {
      const held = (...codes: string[]) => codes.some((code) => keys.has(code));
      input.current.forward = Number(held('KeyW', 'ArrowUp')) - Number(held('KeyS', 'ArrowDown'));
      input.current.strafe = Number(held('KeyD', 'ArrowRight')) - Number(held('KeyA', 'ArrowLeft'));
      input.current.sprint = held('ShiftLeft', 'ShiftRight');
    };
    const down = (event: KeyboardEvent) => {
      if (!active) {return;}
      if (event.code === 'Escape') {
        callbacks.current.onStop();
        clear();
        event.preventDefault();
        return;
      }
      if (isEditableTarget(event.target)) {return;}
      if (event.code === 'KeyV' && !event.repeat) {
        callbacks.current.onToggleView();
        return;
      }
      const directionKey = /^(KeyW|KeyA|KeyS|KeyD|ArrowUp|ArrowDown|ArrowLeft|ArrowRight)$/.test(event.code);
      if (directionKey && !event.repeat) {
        callbacks.current.onMovementIntent();
      }
      if (!movementEnabled) {return;}
      if (directionKey || /^(ShiftLeft|ShiftRight)$/.test(event.code)) {
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
    const visibility = () => { if (document.hidden) {clear();} };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
      document.removeEventListener('visibilitychange', visibility);
      clear();
    };
  }, [active, invalidate, movementEnabled]);

  return input;
}
