import type { Tool } from './types.ts';

export type Shortcut = Tool | 'apply' | 'undo' | 'redo' | 'cancel' | 'finish' | 'preset' | 'poi';
export type EditorShortcut = Shortcut | 'delete' | 'rotate-left' | 'rotate-right' | 'save';
export function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as Element | null;
  if (!element || typeof element.closest !== 'function') {
    return false;
  }
  const editable = element.closest('[contenteditable]');
  return (
    !!editable?.matches(
      '[contenteditable=""],[contenteditable="true"],[contenteditable="plaintext-only"]',
    ) ||
    !!element.closest('input,textarea,select,[role="textbox"],[role="combobox"],[role="spinbutton"]')
  );
}
/**
 * Numeric fields are where precise resizing happens, so Enter and Escape still have to reach
 * the editor while one has focus. Every other key belongs to the field.
 */
export function isNumericField(target: EventTarget | null): boolean {
  const element = target as Element | null;
  if (!element || typeof element.closest !== 'function') {
    return false;
  }
  const field = element.closest('input,[role="spinbutton"]');
  if (!field) {
    return false;
  }
  if (typeof HTMLInputElement !== 'undefined' && field instanceof HTMLInputElement) {
    return field.type === 'number' || field.type === 'range';
  }
  return field.getAttribute('role') === 'spinbutton';
}
/** Enter commits and Escape abandons a staged numeric edit; the field keeps every other key. */
function numericFieldCommand(
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>,
  target: EventTarget | null,
): 'finish' | 'cancel' | null {
  if (event.ctrlKey || event.metaKey || event.altKey || !isNumericField(target)) {
    return null;
  }
  const key = event.key.toUpperCase();
  if (key === 'ESCAPE') {
    return 'cancel';
  }
  return key === 'ENTER' ? 'finish' : null;
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
  if (!event.shiftKey && key === 'DELETE') {
    return 'remove';
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

/**
 * Model-level shortcut contract for the simplified editor shell. Keep `resolveShortcut` for
 * legacy callers while the shell migrates to these explicit mutation commands.
 */
export function resolveEditorShortcut(
  event: Pick<
    KeyboardEvent,
    'key' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey' | 'repeat' | 'defaultPrevented'
  > & { target?: EventTarget | null },
  editable = false,
): EditorShortcut | null {
  if (editable || event.repeat || event.defaultPrevented || (event.ctrlKey && event.metaKey)) {
    // A focused numeric field still commits on Enter and abandons on Escape.
    if (editable && !event.repeat && !event.defaultPrevented) {
      return numericFieldCommand(event, event.target ?? null);
    }
    return null;
  }
  const key = event.key.toUpperCase();
  if ((event.ctrlKey || event.metaKey) && !event.altKey) {
    if (key === 'Z') {
      return event.shiftKey ? 'redo' : 'undo';
    }
    if (key === 'S' && !event.shiftKey) {
      return 'save';
    }
    return null;
  }
  if (event.ctrlKey || event.metaKey) {
    return null;
  }
  if (event.altKey) {
    if (!event.shiftKey && (key === 'Q' || key === 'E')) {
      return key === 'Q' ? 'rotate-left' : 'rotate-right';
    }
    return null;
  }
  if (key === 'ESCAPE') {
    return 'cancel';
  }
  if (key === 'ENTER') {
    return 'finish';
  }
  if (!event.shiftKey && key === 'DELETE') {
    return 'delete';
  }
  if (!event.shiftKey && key === 'Q') {
    return 'rotate-left';
  }
  if (!event.shiftKey && key === 'E') {
    return 'rotate-right';
  }
  if (!event.shiftKey) {
    return null;
  }
  const mapping: Record<string, EditorShortcut> = {
    D: 'duplicate',
    S: 'apply',
    R: 'resize',
    M: 'move',
    B: 'rectangle',
    P: 'polygon',
    T: 'preset',
    I: 'poi',
    Z: 'zone-rectangle',
    X: 'remove',
  };
  return mapping[key] ?? null;
}
