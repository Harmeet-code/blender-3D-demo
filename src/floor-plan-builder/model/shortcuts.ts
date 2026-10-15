import type { Tool } from './types.ts';

export type Shortcut = Tool | 'apply' | 'undo' | 'redo' | 'cancel' | 'finish' | 'preset' | 'poi';
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  const editable = target.closest('[contenteditable]');
  return (
    !!editable?.matches(
      '[contenteditable=""],[contenteditable="true"],[contenteditable="plaintext-only"]',
    ) ||
    !!target.closest('input,textarea,select,[role="textbox"],[role="combobox"],[role="spinbutton"]')
  );
}
export function resolveShortcut(
  event: Pick<
    KeyboardEvent,
    'key' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey' | 'repeat' | 'defaultPrevented'
  >,
  editable = false,
): Shortcut | null {
  if (editable || event.repeat || event.defaultPrevented || (event.ctrlKey && event.metaKey)) {
    return null;
  }
  const key = event.key.toUpperCase();
  if ((event.ctrlKey || event.metaKey) && !event.altKey && key === 'Z') {
    return event.shiftKey ? 'redo' : 'undo';
  }
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return null;
  }
  if (key === 'ESCAPE') {
    return 'cancel';
  }
  if (key === 'ENTER') {
    return 'finish';
  }
  if (!event.shiftKey) {
    return null;
  }
  const mapping: Record<string, Shortcut> = {
    S: 'apply',
    R: 'resize',
    M: 'move',
    D: 'duplicate',
    B: 'rectangle',
    P: 'polygon',
    T: 'preset',
    I: 'poi',
    Z: 'zone-rectangle',
    X: 'remove',
  };
  return mapping[key] ?? null;
}
