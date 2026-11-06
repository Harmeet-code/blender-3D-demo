import { useMemo } from 'react';
import StudioPage from '../StudioPage.tsx';
import { createMotionLabDocument } from './motion-lab/world.ts';
export default function DevVenuePreview() {
  const document = useMemo(createMotionLabDocument, []);
  const policy = useMemo(() => ({ status: 'resolved' as const, complete: true as const,
    buildingId: document.baseline.buildingId, source: 'approved dev-only schema fixture',
    revision: 'lab-local-v1', staffOnlyZoneIds: [], staffOnlyDoorObjectIds: [] }), [document]);
  return <><div role="status">DEV-ONLY SCHEMA FIXTURE ? local policy; not a real venue</div>
    <StudioPage devFixture={document} runtimePolicy={policy} /></>;
}
