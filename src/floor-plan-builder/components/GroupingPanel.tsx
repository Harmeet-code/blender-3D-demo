import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { activeFloor, unfinished, type StudioStore } from '../model/store.ts';

export function GroupingPanel({ store }: { store: StudioStore }) {
  const state = store(),
    floor = activeFloor(state);
  const [chosen, setChosen] = useState<string[]>([]);
  useEffect(() => setChosen([]), [state.floorId]);
  const objects = floor.objects.filter((object) => object.id !== state.pendingRemoval?.id);
  const currentGroup = objects.find((object) => object.id === state.selection?.id)?.groupId;
  const history = state.selectionHistory[state.floorId];
  return (
    <div className="fp-form">
      <div className="fp-row">
        <Button
          size="sm"
          variant="outline"
          disabled={unfinished(state) || !history || history.cursor <= 0}
          onClick={() => state.navigateSelection(-1)}
        >
          Previous selection
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={unfinished(state) || !history || history.cursor >= history.entries.length - 1}
          onClick={() => state.navigateSelection(1)}
        >
          Next selection
        </Button>
      </div>
      <p className="fp-muted">
        Choose objects to group. Move, rotation and duplicate operate on the group. Size and polygon
        edits affect one object.
      </p>
      <div className="fp-group-list">
        {objects.map((object) => (
          <label key={object.id}>
            <input
              type="checkbox"
              checked={chosen.includes(object.id)}
              disabled={unfinished(state)}
              onChange={(event) =>
                setChosen((current) =>
                  event.target.checked
                    ? [...current, object.id]
                    : current.filter((id) => id !== object.id),
                )
              }
            />
            <span>
              {object.name}
              {object.groupId ? ' · grouped' : ''}
            </span>
          </label>
        ))}
        {!objects.length && <p className="fp-muted">Place objects to create a group.</p>}
      </div>
      <div className="fp-row">
        <Button
          size="sm"
          disabled={
            unfinished(state) ||
            chosen.filter((id) => objects.some((object) => object.id === id)).length < 2
          }
          onClick={() => {
            state.groupObjects(chosen);
            setChosen([]);
          }}
        >
          Group chosen objects
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={unfinished(state) || !currentGroup}
          onClick={state.ungroup}
        >
          Ungroup selected
        </Button>
      </div>
    </div>
  );
}
