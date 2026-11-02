export {
  KinematicCapsule,
  KINEMATIC_CAPSULE_DIMENSIONS,
  type CapsuleMoveResult,
  type KinematicCapsuleHandle,
  type KinematicCapsuleProps,
} from './kinematic-capsule.tsx';
export {
  buildWalkItemRegistry,
  type AuthoredInstanceRegistryInput,
  type BuildWalkItemRegistryInput,
  type WalkAssetRegistryRow,
  type WalkConnectorRegistryRow,
  type WalkInstanceRegistryRow,
  type WalkItemRegistry,
} from './item-registry.ts';
export {
  checkConnectorRouteAccess,
  checkRoleGate,
  checkRouteAreaAccess,
  checkWalkUseAccess,
  projectBoothForRole,
  ROLE_POLICY_SECURITY_SCOPE,
  type BoothRoleProjection,
  type ConnectorRoutePolicy,
  type RoleAccess,
  type RoleGate,
  type RouteAreaPolicy,
  type WalkUseHandlerPolicy,
} from './role-policy.ts';
