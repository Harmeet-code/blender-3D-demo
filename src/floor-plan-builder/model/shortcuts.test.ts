import { describe, expect, test } from 'bun:test';
import { resolveEditorShortcut, resolveShortcut } from './shortcuts.ts';

const key = (key: string, overrides: Partial<KeyboardEvent> = {}) => ({
  key,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  repeat: false,
  defaultPrevented: false,
  ...overrides,
});

describe('editor shortcuts', () => {
  test('maps one-shot editing and rotation commands', () => {
    expect(resolveEditorShortcut(key('d', { shiftKey: true }))).toBe('duplicate');
    expect(resolveEditorShortcut(key('Delete'))).toBe('delete');
    expect(resolveEditorShortcut(key('q'))).toBe('rotate-left');
    expect(resolveEditorShortcut(key('q', { altKey: true }))).toBe('rotate-left');
    expect(resolveEditorShortcut(key('e'))).toBe('rotate-right');
    expect(resolveEditorShortcut(key('Escape'))).toBe('cancel');
    expect(resolveEditorShortcut(key('Enter'))).toBe('finish');
  });

  test('maps save, undo and redo for both command-key platforms', () => {
    expect(resolveEditorShortcut(key('s', { ctrlKey: true }))).toBe('save');
    expect(resolveEditorShortcut(key('z', { metaKey: true }))).toBe('undo');
    expect(resolveEditorShortcut(key('z', { ctrlKey: true, shiftKey: true }))).toBe('redo');
  });

  test('ignores editable targets, repeats, and conflicting modifiers', () => {
    expect(resolveEditorShortcut(key('Delete'), true)).toBeNull();
    expect(resolveEditorShortcut(key('d', { shiftKey: true, repeat: true }))).toBeNull();
    expect(resolveEditorShortcut(key('d', { altKey: true, shiftKey: true }))).toBeNull();
    expect(resolveEditorShortcut(key('s', { ctrlKey: true, metaKey: true }))).toBeNull();
    expect(resolveShortcut(key('Delete'))).toBe('remove');
  });
});
