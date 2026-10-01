export function LightingRig({ lowQuality = false }: { lowQuality?: boolean }) {
  return (
    <>
      <hemisphereLight args={['#dbeafe', '#475569', 2]} />
      <directionalLight
        position={[10, 14, 6]}
        intensity={2.2}
        castShadow={!lowQuality}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={15}
        shadow-camera-bottom={-15}
        shadow-bias={-0.0005}
      />
    </>
  );
}
