import { useFrame } from '@react-three/fiber';

/** Exactly one ordinary scene render; no composer, FBO or postprocessing passes.
 * Owning this render lets the HUD measure CPU submission without patching WebGLRenderer.
 */
export function SceneRendering({ counters }: { counters: { renderMs: number } }) {
  useFrame(({ gl, scene, camera }) => {
    const start = performance.now();
    gl.setRenderTarget(null);
    gl.render(scene, camera);
    counters.renderMs = performance.now() - start;
  }, 1);
  return null;
}
