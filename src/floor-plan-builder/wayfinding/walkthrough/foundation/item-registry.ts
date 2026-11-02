import boothSizeMetadata from '@/assets/metadata/booth-sizes.v1.json';
import { getProceduralAssetIds } from '@/features/assets/catalog/procedural-assets.ts';
import { getAssetCatalog } from '@/features/assets/model/catalog.ts';
import type { ConnectorDescriptor, InteractionDescriptor, Role } from '../contracts.ts';
import {
  checkConnectorRouteAccess,
  checkWalkUseAccess,
  type RoleGate,
  type WalkUseHandlerPolicy,
} from './role-policy.ts';

type RegistryUse =
  | { status: 'available'; handlerId: string; requiresConfirmation: boolean }
  | { status: 'unavailable'; reason: string };

export interface WalkAssetRegistryRow {
  kind: 'booth' | 'catalog-item';
  id: string;
  label: string;
  inspect: { status: 'available'; source: 'asset-metadata' } | { status: 'unavailable'; reason: string };
  use: RegistryUse;
  collision: 'authored-collider-metadata' | 'unknown';
  navigation: 'not-a-route-node';
}

export interface AuthoredInstanceRegistryInput {
  id: string;
  assetId: string;
  label?: string;
  floorId: string;
  collidable?: boolean;
}

export interface WalkInstanceRegistryRow {
  kind: 'authored-instance';
  id: string;
  label: string;
  assetId: string;
  floorId: string;
  inspect: { status: 'available'; source: 'document-instance' };
  use: RegistryUse;
  collision: 'enabled-obstacle-input' | 'excluded-from-obstacle-input' | 'unknown';
  navigation: 'floor-obstacle-input' | 'not-an-obstacle' | 'unknown';
}

export interface WalkConnectorRegistryRow {
  kind: 'connector';
  id: string;
  label: string;
  descriptor: ConnectorDescriptor;
  inspect: { status: 'available'; source: 'connector-descriptor' };
  use: RegistryUse;
  collision: 'requires-physical-validation';
  navigation: 'enabled-route-candidate' | 'disabled' | 'role-blocked';
  routeAccessReason?: string;
}

export interface WalkItemRegistry {
  role: Role;
  assets: readonly WalkAssetRegistryRow[];
  instances: readonly WalkInstanceRegistryRow[];
  connectors: readonly WalkConnectorRegistryRow[];
}

export interface BuildWalkItemRegistryInput {
  role: Role;
  instances?: readonly AuthoredInstanceRegistryInput[];
  connectors?: readonly ConnectorDescriptor[];
  interactions?: readonly InteractionDescriptor[];
  useHandlers?: readonly WalkUseHandlerPolicy[];
  connectorRolePolicies?: Readonly<Record<string, RoleGate>>;
  accessibleOnly?: boolean;
}

const metadataById = new Map(getAssetCatalog().map((item) => [item.id, item]));
const sizedBoothIds = new Set((boothSizeMetadata as readonly { id: string }[]).map((item) => item.id));

function useForTarget(
  role: Role,
  targetId: string,
  interactions: readonly InteractionDescriptor[],
  handlers: readonly WalkUseHandlerPolicy[],
): RegistryUse {
  const descriptor = interactions.find((item) => item.targetId === targetId);
  const useAction = descriptor?.actions.find((action) => action.kind === 'use');
  if (!descriptor || !useAction || useAction.kind !== 'use') {
    return { status: 'unavailable', reason: 'No existing use handler is declared.' };
  }
  const handler = handlers.find((item) => item.capability === useAction.capability && item.handlerId.trim());
  if (!handler) return { status: 'unavailable', reason: 'No existing use handler is registered.' };
  const access = checkWalkUseAccess(role, descriptor, useAction.capability, handlers, !useAction.commits);
  if (!access.allowed && !access.reason.startsWith('Confirmation is required')) {
    return { status: 'unavailable', reason: access.reason };
  }
  return {
    status: 'available',
    handlerId: handler.handlerId,
    requiresConfirmation: useAction.requiresConfirmation,
  };
}

/**
 * Build row-level inventory coverage from the repository's canonical 14 + 8 + 27 ID union,
 * plus actual authored instances and connector descriptors provided by the current document.
 * Handler availability is opt-in from a real integration adapter; metadata never invents it.
 * This is source data for the later inspect surface and does not claim that UI is already mounted.
 */
export function buildWalkItemRegistry(input: BuildWalkItemRegistryInput): WalkItemRegistry {
  const interactions = input.interactions ?? [];
  const handlers = input.useHandlers ?? [];
  const assets = getProceduralAssetIds().map<WalkAssetRegistryRow>((id) => {
    const metadata = metadataById.get(id);
    return {
      kind: sizedBoothIds.has(id) ? 'booth' : 'catalog-item',
      id,
      label: metadata?.label ?? id,
      inspect: metadata
        ? { status: 'available', source: 'asset-metadata' }
        : { status: 'unavailable', reason: 'No asset metadata is available.' },
      use: useForTarget(input.role, id, interactions, handlers),
      collision: metadata?.colliders?.length ? 'authored-collider-metadata' : 'unknown',
      navigation: 'not-a-route-node',
    };
  });

  const instances = (input.instances ?? []).map<WalkInstanceRegistryRow>((instance) => ({
    kind: 'authored-instance',
    id: instance.id,
    label: instance.label ?? metadataById.get(instance.assetId)?.label ?? instance.assetId,
    assetId: instance.assetId,
    floorId: instance.floorId,
    inspect: { status: 'available', source: 'document-instance' },
    use: useForTarget(input.role, instance.id, interactions, handlers),
    collision:
      instance.collidable === true
        ? 'enabled-obstacle-input'
        : instance.collidable === false
          ? 'excluded-from-obstacle-input'
          : 'unknown',
    navigation:
      instance.collidable === true
        ? 'floor-obstacle-input'
        : instance.collidable === false
          ? 'not-an-obstacle'
          : 'unknown',
  }));

  const connectors = (input.connectors ?? []).map<WalkConnectorRegistryRow>((descriptor) => {
    const access = checkConnectorRouteAccess(input.role, {
      descriptor,
      ...input.connectorRolePolicies?.[descriptor.id],
      accessibleOnly: input.accessibleOnly,
    });
    return {
      kind: 'connector',
      id: descriptor.id,
      label: `${descriptor.kind} connector`,
      descriptor,
      inspect: { status: 'available', source: 'connector-descriptor' },
      use: useForTarget(input.role, descriptor.id, interactions, handlers),
      collision: 'requires-physical-validation',
      navigation: !descriptor.enabled
        ? 'disabled'
        : access.allowed
          ? 'enabled-route-candidate'
          : 'role-blocked',
      ...(!access.allowed ? { routeAccessReason: access.reason } : {}),
    };
  });

  return { role: input.role, assets, instances, connectors };
}
