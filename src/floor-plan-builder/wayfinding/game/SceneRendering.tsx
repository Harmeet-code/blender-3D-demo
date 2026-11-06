import { useFrame } from '@react-three/fiber';

/** Exactly one ordinary scene render; no composer, FBO or postprocessing passes.
 * Owning this render lets the HUD measure CPU submission without patching WebGLRenderer.
 */
export function SceneRendering({ counters }: { counters: { renderMs: number } }) {
  useFrame(({ gl, scene, camera }) => {
    const start = performance.now();
    gl.setRenderTarget(null);
    // This pass owns the whole canvas. Offscreen environment captures must not
    // leave a viewport or scissor restricting the visible scene submission.
    gl.setScissorTest(false);
    const canvas = gl.domElement;
    const pixelRatio = gl.getPixelRatio();
    gl.setViewport(0, 0, canvas.width / pixelRatio, canvas.height / pixelRatio);
    gl.render(scene, camera);
    counters.renderMs = performance.now() - start;
  }, 1);
  return null;
}
