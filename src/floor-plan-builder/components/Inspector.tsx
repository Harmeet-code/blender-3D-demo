import { useState, useEffect, useRef, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { uploadMedia } from '@/features/layout-editor/api/media-client.ts';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { polygonBounds } from '@/utils/geometry/polygon.ts';
import { activeFloor, resizeObject, unfinished, type StudioStore } from '../model/store.ts';
import {
  isBooth,
  isConnector,
  objectSchema,
  polygonSchema,
  type PlanFloor,
  type PlanObject,
} from '../model/types.ts';
import { boothPresets, withPreset } from '../model/presets.ts';
import { BoothFields } from './BoothFields.tsx';
import { CirculationFields } from './CirculationFields.tsx';
import { isCirculation } from '../model/circulation.ts';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Label className="fp-field">
      <span>{label}</span>
      {children}
    </Label>
  );
}
function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
  step = 0.1,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}) {
  return (
    <Field label={label}>
      <Input
        aria-label={label}
        disabled={disabled}
        type="number"
        step={step}
        min={min}
        max={max}
        aria-invalid={
          !Number.isFinite(value) ||
          (min !== undefined && value < min) ||
          (max !== undefined && value > max)
        }
        value={Number.isFinite(value) ? value : ''}
        onChange={(event) => onChange(event.target.value === '' ? NaN : Number(event.target.value))}
      />
    </Field>
  );
}
function Vertices({
  value,
  onChange,
  label = 'Polygon vertices (local meters)',
  isPolygon = true,
}: {
  value: [number, number][];
  onChange: (points: [number, number][]) => void;
  label?: string;
  isPolygon?: boolean;
}) {
  const [draft, setDraft] = useState(JSON.stringify(value));
  const [error, setError] = useState('');
  const lastSent = useRef(JSON.stringify(value));
  const serialized = JSON.stringify(value);
  useEffect(() => {
    if (serialized !== lastSent.current) {
      setDraft(serialized);
      setError('');
      lastSent.current = serialized;
    }
  }, [serialized]);
  const emit = (points: [number, number][], replaceText = true) => {
    lastSent.current = JSON.stringify(points);
    if (replaceText) {
      setDraft(lastSent.current);
    }
    const result = polygonSchema.safeParse(points);
    setError(
      !isPolygon || result.success
        ? ''
        : result.error.issues.map((issue) => issue.message).join(' '),
    );
    onChange(points);
  };
  return (
    <div className="fp-form">
      <Field label={label}>
        <Textarea
          aria-label={label}
          aria-invalid={!!error}
          value={draft}
          rows={3}
          onChange={(event) => {
            setDraft(event.target.value);
            try {
              const points: unknown = JSON.parse(event.target.value);
              if (
                !Array.isArray(points) ||
                !points.every(
                  (point) =>
                    Array.isArray(point) &&
                    point.length === 2 &&
                    point.every((n) => typeof n === 'number' && Number.isFinite(n)),
                )
              ) {
                throw new Error();
              }
              emit(points as [number, number][], false);
            } catch {
              const invalid: [number, number][] = isPolygon ? [] : [[NaN, NaN]];
              lastSent.current = JSON.stringify(invalid);
              onChange(invalid);
              setError('Enter finite coordinate pairs, with no repeated closing vertex.');
            }
          }}
        />
      </Field>
      <div className="fp-vertex-list">
        {value.map(([x, z], index) => (
          <div key={index} className="fp-vertex-row">
            <NumberInput
              label={`Vertex ${index + 1} X`}
              value={x}
              onChange={(next) => emit(value.map((point, i) => (i === index ? [next, z] : point)))}
            />
            <NumberInput
              label={`Vertex ${index + 1} Z`}
              value={z}
              onChange={(next) => emit(value.map((point, i) => (i === index ? [x, next] : point)))}
            />
            <Button
              size="sm"
              variant="outline"
              aria-label={`Remove vertex ${index + 1}`}
              onClick={() => emit(value.filter((_, i) => i !== index))}
            >
              ×
            </Button>
          </div>
        ))}
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          if (!value.length) {
            emit([[0, 0]]);
            return;
          }
          if (value.length === 1) {
            emit([...value, [value[0]![0] + 1, value[0]![1]]]);
            return;
          }
          const a = value[value.length - 1]!,
            b = value[0]!;
          const point: [number, number] =
            value.length === 2 ? [a[0], a[1] + 1] : [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
          emit([...value, point]);
        }}
      >
        Add vertex
      </Button>
      {error && (
        <p className="fp-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
function ObjectFields({ store, object }: { store: StudioStore; object: PlanObject }) {
  const landing = object.targetLanding ?? [5, 5];
  const state = store(),
    patch = state.patchObject;
  const validation = objectSchema.safeParse(object);
  const dimension = (axis: number, value: number) => {
    const dimensions = [...object.dimensions] as [number, number, number];
    dimensions[axis] = value;
    patch(resizeObject(object, ...dimensions));
  };
  return (
    <div className="fp-form">
      {!validation.success && (
        <ul className="fp-error" role="alert">
          {validation.error.issues.map((issue, index) => (
            <li key={index}>
              {issue.path.join('.')}: {issue.message}
            </li>
          ))}
        </ul>
      )}
      <Button size="sm" variant="outline" onClick={state.focus}>
        Focus object
      </Button>
      <Field label="Name">
        <Input
          aria-label="Object name"
          aria-invalid={!object.name.trim()}
          value={object.name}
          onChange={(event) => patch({ name: event.target.value })}
        />
      </Field>
      {isBooth(object) && (
        <Field label="Booth number">
          <Input
            aria-label="Booth number"
            value={object.boothNumber}
            onChange={(event) => patch({ boothNumber: event.target.value })}
          />
        </Field>
      )}
      <div className="fp-two">
        {isBooth(object) && (
          <Field label="Size label">
            <Input
              aria-label="Booth size label"
              value={object.boothSize}
              onChange={(event) => patch({ boothSize: event.target.value })}
            />
          </Field>
        )}
        <NumberInput
          label="Position X (m)"
          value={object.position[0]}
          onChange={(x) => patch({ position: [x, object.position[1]] })}
        />
        <NumberInput
          label="Position Z (m)"
          value={object.position[1]}
          onChange={(z) => patch({ position: [object.position[0], z] })}
        />
      </div>
      <div className="fp-three">
        {['Width (m)', 'Height (m)', 'Depth (m)'].map((label, axis) => (
          <NumberInput
            key={label}
            label={label}
            value={object.dimensions[axis]!}
            disabled={
              axis === 2 &&
              Boolean(object.circulationDesign?.autoSize) &&
              object.circulationDesign?.role !== 'upper' &&
              object.recipe !== 'elevator'
            }
            min={
              object.boothDesign
                ? (axis === 1 ? 2.2 : object.recipe === 'booth' ? 2 : 0.1) / object.scale[axis]!
                : 0.1
            }
            max={
              object.boothDesign
                ? (axis === 1
                    ? object.recipe === 'booth'
                      ? 4.5
                      : 6
                    : object.recipe === 'booth'
                      ? 12
                      : 1000) / object.scale[axis]!
                : 1000
            }
            onChange={(value) => dimension(axis, value)}
          />
        ))}
      </div>
      <NumberInput
        label="Rotation (degrees)"
        value={Math.round(((object.yawRadians * 180) / Math.PI) * 100) / 100}
        onChange={(degrees) => patch({ yawRadians: (degrees * Math.PI) / 180 })}
        step={15}
      />
      {isBooth(object) && (
        <div className="fp-preset-palette" aria-label="Apply booth preset">
          {boothPresets.map((preset) => (
            <Button
              key={preset.id}
              size="sm"
              variant="outline"
              onClick={() => patch(withPreset(object, preset.id))}
            >
              Use {preset.label}
            </Button>
          ))}
        </div>
      )}
      {!object.circulationDesign && (
        <div className="fp-three">
          {['Scale X', 'Scale Y', 'Scale Z'].map((label, axis) => (
            <NumberInput
              key={label}
              label={label}
              value={object.scale[axis]!}
              min={0.01}
              onChange={(value) => {
                const scale = [...object.scale] as [number, number, number];
                scale[axis] = value;
                patch({ scale });
              }}
            />
          ))}
        </div>
      )}
      <div className="fp-row">
        <Button variant="outline" size="sm" onClick={() => patch({ yawRadians: 0 })}>
          0°
        </Button>
        <Button variant="outline" size="sm" onClick={() => patch({ yawRadians: Math.PI / 2 })}>
          90°
        </Button>
        <Button variant="outline" size="sm" onClick={() => patch({ yawRadians: Math.PI })}>
          180°
        </Button>
      </div>
      {!isCirculation(object.recipe) && (
        <>
          <Field label="Color mode">
            <select
              aria-label="Color mode"
              value={object.colorMode}
              onChange={(event) =>
                patch({ colorMode: event.target.value as 'surface' | 'explicit' })
              }
            >
              <option value="surface">Match surface beneath object</option>
              <option value="explicit">Explicit color</option>
            </select>
          </Field>
          <Field label={object.colorMode === 'surface' ? 'Fallback color' : 'Object color'}>
            <Input
              aria-label="Object color"
              type="color"
              value={object.color}
              onChange={(event) => patch({ color: event.target.value })}
            />
          </Field>
        </>
      )}
      <Field label="Collision">
        <select
          aria-label="Collision"
          value={object.collidable ? 'solid' : 'reference'}
          onChange={(event) => patch({ collidable: event.target.value === 'solid' })}
        >
          <option value="solid">Solid obstacle</option>
          <option value="reference">
            {isCirculation(object.recipe)
              ? 'Non-blocking reference (no 3D routing)'
              : 'Walkable reference'}
          </option>
        </select>
      </Field>
      {!isBooth(object) && !isCirculation(object.recipe) && (
        <div className="fp-two">
          <NumberInput
            label="Material roughness"
            value={object.roughness}
            min={0}
            max={1}
            step={0.05}
            onChange={(roughness) => patch({ roughness })}
          />
          <NumberInput
            label="Material metalness"
            value={object.metalness}
            min={0}
            max={1}
            step={0.05}
            onChange={(metalness) => patch({ metalness })}
          />
        </div>
      )}
      {object.recipe.startsWith('washroom') && (
        <Field label="Washroom signage">
          <select
            aria-label="Washroom signage"
            value={object.gender}
            onChange={(event) => patch({ gender: event.target.value as PlanObject['gender'] })}
          >
            <option value="men">Men</option>
            <option value="women">Women</option>
            <option value="unisex">Unisex</option>
          </select>
        </Field>
      )}
      {(object.recipe === 'washroom-men' || object.recipe === 'washroom-women') && (
        <NumberInput
          label="Entrance opening (m)"
          value={object.washroomOpening}
          min={1.0}
          max={1.8}
          step={0.1}
          onChange={(washroomOpening) => patch({ washroomOpening })}
        />
      )}
      {object.recipe === 'kids-zone' && (
        <NumberInput
          label="Play element density"
          value={object.kidsDensity}
          min={0.2}
          max={1.0}
          step={0.1}
          onChange={(kidsDensity) => patch({ kidsDensity })}
        />
      )}
      {object.recipe === 'avatar' && (
        <>
          <Field label="Pose preset">
            <select
              aria-label="Pose preset"
              value={object.avatarPose}
              onChange={(event) =>
                patch({ avatarPose: event.target.value as PlanObject['avatarPose'] })
              }
            >
              {['idle', 'walking', 'pointing', 'sitting'].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </Field>
          <div className="fp-two">
            {(
              [
                ['avatarSkin', 'Skin'],
                ['avatarClothing', 'Clothing'],
                ['avatarHair', 'Hair'],
              ] as const
            ).map(([key, label]) => (
              <Field key={key} label={label}>
                <Input
                  aria-label={label}
                  type="color"
                  value={object[key]}
                  onChange={(event) => patch({ [key]: event.target.value })}
                />
              </Field>
            ))}
          </div>
          <label className="fp-check">
            <input
              type="checkbox"
              checked={object.avatarAnimated}
              onChange={(event) => patch({ avatarAnimated: event.target.checked })}
            />
            Idle breathing &amp; sway
          </label>
          <label className="fp-check">
            <input
              type="checkbox"
              checked={object.avatarPin}
              onChange={(event) => patch({ avatarPin: event.target.checked })}
            />
            “You are here” pin
          </label>
          <p className="fp-muted">Scale and dimensions are locked to the 1.8 m benchmark.</p>
        </>
      )}
      {object.recipe === 'barn-tent' && (
        <>
          <Field label="Tent style">
            <select
              aria-label="Tent style"
              value={object.tentStyle}
              onChange={(event) =>
                patch({ tentStyle: event.target.value as PlanObject['tentStyle'] })
              }
            >
              <option value="barn">Barn</option>
              <option value="gazebo">Gazebo</option>
              <option value="marquee">Marquee</option>
            </select>
          </Field>
          <NumberInput
            label="Roof overhang (m)"
            value={object.roofOverhang}
            min={0}
            max={5}
            onChange={(roofOverhang) => patch({ roofOverhang })}
          />
          <NumberInput
            label="Eaves / peak ratio"
            value={object.eavesRatio}
            min={0.3}
            max={0.95}
            step={0.05}
            onChange={(eavesRatio) => patch({ eavesRatio })}
          />
          {object.tentStyle === 'marquee' && (
            <NumberInput
              label="Marquee bays"
              value={object.tentBays}
              min={1}
              max={8}
              step={1}
              onChange={(tentBays) => patch({ tentBays })}
            />
          )}
          <Field label="Canopy material">
            <select
              aria-label="Canopy material"
              value={object.canopyMaterial}
              onChange={(event) =>
                patch({ canopyMaterial: event.target.value as PlanObject['canopyMaterial'] })
              }
            >
              {['canvas', 'vinyl', 'transparent'].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </Field>
          <Field label="Pole material">
            <select
              aria-label="Pole material"
              value={object.poleMaterial}
              onChange={(event) =>
                patch({ poleMaterial: event.target.value as PlanObject['poleMaterial'] })
              }
            >
              {['steel', 'wood', 'aluminium'].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </Field>
          <Field label="Sidewall state">
            <select
              aria-label="Sidewall state"
              value={object.tentSidewall}
              onChange={(event) =>
                patch({ tentSidewall: event.target.value as PlanObject['tentSidewall'] })
              }
            >
              {['open', 'half', 'full', 'windows'].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </Field>
          <Field label="Flooring">
            <select
              aria-label="Tent flooring"
              value={object.tentFlooring}
              onChange={(event) =>
                patch({ tentFlooring: event.target.value as PlanObject['tentFlooring'] })
              }
            >
              {['none', 'grass', 'wood-deck'].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </Field>
          <NumberInput
            label="Eaves height (m)"
            value={object.tentEavesHeight}
            min={2}
            max={3}
            step={0.1}
            onChange={(tentEavesHeight) => patch({ tentEavesHeight })}
          />
          <label className="fp-check">
            <input
              type="checkbox"
              checked={object.tentIndoors}
              onChange={(event) => patch({ tentIndoors: event.target.checked })}
            />
            Indoors (hide guy ropes)
          </label>
          <Vertices
            value={object.polePositions}
            label="Tent poles (local meters; empty uses corners)"
            isPolygon={false}
            onChange={(polePositions) => patch({ polePositions })}
          />
        </>
      )}
      {isBooth(object) && (
        <>
          <BoothFields object={object} patch={patch} />
          <Vertices
            key={`${object.id}:vertices`}
            value={object.polygon}
            onChange={(polygon) => patch({ polygon })}
          />
          <NumberInput
            label="Price"
            min={0}
            value={object.price}
            onChange={(price) => patch({ price })}
          />
          <Field label="Status">
            <select
              aria-label="Booth status"
              value={object.status}
              onChange={(event) => patch({ status: event.target.value as PlanObject['status'] })}
            >
              {['AVAILABLE', 'HOLD', 'BOOKED', 'UNAVAILABLE'].map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </Field>
          {(
            [
              'company',
              'boothType',
              'youtubeLink',
              'tags',
              'contactName',
              'contactEmail',
              'contactPhone',
            ] as const
          ).map((key) => (
            <Field
              key={key}
              label={
                {
                  company: 'Company',
                  boothType: 'Booth type',
                  youtubeLink: 'YouTube URL',
                  tags: 'Tags',
                  contactName: 'Contact name',
                  contactEmail: 'Contact email',
                  contactPhone: 'Contact phone',
                }[key]
              }
            >
              <Input
                aria-label={key}
                value={object[key]}
                onChange={(event) => patch({ [key]: event.target.value })}
              />
            </Field>
          ))}
          <Field label="Gate">
            <select
              aria-label="Gate"
              value={object.gate}
              onChange={(event) => patch({ gate: event.target.value as PlanObject['gate'] })}
            >
              {['front', 'back', 'left', 'right'].map((gate) => (
                <option key={gate}>{gate}</option>
              ))}
            </select>
          </Field>
        </>
      )}
      {object.recipe === 'entrance' && (
        <>
          <Field label="Gate type">
            <select
              aria-label="Gate type"
              value={object.entranceGate}
              onChange={(event) =>
                patch({ entranceGate: event.target.value as PlanObject['entranceGate'] })
              }
            >
              {['arch-sliding-doors', 'turnstile-lanes', 'open-arch'].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </Field>
          <NumberInput
            label="Clear opening (m)"
            value={object.entranceOpening ?? object.dimensions[0] - 1.0}
            min={1.2}
            max={6}
            step={0.1}
            onChange={(entranceOpening) => patch({ entranceOpening })}
          />
          <label className="fp-check">
            <input
              type="checkbox"
              checked={object.entranceGate === 'open-arch' ? true : object.entranceOpen}
              disabled={object.entranceGate === 'open-arch'}
              onChange={(event) => patch({ entranceOpen: event.target.checked })}
            />
            Doors open (slide ±0.9 m, 0.8 s)
          </label>
        </>
      )}
      {object.recipe === 'information' && (
        <NumberInput
          label="Floating sign height (m)"
          value={object.infoSignHeight}
          min={2.8}
          max={4.5}
          step={0.1}
          onChange={(infoSignHeight) => patch({ infoSignHeight })}
        />
      )}
      {object.recipe === 'food-kiosk' && (
        <>
          <NumberInput
            label="Queue zone depth (m)"
            value={object.kioskQueueDepth}
            min={1.5}
            max={3.0}
            step={0.1}
            onChange={(kioskQueueDepth) => patch({ kioskQueueDepth })}
          />
          <Field label="Menu board text">
            <Input
              aria-label="Menu board text"
              value={object.kioskMenu}
              onChange={(event) => patch({ kioskMenu: event.target.value })}
            />
          </Field>
        </>
      )}
      {object.recipe === 'exit' && (
        <label className="fp-check">
          <input
            type="checkbox"
            checked={object.exitOpen}
            onChange={(event) => patch({ exitOpen: event.target.checked })}
          />
          Egress door open (−90° swing, 0.6 s)
        </label>
      )}
      {isCirculation(object.recipe) && <CirculationFields object={object} patch={patch} />}
      {isConnector(object.recipe) && (
        <>
          <div className="fp-two">
            <NumberInput
              label="Target landing X (m)"
              value={landing[0]}
              onChange={(x) => {
                patch({ targetLanding: [x, landing[1]] });
              }}
            />
            <NumberInput
              label="Target landing Z (m)"
              value={landing[1]}
              onChange={(z) => {
                patch({ targetLanding: [landing[0], z] });
              }}
            />
          </div>
          {!object.circulationDesign && (
            <>
              <NumberInput
                label="Steps"
                min={1}
                step={1}
                value={object.steps}
                onChange={(steps) => patch({ steps })}
              />
              <p className="fp-muted">
                Rise {(object.dimensions[1] / object.steps).toFixed(2)} m · tread{' '}
                {(object.dimensions[2] / object.steps).toFixed(2)} m
              </p>
              <div className="fp-two">
                <NumberInput
                  label="Step rise (m)"
                  value={object.dimensions[1] / object.steps}
                  min={0.01}
                  onChange={(value) => dimension(1, value * object.steps)}
                />
                <NumberInput
                  label="Step tread (m)"
                  value={object.dimensions[2] / object.steps}
                  min={0.01}
                  onChange={(value) => dimension(2, value * object.steps)}
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                aria-pressed={object.handrails}
                onClick={() => patch({ handrails: !object.handrails })}
              >
                Handrails {object.handrails ? 'on' : 'off'}
              </Button>
            </>
          )}
          <p className="fp-muted">
            Apply properties before linking floors. Each landing can then be moved independently.
          </p>
          {state.document.floors
            .filter(
              (floor) =>
                floor.source.id !== state.floorId &&
                !floor.objects.some((item) => object.portalId && item.portalId === object.portalId),
            )
            .map((floor) => (
              <Button
                key={floor.source.id}
                variant="outline"
                size="sm"
                disabled={!!state.pendingObject}
                onClick={() => state.linkConnector(floor.source.id, landing)}
              >
                Connect to {floor.source.name}
              </Button>
            ))}
          {object.portalId &&
            state.document.floors
              .filter((floor) => floor.source.id !== state.floorId)
              .flatMap((floor) => {
                const target = floor.objects.find((item) => item.portalId === object.portalId);
                return target
                  ? [
                      <div className="fp-row" key={floor.source.id}>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={unfinished(state)}
                          onClick={() => {
                            if (state.setFloor(floor.source.id)) {
                              store.getState().select({ kind: 'object', id: target.id });
                            }
                          }}
                        >
                          Edit landing · {floor.source.name}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={unfinished(state)}
                          onClick={() => state.unlinkConnector(floor.source.id)}
                        >
                          Disconnect {floor.source.name}
                        </Button>
                      </div>,
                    ]
                  : [];
              })}
          {object.portalId && (
            <p className="fp-muted">Paired connector · {object.connectsFloorIds.length} floors</p>
          )}
        </>
      )}
      <div className="fp-row">
        <Button onClick={() => state.apply()}>Apply changes</Button>
        <Button variant="outline" onClick={state.cancel}>
          Discard
        </Button>
      </div>
    </div>
  );
}
export function FloorProperties({ store }: { store: StudioStore }) {
  const state = store(),
    applied = activeFloor(state),
    floor = state.pendingFloor ?? applied;
  const bounds = polygonBounds(floor.boundary),
    originalBounds = polygonBounds(applied.boundary);
  const width = bounds.maxX - bounds.minX,
    depth = bounds.maxZ - bounds.minZ;
  const [uploading, setUploading] = useState(false);
  const [removeImageRevision, setRemoveImageRevision] = useState<number | null>(null);
  const hint = state.imageSizes[applied.source.id];
  const imageSize =
    floor.source.authoring?.imageSize ??
    (hint?.url === (applied.source.authoring?.originalImage ?? applied.source.image)
      ? hint.size
      : undefined);
  const corners =
    floor.calibrationText ??
    (imageSize
      ? JSON.stringify([
          [0, 0],
          [imageSize[0], 0],
          [0, imageSize[1]],
        ])
      : '');
  const patchSource = (updates: Partial<PlanFloor['source']>) =>
    state.patchFloor({ source: { ...floor.source, ...updates } });
  const resizeBoundary = (w: number, d: number) =>
    state.patchFloor({
      boundary: [
        [originalBounds.minX, originalBounds.minZ],
        [originalBounds.minX + w, originalBounds.minZ],
        [originalBounds.minX + w, originalBounds.minZ + d],
        [originalBounds.minX, originalBounds.minZ + d],
      ],
    });
  return (
    <div className="fp-form">
      <Field label="Floor name">
        <Input
          aria-label="Floor name"
          aria-invalid={!floor.source.name.trim()}
          value={floor.source.name}
          onChange={(event) => patchSource({ name: event.target.value })}
        />
      </Field>
      <NumberInput
        label="Floor elevation (m)"
        value={floor.source.heightOffset}
        onChange={(heightOffset) => patchSource({ heightOffset })}
      />
      <div className="fp-row">
        <Button size="sm" onClick={() => state.apply()}>
          Apply floor properties
        </Button>
        <Button size="sm" variant="outline" onClick={state.cancel}>
          Discard floor edit
        </Button>
        <Button size="sm" variant="outline" onClick={() => state.reorderFloor(-1)}>
          Move up
        </Button>
        <Button size="sm" variant="outline" onClick={() => state.reorderFloor(1)}>
          Move down
        </Button>
      </div>
      <div className="fp-two">
        <NumberInput
          label="Floor width (m)"
          value={width}
          min={0.1}
          onChange={(value) => resizeBoundary(value, depth)}
        />
        <NumberInput
          label="Floor depth (m)"
          value={depth}
          min={0.1}
          onChange={(value) => resizeBoundary(width, value)}
        />
      </div>
      <p className="fp-muted">
        Dimensions resize the boundary. With calibration corners, they define the known metric
        distances instead.
      </p>
      <Field label="Floor image">
        <Input
          aria-label="Floor image"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={uploading || unfinished(state)}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file || unfinished(store.getState())) {
              return;
            }
            if (
              !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
              file.size > 50 * 1024 * 1024
            ) {
              state.notify('Choose a PNG, JPEG or WebP image up to 50 MiB.');
              return;
            }
            const floorId = applied.source.id,
              { revision } = state;
            setUploading(true);
            void uploadMedia(file)
              .then((uploaded) => {
                const latest = store.getState(),
                  current = activeFloor(latest);
                if (
                  current.source.id !== floorId ||
                  latest.revision !== revision ||
                  unfinished(latest)
                ) {
                  latest.notify(
                    'The document changed during upload. The current image was preserved; upload again when ready.',
                  );
                  return;
                }
                const iw = uploaded.originalWidth ?? uploaded.width,
                  ih = uploaded.originalHeight ?? uploaded.height;
                if (!iw || !ih) {
                  throw new Error('The image service did not return image dimensions.');
                }
                const sx = width / iw,
                  sz = depth / ih;
                const accepted = latest.updateFloor({
                  source: {
                    ...current.source,
                    image: uploaded.url,
                    calibrationStatus: 'required',
                    coordinateSystem: {
                      units: 'pixels',
                      metersPerPixel: sx,
                      origin: [-bounds.minX / sx, -bounds.minZ / sz],
                      basis: [sx, 0, 0, sz],
                    },
                    authoring: {
                      ...current.source.authoring,
                      boundary: current.boundary,
                      spawn: current.spawn,
                      obstacles: current.source.authoring?.obstacles ?? [],
                      instances: current.source.authoring?.instances ?? [],
                      underlayOpacity: current.source.authoring?.underlayOpacity ?? 0.85,
                      imageSize: [iw, ih],
                      originalImage: uploaded.originalUrl ?? uploaded.url,
                      tiles: undefined,
                    },
                  },
                });
                if (accepted) {
                  latest.notify(
                    'Image uploaded. Calibrate with known dimensions, or explicitly confirm the current scale.',
                  );
                }
              })
              .catch((error: unknown) =>
                store
                  .getState()
                  .notify(error instanceof Error ? error.message : 'Image upload failed.'),
              )
              .finally(() => setUploading(false));
          }}
        />
      </Field>
      {uploading && <p role="status">Uploading image…</p>}
      <Field label="Calibration corners (source pixels)">
        <Textarea
          aria-label="Calibration corners"
          rows={2}
          placeholder="[[0,0],[1000,0],[0,800]]"
          value={corners}
          onChange={(event) => state.patchFloor({ calibrationText: event.target.value })}
        />
      </Field>
      <p className="fp-muted">
        Corner, width endpoint, depth endpoint. Apply reprojects the applied geometry once and
        preserves alignment of legacy records.
      </p>
      <Button
        variant="outline"
        size="sm"
        disabled={!floor.source.image}
        onClick={() => {
          state.patchFloor({ calibrationText: corners });
          store.getState().apply();
        }}
      >
        Calibrate using corners
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          state.patchFloor({
            calibrationText: undefined,
            source: { ...floor.source, calibrationStatus: 'confirmed' },
          });
          store.getState().apply();
        }}
      >
        Confirm current scale
      </Button>
      {floor.source.image && (
        <Button
          variant="outline"
          size="sm"
          disabled={unfinished(state) || uploading}
          onClick={() => setRemoveImageRevision(state.revision)}
        >
          Remove floor image
        </Button>
      )}
      <div className="fp-two">
        <NumberInput
          label="Avatar start X (m)"
          value={floor.spawn[0]}
          onChange={(x) => state.patchFloor({ spawn: [x, floor.spawn[1]] })}
        />
        <NumberInput
          label="Avatar start Z (m)"
          value={floor.spawn[1]}
          onChange={(z) => state.patchFloor({ spawn: [floor.spawn[0], z] })}
        />
      </div>
      <Button variant="outline" size="sm" onClick={() => state.setTool('spawn')}>
        Place start on floor
      </Button>
      <Dialog
        open={removeImageRevision !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRemoveImageRevision(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove floor image?</DialogTitle>
            <DialogDescription>
              The metric floor geometry, objects and navigation records will be preserved.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveImageRevision(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const latest = store.getState(),
                  current = activeFloor(latest);
                if (
                  latest.revision !== removeImageRevision ||
                  unfinished(latest) ||
                  current.source.id !== applied.source.id
                ) {
                  latest.notify('The document changed. Review it before removing the image.');
                  setRemoveImageRevision(null);
                  return;
                }
                const old = current.source.authoring;
                latest.updateFloor({
                  source: {
                    ...current.source,
                    image: '',
                    calibrationStatus: 'confirmed',
                    coordinateSystem: { units: 'meters' },
                    authoring: {
                      ...old,
                      boundary: current.boundary,
                      spawn: current.spawn,
                      obstacles: old?.obstacles ?? [],
                      instances: old?.instances ?? [],
                      underlayOpacity: old?.underlayOpacity ?? 0.85,
                      originalImage: undefined,
                      imageSize: undefined,
                      tiles: undefined,
                    },
                  },
                });
                setRemoveImageRevision(null);
              }}
            >
              Remove image
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
export function Inspector({ store }: { store: StudioStore }) {
  const state = store(),
    floor = activeFloor(state),
    { selection } = state;
  if (state.pendingRemoval) {
    return (
      <div className="fp-form">
        <p>Removal preview. Apply to save this deletion, or discard to restore the item.</p>
        <Button onClick={() => state.apply()}>Apply removal</Button>
        <Button variant="outline" onClick={state.cancel}>
          Discard removal
        </Button>
      </div>
    );
  }
  const object =
    state.pendingObject ??
    floor.objects.find((item) => selection?.kind === 'object' && item.id === selection.id);
  const zone =
    state.pendingZone ??
    floor.zones.find((item) => selection?.kind === 'zone' && item.id === selection.id);
  if (object) {
    return <ObjectFields key={object.id} store={store} object={object} />;
  }
  if (zone) {
    return (
      <div className="fp-form">
        <Field label="Zone name">
          <Input
            aria-label="Zone name"
            aria-invalid={!zone.label.trim()}
            value={zone.label}
            onChange={(event) => state.patchZone({ label: event.target.value })}
          />
        </Field>
        <Field label="Zone type">
          <select
            aria-label="Zone type"
            value={zone.type}
            onChange={(event) => state.patchZone({ type: event.target.value as typeof zone.type })}
          >
            <option value="walkable">Walkable</option>
            <option value="blocked">Blocked</option>
            <option value="display">Display</option>
          </select>
        </Field>
        <Vertices
          key={zone.id}
          value={zone.polygon}
          label="Zone vertices (world meters)"
          onChange={(polygon) => state.patchZone({ polygon })}
        />
        <div className="fp-row">
          <Button onClick={() => state.apply()}>Apply zone</Button>
          <Button variant="outline" onClick={state.cancel}>
            Discard
          </Button>
        </div>
        <div className="fp-row">
          <Button variant="outline" onClick={() => state.setTool('move')}>
            Move zone
          </Button>
          <Button variant="outline" onClick={() => state.setTool('duplicate')}>
            Duplicate zone
          </Button>
          <Button variant="outline" onClick={() => state.remove()}>
            Remove zone
          </Button>
        </div>
      </div>
    );
  }
  return (
    <p className="fp-muted">
      Select an object or zone to inspect its properties. Use the directory to select without
      picking in the scene.
    </p>
  );
}
