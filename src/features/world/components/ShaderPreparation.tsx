import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { shaderAdmission } from '../model/work-admission.ts';
import { frameRuntime } from '../model/frame-runtime.ts';
/** Compile the final mounted instancing/light variants in one coalesced job. */
export function ShaderPreparation() {
  const { gl, scene, camera, invalidate } = useThree();
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const prepare = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void shaderAdmission
          .run(async () => {
            if (live && 'compileAsync' in gl) {
              await gl.compileAsync(scene, camera);
            }
            if (live) {
              gl.shadowMap.needsUpdate = true;
              invalidate();
            }
          })
          .catch(() => {
            /* Normal renderer compilation remains the fallback. */
          });
      }, 100);
    };
    const off = frameRuntime.subscribe(prepare);
    prepare();
    return () => {
      live = false;
      clearTimeout(timer);
      off();
    };
  }, [gl, scene, camera, invalidate]);
  return null;
}
