import { Line } from '@react-three/drei';

export function PathLine({ points }: { points: Array<[number, number, number]> }) {
  if (points.length < 2) {
    return null;
  }
  return <Line points={points} color="#22ff88" lineWidth={3} dashed={false} />;
}
