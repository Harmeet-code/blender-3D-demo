import { Suspense, use, useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import {
  loadMallSceneResources,
  releaseMallSceneResources,
  retainMallSceneLoadLease,
  retainMallSceneResources,
} from '../model/mall-data.ts';
import type { MallView } from '../model/mall-types.ts';

const GARAGE_VIEWS = new Set<MallView>(['parking', 'suv', 'pickup']);

export function ProceduralMall({ view, onReady }: { view: MallView; onReady: () => void }) {
  const resourcesPromise = useMemo(() => loadMallSceneResources(), []);

  useEffect(() => retainMallSceneLoadLease(), []);

  return (
    <Suspense fallback={null}>
      <ProceduralMallScene resourcesPromise={resourcesPromise} view={view} onReady={onReady} />
    </Suspense>
  );
}

function ProceduralMallScene({
  resourcesPromise,
  view,
  onReady,
}: {
  resourcesPromise: ReturnType<typeof loadMallSceneResources>;
  view: MallView;
  onReady: () => void;
}) {
  const resources = use(resourcesPromise);
  const gl = useThree((state) => state.gl);

  useEffect(() => {
    retainMallSceneResources(resources);
    return () => releaseMallSceneResources(resources);
  }, [resources]);

  useEffect(() => {
    const garageView = GARAGE_VIEWS.has(view);
    const exterior = resources.root.getObjectByName('Mall_exterior');
    const interior = resources.root.getObjectByName('Mall_interior');
    if (exterior) {
      exterior.visible = !garageView && view !== 'atrium';
    }
    if (interior) {
      interior.visible = !garageView;
    }
    // The source scene keeps the garage visible in every view.
    const garage = resources.root.getObjectByName('Mall_garage');
    if (garage) {
      garage.visible = true;
    }
    gl.shadowMap.needsUpdate = true;
    onReady();
  }, [resources, view, onReady, gl]);

  return <primitive object={resources.root} dispose={null} />;
}
