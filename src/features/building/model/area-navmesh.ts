// Standard pipeline adapted from @recast-navigation/generators, copyright Isaac Mason.
// MIT license: ./recast-LICENSE.txt.
import {
  Recast,
  Raw,
  RecastBuildContext,
  VerticesArray,
  TrianglesArray,
  TriangleAreasArray,
  FloatArray,
  createRcConfig,
  calcGridSize,
  allocHeightfield,
  createHeightfield,
  markWalkableTriangles,
  rasterizeTriangles,
  filterLowHangingWalkableObstacles,
  filterLedgeSpans,
  filterWalkableLowHeightSpans,
  allocCompactHeightfield,
  buildCompactHeightfield,
  erodeWalkableArea,
  markConvexPolyArea,
  buildDistanceField,
  buildRegions,
  allocContourSet,
  buildContours,
  allocPolyMesh,
  buildPolyMesh,
  allocPolyMeshDetail,
  buildPolyMeshDetail,
  NavMeshCreateParams,
  createNavMeshData,
  NavMesh,
  freeHeightfield,
  freeCompactHeightfield,
  freeContourSet,
  freePolyMesh,
  freePolyMeshDetail,
} from '@recast-navigation/core';
import {
  getBoundingBox,
  soloNavMeshGeneratorConfigDefaults,
  type SoloNavMeshGeneratorConfig,
} from '@recast-navigation/generators';
import type { NavAreaPaint as AreaPaint } from './navigation-protocol.ts';

/**
 * Recast's standard solo pipeline with area marking BEFORE region/contour generation.
 * Painting an already simplified Detour polygon can incorrectly restrict an entire hall.
 * Uses the same agent/config/worker as existing routes; no alternate navigation engine.
 */
export function generateAreaNavMesh(
  positions: number[],
  indices: number[],
  paints: AreaPaint[],
  settings: Partial<SoloNavMeshGeneratorConfig> = {},
): NavMesh | null {
  const context = new RecastBuildContext();
  const config = { ...soloNavMeshGeneratorConfigDefaults, ...settings };
  const rc = createRcConfig(config);
  const { bbMin, bbMax } = getBoundingBox(positions, indices);
  const grid = calcGridSize(bbMin, bbMax, rc.cs);
  const vertices = new VerticesArray(),
    triangles = new TrianglesArray(),
    areas = new TriangleAreasArray();
  const field = allocHeightfield(),
    compact = allocCompactHeightfield(),
    contours = allocContourSet();
  const poly = allocPolyMesh(),
    detail = allocPolyMeshDetail(),
    params = new NavMeshCreateParams();
  let mesh: NavMesh | null = null;
  try {
    vertices.copy(positions);
    triangles.copy(indices);
    areas.resize(indices.length / 3);
    if (!createHeightfield(context, field, grid.width, grid.height, bbMin, bbMax, rc.cs, rc.ch)) {
      return null;
    }
    markWalkableTriangles(
      context,
      rc.walkableSlopeAngle,
      vertices,
      positions.length / 3,
      triangles,
      indices.length / 3,
      areas,
    );
    if (
      !rasterizeTriangles(
        context,
        vertices,
        positions.length / 3,
        triangles,
        areas,
        indices.length / 3,
        field,
        rc.walkableClimb,
      )
    ) {
      return null;
    }
    filterLowHangingWalkableObstacles(context, rc.walkableClimb, field);
    filterLedgeSpans(context, rc.walkableHeight, rc.walkableClimb, field);
    filterWalkableLowHeightSpans(context, rc.walkableHeight, field);
    if (!buildCompactHeightfield(context, rc.walkableHeight, rc.walkableClimb, field, compact)) {
      return null;
    }
    if (!erodeWalkableArea(context, rc.walkableRadius, compact)) {
      return null;
    }
    // Caller supplies paint precedence; numeric Detour IDs do not imply priority.
    for (const paint of paints) {
      const ring = new FloatArray();
      try {
        ring.copy(paint.polygon.flatMap(([x, z]) => [x, 0, z]));
        markConvexPolyArea(context, ring, paint.polygon.length, -0.2, 0.4, paint.area, compact);
      } finally {
        ring.destroy();
      }
    }
    if (
      !buildDistanceField(context, compact) ||
      !buildRegions(context, compact, rc.borderSize, rc.minRegionArea ** 2, rc.mergeRegionArea ** 2)
    ) {
      return null;
    }
    if (
      !buildContours(
        context,
        compact,
        rc.maxSimplificationError,
        rc.maxEdgeLen,
        contours,
        Recast.RC_CONTOUR_TESS_WALL_EDGES,
      )
    ) {
      return null;
    }
    if (!buildPolyMesh(context, contours, rc.maxVertsPerPoly, poly)) {
      return null;
    }
    const sample = rc.detailSampleDist < 0.9 ? 0 : rc.cs * rc.detailSampleDist;
    if (
      !buildPolyMeshDetail(context, poly, compact, sample, rc.ch * rc.detailSampleMaxError, detail)
    ) {
      return null;
    }
    for (let i = 0; i < poly.npolys(); i++) {
      if (poly.areas(i) === Recast.RC_WALKABLE_AREA) {
        poly.setAreas(i, 0);
      }
      poly.setFlags(i, paints.find((paint) => paint.area === poly.areas(i))?.flags ?? 1);
    }
    params.setPolyMeshCreateParams(poly);
    params.setPolyMeshDetailCreateParams(detail);
    params.setWalkableHeight(rc.walkableHeight * rc.ch);
    params.setWalkableRadius(rc.walkableRadius * rc.cs);
    params.setWalkableClimb(rc.walkableClimb * rc.ch);
    params.setCellSize(rc.cs);
    params.setCellHeight(rc.ch);
    params.setBuildBvTree(config.buildBvTree);
    if (settings.offMeshConnections) {
      params.setOffMeshConnections(settings.offMeshConnections);
    }
    const data = createNavMeshData(params);
    if (!data.success) {
      return null;
    }
    mesh = new NavMesh();
    if (!mesh.initSolo(data.navMeshData)) {
      data.navMeshData.destroy();
      mesh.destroy();
      mesh = null;
    }
    return mesh;
  } catch (error) {
    mesh?.destroy();
    throw error;
  } finally {
    vertices.destroy();
    triangles.destroy();
    areas.destroy();
    freeHeightfield(field);
    freeCompactHeightfield(compact);
    freeContourSet(contours);
    freePolyMesh(poly);
    freePolyMeshDetail(detail);
    Raw.destroy(params.raw);
    Raw.destroy(rc);
    Raw.destroy(context.raw);
  }
}
