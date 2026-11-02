import type { BoothMeta, ConnectorDescriptor, InteractionDescriptor, Role } from '../contracts.ts';

export interface BoothRoleProjection extends Omit<BoothMeta, 'fields' | 'fieldVisibility'> {
  fields: Readonly<Record<string, string | number | boolean | null>>;
}

/** Project only the fields declared visible for the explicit local runtime role. */
export function projectBoothForRole(booth: BoothMeta, role: Role): BoothRoleProjection {
  const visible = new Set(booth.fieldVisibility[role]);
  const fields = Object.fromEntries(Object.entries(booth.fields).filter(([key]) => visible.has(key)));
  return {
    id: booth.id,
    label: booth.label,
    floorId: booth.floorId,
    boundsM: booth.boundsM,
    fields,
  };
}

export interface RoleGate {
  /** Omitted means the source has no role-specific restriction; it is not inferred. */
  allowedRoles?: readonly Role[];
}

export type RoleAccess = { allowed: true } | { allowed: false; reason: string };

export function checkRoleGate(role: Role, gate: RoleGate = {}): RoleAccess {
  return gate.allowedRoles && !gate.allowedRoles.includes(role)
    ? { allowed: false, reason: `This action is unavailable to the ${role} role.` }
    : { allowed: true };
}

export interface RouteAreaPolicy extends RoleGate {
  id: string;
}

export interface ConnectorRoutePolicy extends RoleGate {
  descriptor: ConnectorDescriptor;
  accessibleOnly?: boolean;
}

/** Local route eligibility. Missing role ACL is treated as no role restriction, not authentication. */
export function checkRouteAreaAccess(role: Role, area: RouteAreaPolicy): RoleAccess {
  return checkRoleGate(role, area);
}

export function checkConnectorRouteAccess(role: Role, policy: ConnectorRoutePolicy): RoleAccess {
  const roleAccess = checkRoleGate(role, policy);
  if (!roleAccess.allowed) {return roleAccess;}
  if (!policy.descriptor.enabled) {return { allowed: false, reason: 'This connector is disabled.' };}
  if (policy.accessibleOnly && !policy.descriptor.accessible) {
    return { allowed: false, reason: 'This route requires an accessible connector.' };
  }
  return { allowed: true };
}

export interface WalkUseHandlerPolicy extends RoleGate {
  capability: string;
  commits: boolean;
  /** Must identify an existing handler supplied by the caller; metadata sockets do not qualify. */
  handlerId: string;
  /** Executable binding supplied by the integration, not a descriptive ID alone. */
  execute: (...args: any[]) => unknown;
}

/**
 * A use capability is available only when the integration supplied a real handler policy.
 * Committing uses must be explicitly confirmed; no action is synthesized from socket metadata.
 */
export function checkWalkUseAccess(
  role: Role,
  descriptor: InteractionDescriptor,
  capability: string | undefined,
  handlers: readonly WalkUseHandlerPolicy[],
  confirmed = false,
): RoleAccess {
  const action = descriptor.actions.find(
    (candidate) => candidate.kind === 'use' && candidate.capability === capability,
  );
  if (!action || action.kind !== 'use') {
    return { allowed: false, reason: 'No use action is declared for this target.' };
  }
  const matches = handlers.filter(
    (candidate) => candidate.capability === action.capability && candidate.handlerId.trim() && typeof candidate.execute === 'function',
  );
  if (matches.length === 0) {return { allowed: false, reason: 'No executable use handler is registered.' };}
  if (matches.length > 1) {return { allowed: false, reason: 'Multiple executable handlers are registered for this capability.' };}
  const handler = matches[0]!;
  if (handler.commits !== action.commits || action.requiresConfirmation !== action.commits) {
    return { allowed: false, reason: 'The registered handler does not match the action confirmation contract.' };
  }
  const roleAccess = checkRoleGate(role, handler);
  if (!roleAccess.allowed) {return roleAccess;}
  if (handler.commits && !confirmed) {
    return { allowed: false, reason: 'Confirmation is required before this action can run.' };
  }
  return { allowed: true };
}

/** Runtime roles drive client behavior only; this policy does not authenticate or secure delivered data. */
export const ROLE_POLICY_SECURITY_SCOPE = 'client-local' as const;
