/* oxlint-disable no-console */
// Restore the copied local recovery draft in the floor plan editor.
// Open DevTools on http://127.0.0.1:5175, paste this file into the Console,
// then select %LOCALAPPDATA%\Temp\floor-plan-studio-recovered-draft.json.
// The current local draft is preserved under a timestamped backup key.
// This does not call the server Save API and does not reload the page.
(async () => {
  const expectedOrigin = 'http://127.0.0.1:5175';
  const eventId = 'floor-plan-studio';
  const storageKey = `floor-plan-builder:v1:${encodeURIComponent(eventId)}`;

  if (location.origin !== expectedOrigin) {
    throw new Error(`Open the editor at ${expectedOrigin} first. Current origin: ${location.origin}`);
  }

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  const file = await new Promise((resolve) => {
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true });
    input.click();
  });
  if (!file) {throw new Error('No recovery JSON file was selected.');}

  const raw = await file.text();
  const draft = JSON.parse(raw);
  if (
    draft?.eventId !== eventId ||
    draft?.layout?.buildingId !== eventId ||
    !Array.isArray(draft?.layout?.floors)
  ) {
    throw new Error('The selected file is not a complete floor-plan-studio recovery draft.');
  }

  const current = localStorage.getItem(storageKey);
  const backupKey = current === null ? null : `${storageKey}:backup:${Date.now()}`;
  if (backupKey) {localStorage.setItem(backupKey, current);}

  try {
    localStorage.setItem(storageKey, raw);
    const check = JSON.parse(localStorage.getItem(storageKey));
    if (check?.eventId !== eventId || check?.layout?.buildingId !== eventId) {
      throw new Error('The stored draft did not pass verification.');
    }
  } catch (error) {
    if (current === null) {localStorage.removeItem(storageKey);}
    else {localStorage.setItem(storageKey, current);}
    if (backupKey) {localStorage.removeItem(backupKey);}
    throw error;
  }

  const floors = draft.layout.floors;
  console.info('Recovery draft stored. Reload the editor to see its local-recovery prompt.', {
    floors: floors.length,
    placedItems: floors.reduce((sum, floor) => sum + (floor.authoring?.instances?.length ?? 0), 0),
    floorsWithImages: floors.filter((floor) => typeof floor.image === 'string' && floor.image.length > 0).length,
    previousDraftBackupKey: backupKey,
    serverSaveCalled: false,
  });
})();
