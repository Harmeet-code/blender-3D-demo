import { z } from 'zod';

const idSchema = z.string().trim().min(1);
const finiteNumber = z.number().finite();
const position3Schema = z.tuple([finiteNumber, finiteNumber, finiteNumber]);

export const roleSchema = z.enum(['staff', 'visitor']);
export type Role = z.infer<typeof roleSchema>;

export const movementModeSchema = z.enum(['manual', 'auto-walk']);
export type MovementMode = z.infer<typeof movementModeSchema>;

export const viewModeSchema = z.enum(['first-person', 'third-person']);
export type ViewMode = z.infer<typeof viewModeSchema>;

export const characterConfigSchema = z.object({
  id: z.literal('venue-human-v1'),
  radiusM: z.literal(0.3),
  heightM: z.literal(1.8),
  widthM: z.literal(0.6),
  maxStepM: finiteNumber.positive(),
  walkSpeedMps: finiteNumber.positive(),
  sprintSpeedMps: finiteNumber.positive(),
  /** Manual acceleration profile; auto-walk uses maxAutoAccelerationMps2 instead. */
  accelerationMps2: finiteNumber.positive(),
  brakingMps2: finiteNumber.positive(),
  maxAutoAccelerationMps2: z.literal(2),
  maxYawRateDegPerSec: z.literal(180),
  maxYawDeltaDegPerFrame: z.literal(15),
  cornerSlowdown: z.object({
    startAngleDeg: finiteNumber.positive().max(180),
    minSpeedFactor: finiteNumber.positive().max(1),
  }),
  lookahead: z.object({
    minSeconds: finiteNumber.positive(),
    maxSeconds: finiteNumber.positive(),
  }).refine((value) => value.maxSeconds >= value.minSeconds, {
    message: 'Maximum lookahead must be at least minimum lookahead.',
    path: ['maxSeconds'],
  }),
  gazeLeadSeconds: finiteNumber.min(0.4).max(0.6),
  eyeHeightM: z.literal(1.6),
  gaitStrideM: finiteNumber.positive(),
  camera: z.object({
    firstPersonFovDeg: finiteNumber.positive().max(179),
    chaseOffsetM: position3Schema,
    smoothingHalfLifeSeconds: finiteNumber.positive(),
    maxAngularRateDegPerSec: finiteNumber.positive(),
  }),
}).refine((config) => config.sprintSpeedMps >= config.walkSpeedMps, {
  message: 'Sprint speed must be at least walk speed.',
  path: ['sprintSpeedMps'],
});
export type CharacterConfig = z.infer<typeof characterConfigSchema>;

const interactionActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('inspect'), label: z.string().trim().min(1) }),
  z.object({
    kind: z.literal('use'),
    label: z.string().trim().min(1),
    capability: idSchema.optional(),
    commits: z.boolean(),
    requiresConfirmation: z.boolean(),
  }),
]);

export const interactionDescriptorSchema = z.object({
  id: idSchema,
  targetId: idSchema,
  targetKind: z.enum(['booth', 'catalog-item', 'authored-instance', 'connector']),
  actions: z.array(interactionActionSchema).min(1),
  radiusM: finiteNumber.positive(),
  proximityEffect: z.object({
    kind: z.literal('reversible-door'),
    openOnEnter: z.literal(true),
    closeOnExit: z.literal(true),
  }).optional(),
  infoDwellMs: finiteNumber.nonnegative().optional(),
}).superRefine((descriptor, context) => {
  descriptor.actions.forEach((action, index) => {
    if (action.kind === 'use' && action.requiresConfirmation !== action.commits) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['actions', index, 'requiresConfirmation'],
        message: 'A committing use action requires confirmation, and a non-committing action does not.',
      });
    }
  });
});
export type InteractionDescriptor = z.infer<typeof interactionDescriptorSchema>;
export type InteractionAction = z.infer<typeof interactionActionSchema>;

export const interactionStateSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('idle') }),
  z.object({ status: z.literal('nearby'), descriptorId: idSchema, targetId: idSchema }),
  z.object({ status: z.literal('info'), descriptorId: idSchema, targetId: idSchema }),
  z.object({ status: z.literal('confirmation-required'), descriptorId: idSchema, action: z.literal('use') }),
  z.object({ status: z.literal('committing'), descriptorId: idSchema, action: z.enum(['inspect', 'use']) }),
  z.object({ status: z.literal('completed'), descriptorId: idSchema, action: z.enum(['inspect', 'use']) }),
  z.object({ status: z.literal('denied'), descriptorId: idSchema, reason: z.string().trim().min(1) }),
  z.object({ status: z.literal('failed'), descriptorId: idSchema, reason: z.string().trim().min(1) }),
]);
export type InteractionState = z.infer<typeof interactionStateSchema>;

export const boothMetaSchema = z.object({
  id: idSchema,
  label: z.string(),
  floorId: idSchema,
  boundsM: z.object({ width: finiteNumber.positive(), height: finiteNumber.positive(), depth: finiteNumber.positive() }),
  fields: z.record(z.string(), z.union([z.string(), finiteNumber, z.boolean(), z.null()])),
  fieldVisibility: z.object({ staff: z.array(z.string()), visitor: z.array(z.string()) }),
});
export type BoothMeta = z.infer<typeof boothMetaSchema>;

const connectorStopSchema = z.object({
  floorId: idSchema,
  entry: position3Schema,
  yawRadians: finiteNumber,
});

export const connectorDescriptorSchema = z.object({
  id: idSchema,
  portalId: idSchema,
  kind: z.enum(['stairs', 'ramp', 'elevator', 'escalator']),
  stops: z.array(connectorStopSchema).min(2),
  traversal: z.object({
    points: z.array(position3Schema).min(2),
    speedMps: finiteNumber.positive().optional(),
    transferSeconds: finiteNumber.nonnegative().optional(),
  }),
  accessible: z.boolean(),
  enabled: z.boolean(),
  source: z.object({
    authoredInstanceId: idSchema,
    geometrySource: z.enum(['document', 'existing-asset-metadata']),
  }),
});
export type ConnectorDescriptor = z.infer<typeof connectorDescriptorSchema>;

export interface ConnectorDocumentRelations {
  floors: ReadonlySet<string>;
  portals: ReadonlyMap<string, ReadonlySet<string>>;
  instances: ReadonlyMap<string, { portalId?: string; floorId: string }>;
}

/** Resolve every connector reference and endpoint against the actual linked document records. */
export function createConnectorDescriptorSchema(document: ConnectorDocumentRelations) {
  return connectorDescriptorSchema.superRefine((connector, context) => {
    const portalFloorIds = document.portals.get(connector.portalId);
    if (!portalFloorIds) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['portalId'], message: `Unknown portal ID: ${connector.portalId}` });
    }
    const instance = document.instances.get(connector.source.authoredInstanceId);
    if (!instance) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['source', 'authoredInstanceId'],
        message: `Unknown authored instance ID: ${connector.source.authoredInstanceId}`,
      });
    } else {
      if (instance.portalId !== connector.portalId) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['source', 'authoredInstanceId'], message: 'Authored instance is not bound to this connector portal.' });
      }
      if (!connector.stops.some((stop) => stop.floorId === instance.floorId)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['source', 'authoredInstanceId'], message: 'Authored instance floor is not one of the connector stops.' });
      }
    }
    connector.stops.forEach((stop, index) => {
      if (!document.floors.has(stop.floorId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['stops', index, 'floorId'],
          message: `Unknown floor ID: ${stop.floorId}`,
        });
      }
      if (portalFloorIds && !portalFloorIds.has(stop.floorId)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['stops', index, 'floorId'], message: 'Stop floor is not connected by this portal.' });
      }
    });
    const first = connector.traversal.points[0];
    const last = connector.traversal.points.at(-1);
    const endpoints = connector.stops.map((stop) => stop.entry);
    const samePosition = (a: readonly number[], b: readonly number[]) => a.every((value, axis) => Math.abs(value - b[axis]!) <= 0.001);
    if (first && last && endpoints.length >= 2 && !(
      samePosition(first, endpoints[0]!) && samePosition(last, endpoints.at(-1)!) ||
      samePosition(first, endpoints.at(-1)!) && samePosition(last, endpoints[0]!)
    )) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['traversal', 'points'], message: 'Traversal endpoints must match the connector stop entries within 1 mm.' });
    }
  });
}

export const autoWalkRequestSchema = z.object({
  requestId: idSchema,
  schemaVersion: z.literal(1),
  from: z.object({ floorId: idSchema, position: position3Schema }),
  to: z.object({ floorId: idSchema, position: position3Schema }),
  role: roleSchema,
  characterConfigId: z.literal('venue-human-v1'),
  restrictions: z.object({
    accessibleOnly: z.boolean(),
    allowedPortalIds: z.array(idSchema).optional(),
  }),
});
export type AutoWalkRequest = z.infer<typeof autoWalkRequestSchema>;

/** Add document-dependent referential checks at the boundary where the document is available. */
export function createAutoWalkRequestSchema(
  knownFloorIds: ReadonlySet<string>,
  knownPortalIds?: ReadonlySet<string>,
) {
  return autoWalkRequestSchema.superRefine((request, context) => {
    for (const endpoint of ['from', 'to'] as const) {
      if (!knownFloorIds.has(request[endpoint].floorId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [endpoint, 'floorId'],
          message: `Unknown floor ID: ${request[endpoint].floorId}`,
        });
      }
    }
    for (const portalId of request.restrictions.allowedPortalIds ?? []) {
      if (knownPortalIds && !knownPortalIds.has(portalId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['restrictions', 'allowedPortalIds'],
          message: `Unknown portal ID: ${portalId}`,
        });
      }
    }
  });
}

export const telemetryFrameSchema = z.object({
  tick: z.number().int().nonnegative(),
  dtSeconds: finiteNumber.nonnegative(),
  floorId: idSchema,
  position: position3Schema,
  velocity: position3Schema,
  yawRadians: finiteNumber,
  traveledMeters: finiteNumber.nonnegative(),
  gaitDistanceMeters: finiteNumber.nonnegative(),
  locomotion: z.enum(['idle', 'walk', 'run', 'connector', 'blocked']),
  connectorId: idSchema.optional(),
});
export type TelemetryFrame = z.infer<typeof telemetryFrameSchema>;

/** Role is a caller-supplied local runtime policy input; this schema does not authenticate it. */
export const walkRuntimeInputSchema = z.object({
  role: roleSchema,
  movementMode: movementModeSchema,
  viewMode: viewModeSchema,
});
export type WalkRuntimeInput = z.infer<typeof walkRuntimeInputSchema>;
