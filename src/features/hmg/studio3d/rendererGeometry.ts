import { pointInRoom, toBlueprintFloorplan } from './geometry';
import type { StudioDesign, StudioRoom, StudioSurface } from './types';

/**
 * Blueprint3D treats imported wall coordinates as wall centerlines and offsets
 * its interior faces by half the configured wall thickness. The HMG polygon
 * is already the measured interior perimeter, so v2 must use zero thickness
 * to keep the rendered floor and inside wall faces on that exact boundary.
 * Keep Blueprint's historical 10cm default for schema v1 documents.
 */
export function rendererWallThicknessCm(design: StudioDesign): number {
  return design.schemaVersion === 2 ? 0 : 10;
}

/** Map a saved design to the floorplan payload consumed by BP3D.Model.Floorplan. */
export function rendererFloorplan(design: StudioDesign) {
  if (design.schemaVersion === 1) return toBlueprintFloorplan(design);
  const perimeter = design.room.perimeter;
  const corners = Object.fromEntries(perimeter.map((vertex) => [vertex.id, { x: vertex.xM * 100, y: vertex.zM * 100 }]));
  return {
    corners,
    walls: perimeter.map((vertex, index) => ({
      corner1: vertex.id,
      corner2: perimeter[(index + 1) % perimeter.length].id,
      frontTexture: { url: '', stretch: false, scale: 100 },
      backTexture: { url: '', stretch: false, scale: 100 },
    })),
    wallTextures: [],
    floorTextures: {},
    newFloorTextures: {},
  };
}

type ScreenPoint = readonly [number, number];

function distanceToSegment(point: ScreenPoint, start: ScreenPoint, end: ScreenPoint): number {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  const t = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared));
  return Math.hypot(point[0] - (start[0] + t * dx), point[1] - (start[1] + t * dy));
}

/** Shared picking contract used by the canvas runtime and tested independently. */
export function pickStudioSurfaceAtPoint(
  room: StudioRoom,
  wallSurfaces: StudioSurface[],
  projectedVertices: ScreenPoint[],
  screenPoint: ScreenPoint,
  worldPointM: { xM: number; zM: number },
  wallRadiusPx = 14,
): string | null {
  let nearest = -1;
  let nearestDistance = Infinity;
  for (let index = 0; index < projectedVertices.length; index += 1) {
    const next = distanceToSegment(screenPoint, projectedVertices[index], projectedVertices[(index + 1) % projectedVertices.length]);
    if (next < nearestDistance) {
      nearestDistance = next;
      nearest = index;
    }
  }
  if (nearestDistance <= wallRadiusPx) return wallSurfaces[nearest]?.id ?? null;
  return pointInRoom(room, worldPointM) ? `${room.id}:floor` : null;
}
