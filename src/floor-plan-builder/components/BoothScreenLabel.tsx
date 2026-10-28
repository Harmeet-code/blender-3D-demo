import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { isBooth, type PlanObject } from '../model/types.ts';
import { visualHeight } from '../model/geometry.ts';

interface BoothScreenLabel {
  id: string;
  x: number;
  y: number;
  z: number;
  text: string;
  screenX: number;
  screenY: number;
  screenZ: number;
}

interface LabelMetrics {
  width: number;
  text: string;
  viewportWidth: number;
}

const LABEL_FONT = '600 14px Inter, ui-sans-serif, system-ui, sans-serif';
const LABEL_HEIGHT = 24;
const LABEL_MAX_WIDTH = 240;
const LABEL_MIN_WIDTH = 46;
const COLLISION_CELL_SIZE = 40;

/**
 * Draws constant-size booth labels into one screen-space canvas. The canvas is
 * updated only when R3F renders (the studio uses demand rendering), so camera
 * gestures redraw labels without causing React renders or one DOM node per booth.
 */
export function BoothScreenLabelLayer({
  booths,
  heightOffset,
  container,
  enabled = true,
  selectedId = null,
}: {
  booths: readonly PlanObject[];
  heightOffset: number;
  container: RefObject<HTMLDivElement | null>;
  enabled?: boolean;
  selectedId?: string | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const projectionPoint = useMemo(() => new Vector3(), []);
  const candidates = useRef<BoothScreenLabel[]>([]);
  const occupiedCells = useRef(new Set<number>());
  const { camera, gl, size } = useThree();
  const labels = useMemo<BoothScreenLabel[]>(
    () =>
      booths.filter(isBooth).map((booth) => {
        const { polygon } = booth;
        const [positionX, positionZ] = booth.position;
        let twiceArea = 0;
        let centerX = 0;
        let centerZ = 0;
        let previous = polygon.at(-1)!;
        for (const current of polygon) {
          const [previousX, previousZ] = previous;
          const [currentX, currentZ] = current;
          const cross = previousX * currentZ - currentX * previousZ;
          twiceArea += cross;
          centerX += (previousX + currentX) * cross;
          centerZ += (previousZ + currentZ) * cross;
          previous = current;
        }
        if (Math.abs(twiceArea) > 1e-8) {
          centerX /= 3 * twiceArea;
          centerZ /= 3 * twiceArea;
        } else {
          centerX = positionX;
          centerZ = positionZ;
        }
        const number = booth.boothNumber.trim();
        const name = (booth.company || booth.name).trim();
        const text = number && name ? `${number} · ${name}` : number || name || 'Booth';
        return {
          id: booth.id,
          x: centerX,
          y: heightOffset + visualHeight(booth) + 0.08,
          z: centerZ,
          text,
          screenX: 0,
          screenY: 0,
          screenZ: 0,
        };
      }),
    [booths, heightOffset],
  );
  const metrics = useRef(new Map<string, LabelMetrics>());
  useEffect(() => {
    metrics.current.clear();
  }, [labels]);

  useEffect(() => {
    const parent = container.current;
    if (!parent || !enabled) {
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.className = 'fp-booth-screen-labels';
    canvas.setAttribute('aria-hidden', 'true');
    Object.assign(canvas.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: '3',
    });
    parent.append(canvas);
    canvasRef.current = canvas;
    return () => {
      if (canvasRef.current === canvas) {
        canvasRef.current = null;
      }
      canvas.remove();
    };
  }, [container, enabled]);

  useFrame(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context || !enabled || size.width <= 0 || size.height <= 0) {
      return;
    }

    const pixelRatio = gl.getPixelRatio();
    const pixelWidth = Math.max(1, Math.round(size.width * pixelRatio));
    const pixelHeight = Math.max(1, Math.round(size.height * pixelRatio));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, size.width, size.height);
    context.font = LABEL_FONT;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.lineWidth = 1;
    context.shadowColor = 'rgba(0, 0, 0, 0.28)';
    context.shadowBlur = 5;
    context.shadowOffsetY = 2;

    // Reuse a single Three vector for projection so a large venue does not
    // allocate hundreds of temporary objects on every orbit or zoom frame.
    const worldPoint = projectionPoint;
    const visible = candidates.current;
    visible.length = 0;
    for (const label of labels) {
      worldPoint.set(label.x, label.y, label.z).project(camera);
      if (
        worldPoint.z < -1 ||
        worldPoint.z > 1 ||
        worldPoint.x < -1 ||
        worldPoint.x > 1 ||
        worldPoint.y < -1 ||
        worldPoint.y > 1
      ) {
        continue;
      }
      label.screenX = ((worldPoint.x + 1) * size.width) / 2;
      label.screenY = ((1 - worldPoint.y) * size.height) / 2;
      label.screenZ = worldPoint.z;
      visible.push(label);
    }

    // A dense overview cannot give every label a distinct readable position.
    // Keep all labels as the camera moves in; in crowded frames show the
    // selected booth first, then nearer booths, without painting a pile of text.
    visible.sort((left, right) => {
      if (left.id === selectedId) {
        return -1;
      }
      if (right.id === selectedId) {
        return 1;
      }
      return left.screenZ - right.screenZ;
    });
    const columns = Math.max(1, Math.ceil(size.width / COLLISION_CELL_SIZE));
    const occupied = occupiedCells.current;
    occupied.clear();
    for (const label of visible) {
      const cachedMetrics = metrics.current.get(label.text);
      let labelMetrics = cachedMetrics;
      if (!labelMetrics || labelMetrics.viewportWidth !== size.width) {
        const measuredWidth = context.measureText(label.text).width;
        const maxWidth = Math.max(LABEL_MIN_WIDTH, size.width - 8);
        const width = Math.min(
          LABEL_MAX_WIDTH,
          maxWidth,
          Math.max(LABEL_MIN_WIDTH, measuredWidth + 18),
        );
        labelMetrics = {
          width,
          text: measuredWidth + 4 > width ? fitText(context, label.text, width - 16) : label.text,
          viewportWidth: size.width,
        };
        metrics.current.set(label.text, labelMetrics);
      }
      const left = Math.max(
        4,
        Math.min(size.width - labelMetrics.width - 4, label.screenX - labelMetrics.width / 2),
      );
      const top = Math.max(
        4,
        Math.min(size.height - LABEL_HEIGHT - 4, label.screenY - LABEL_HEIGHT / 2),
      );
      const firstColumn = Math.floor(left / COLLISION_CELL_SIZE);
      const lastColumn = Math.floor((left + labelMetrics.width) / COLLISION_CELL_SIZE);
      const firstRow = Math.floor(top / COLLISION_CELL_SIZE);
      const lastRow = Math.floor((top + LABEL_HEIGHT) / COLLISION_CELL_SIZE);
      let collides = false;
      for (let row = firstRow; row <= lastRow && !collides; row += 1) {
        for (let column = firstColumn; column <= lastColumn; column += 1) {
          if (occupied.has(row * columns + column)) {
            collides = true;
            break;
          }
        }
      }
      if (collides) {
        continue;
      }
      const isSelected = label.id === selectedId;
      for (let row = firstRow; row <= lastRow; row += 1) {
        for (let column = firstColumn; column <= lastColumn; column += 1) {
          occupied.add(row * columns + column);
        }
      }
      context.fillStyle = isSelected ? 'rgba(30, 66, 56, 0.96)' : 'rgba(20, 37, 34, 0.9)';
      context.strokeStyle = isSelected ? '#f4d99b' : 'rgba(230, 244, 237, 0.72)';
      context.lineWidth = isSelected ? 2 : 1;
      roundRect(context, left, top, labelMetrics.width, LABEL_HEIGHT, 6);
      context.fill();
      context.shadowColor = 'transparent';
      context.shadowBlur = 0;
      context.shadowOffsetY = 0;
      context.stroke();
      context.fillStyle = '#f6fbf8';
      context.fillText(
        labelMetrics.text,
        left + labelMetrics.width / 2,
        top + LABEL_HEIGHT / 2,
        labelMetrics.width - 12,
      );
      context.shadowColor = 'rgba(0, 0, 0, 0.28)';
      context.shadowBlur = 5;
      context.shadowOffsetY = 2;
    }
  });

  return null;
}

function fitText(context: CanvasRenderingContext2D, value: string, maxWidth: number) {
  let text = value;
  while (text.length > 1 && context.measureText(`${text}…`).width > maxWidth) {
    text = text.slice(0, -1);
  }
  return text.length === value.length ? value : `${text}…`;
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}
