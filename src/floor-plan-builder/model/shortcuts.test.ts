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
  test('maps one-shot editing commands but keeps rotation in Customize', () => {
    expect(resolveEditorShortcut(key('d', { shiftKey: true }))).toBe('duplicate');
    expect(resolveEditorShortcut(key('Delete'))).toBe('delete');
    expect(resolveEditorShortcut(key('q'))).toBeNull();
    expect(resolveEditorShortcut(key('q', { altKey: true }))).toBeNull();
    expect(resolveEditorShortcut(key('e'))).toBeNull();
    expect(resolveEditorShortcut(key('Escape'))).toBe('cancel');
    expect(resolveEditorShortcut(key('Enter'))).toBe('finish');
    expect(resolveEditorShortcut(key('s', { shiftKey: true }))).toBe('save');
    expect(resolveShortcut(key('s', { shiftKey: true }))).toBe('save');
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

  test('allows Shift+S from a numeric editor without intercepting text typing', () => {
    const spinbutton = { getAttribute: () => 'spinbutton' };
    const numericTarget = {
      closest: (selector: string) => selector === 'input,[role="spinbutton"]' ? spinbutton : null,
    } as unknown as EventTarget;
    expect(resolveEditorShortcut({ ...key('S', { shiftKey: true }), target: numericTarget }, true)).toBe('save');
    expect(resolveEditorShortcut(key('S', { shiftKey: true }), true)).toBeNull();
  });
});
