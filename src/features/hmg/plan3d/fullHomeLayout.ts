import type { HmgPlanExtractionDraft, HmgPlanFeature, HmgPlanFootprint, HmgPlanRect } from "../types";
import type { HmgReviewedPlanRoom } from "./planTypes";

export interface FullHomeLayoutRoom {
  id: string;
  name: string;
  category: HmgReviewedPlanRoom["category"];
  xFt: number;
  zFt: number;
  lengthFt: number;
  widthFt: number;
  heightFt: number;
  areaSqFt: number;
  includeFloor: boolean;
  includeInteriorWalls: boolean;
}

export interface FullHomeLayoutOptions {
  builtUpAreaSqFt?: number;
  buildingFacing?: HmgPlanExtractionDraft["buildingFacing"];
  floorName?: string;
  footprint?: HmgPlanFootprint;
  roomRects?: Record<string, HmgPlanRect>;
  features?: HmgPlanFeature[];
}

export interface FullHomeLayout {
  unit: "ft";
  rooms: FullHomeLayoutRoom[];
  bounds: { lengthFt: number; widthFt: number; heightFt: number };
  totalAreaSqFt: number;
  builtUpAreaSqFt?: number;
  modeledAreaRatio?: number;
  unmodeledAreaSqFt?: number;
  features: string[];
  planFeatures: HmgPlanFeature[];
  warnings: string[];
}

export const MIN_SCHEMATIC_ROOM_GAP_FT = 0;
const DEFAULT_HEIGHT_FT = 10;
const SCHEMATIC_WARNING = "Schematic arrangement derived from reviewed room dimensions; exact wall adjacency requires readable plan coordinates or manual calibration.";
const ADJACENCY_WARNING = "Room positions are adjacency-assisted from extracted names and dimensions; verify against the uploaded plan before final quotation.";

function round(value: number) {
  return Number(value.toFixed(3));
}

function isUsableRoom(room: HmgReviewedPlanRoom) {
  return Number.isFinite(room.lengthFt) && Number.isFinite(room.widthFt) && room.lengthFt > 0 && room.widthFt > 0;
}

function overlaps(a: Pick<FullHomeLayoutRoom, "xFt" | "zFt" | "lengthFt" | "widthFt">, b: Pick<FullHomeLayoutRoom, "xFt" | "zFt" | "lengthFt" | "widthFt">) {
  return a.xFt < b.xFt + b.lengthFt && a.xFt + a.lengthFt > b.xFt && a.zFt < b.zFt + b.widthFt && a.zFt + a.widthFt > b.zFt;
}

function collides(candidate: Pick<FullHomeLayoutRoom, "xFt" | "zFt" | "lengthFt" | "widthFt">, placed: FullHomeLayoutRoom[]) {
  return placed.some((room) => overlaps(candidate, room));
}

function layoutRoom(room: HmgReviewedPlanRoom, xFt: number, zFt: number, rect?: Partial<HmgPlanRect>): FullHomeLayoutRoom {
  return {
    id: room.id,
    name: room.name,
    category: room.category,
    xFt: round(xFt),
    zFt: round(zFt),
    lengthFt: round(rect?.lengthFt ?? room.lengthFt),
    widthFt: round(rect?.widthFt ?? room.widthFt),
    heightFt: round(room.heightFt || DEFAULT_HEIGHT_FT),
    areaSqFt: round((rect?.lengthFt ?? room.lengthFt) * (rect?.widthFt ?? room.widthFt)),
    includeFloor: room.includeFloor,
    includeInteriorWalls: room.includeInteriorWalls,
  };
}

function candidateFor(room: HmgReviewedPlanRoom, primary: FullHomeLayoutRoom, placed: FullHomeLayoutRoom[]) {
  const eastEdge = Math.max(...placed.map((item) => item.xFt + item.lengthFt), primary.xFt + primary.lengthFt);
  const southEdge = Math.max(...placed.map((item) => item.zFt + item.widthFt), primary.zFt + primary.widthFt);
  const firstKitchen = placed.find((item) => item.category === "kitchen");

  if (room.category === "kitchen" || room.category === "pooja") return { xFt: primary.xFt + primary.lengthFt, zFt: primary.zFt };
  if (room.category === "bedroom") return { xFt: Math.max(primary.xFt, primary.xFt + primary.lengthFt - room.lengthFt), zFt: primary.zFt + primary.widthFt };
  if (room.category === "toilet") return { xFt: firstKitchen ? firstKitchen.xFt : primary.xFt, zFt: firstKitchen ? firstKitchen.zFt + firstKitchen.widthFt : primary.zFt + primary.widthFt };
  if (room.category === "stair" || room.category === "sit_out") return { xFt: primary.xFt - room.lengthFt, zFt: primary.zFt };
  return { xFt: eastEdge, zFt: primary.zFt };
}

function placeWithoutOverlap(room: HmgReviewedPlanRoom, preferred: { xFt: number; zFt: number }, placed: FullHomeLayoutRoom[]) {
  let candidate = layoutRoom(room, preferred.xFt, preferred.zFt);
  if (!collides(candidate, placed)) return candidate;

  const anchors = placed.flatMap((anchor) => [
    { xFt: anchor.xFt + anchor.lengthFt, zFt: anchor.zFt },
    { xFt: anchor.xFt, zFt: anchor.zFt + anchor.widthFt },
    { xFt: anchor.xFt - room.lengthFt, zFt: anchor.zFt },
  ]);
  for (const anchor of anchors) {
    candidate = layoutRoom(room, anchor.xFt, anchor.zFt);
    if (!collides(candidate, placed)) return candidate;
  }

  const southEdge = Math.max(...placed.map((item) => item.zFt + item.widthFt), 0);
  return layoutRoom(room, 0, southEdge);
}

function normalizeRooms(rooms: FullHomeLayoutRoom[]) {
  const minX = Math.min(...rooms.map((room) => room.xFt));
  const minZ = Math.min(...rooms.map((room) => room.zFt));
  if (minX >= 0 && minZ >= 0) return rooms;
  return rooms.map((room) => ({ ...room, xFt: round(room.xFt - Math.min(0, minX)), zFt: round(room.zFt - Math.min(0, minZ)) }));
}

function boundsFor(rooms: FullHomeLayoutRoom[], builtUpAreaSqFt?: number, footprint?: HmgPlanFootprint) {
  const roomLength = Math.max(...rooms.map((room) => room.xFt + room.lengthFt), 0);
  const roomWidth = Math.max(...rooms.map((room) => room.zFt + room.widthFt), 0);
  if (footprint) return { lengthFt: round(Math.max(roomLength, footprint.lengthFt)), widthFt: round(Math.max(roomWidth, footprint.widthFt)) };
  if (!builtUpAreaSqFt || builtUpAreaSqFt <= roomLength * roomWidth) return { lengthFt: round(roomLength), widthFt: round(roomWidth) };

  const aspect = roomLength > 0 && roomWidth > 0 ? roomLength / roomWidth : 1;
  const footprintLength = Math.sqrt(builtUpAreaSqFt * aspect);
  const footprintWidth = builtUpAreaSqFt / Math.max(footprintLength, 1);
  return { lengthFt: round(Math.max(roomLength, footprintLength)), widthFt: round(Math.max(roomWidth, footprintWidth)) };
}

export function createFullHomeLayout(rooms: HmgReviewedPlanRoom[], options: FullHomeLayoutOptions = {}): FullHomeLayout {
  const warnings = [SCHEMATIC_WARNING];
  const features: string[] = [];
  const usable = rooms.filter((room) => {
    const ok = isUsableRoom(room);
    if (!ok) warnings.push(`Skipped ${room.name || room.id} because its reviewed length/width is not usable for 3D.`);
    return ok;
  });

  if (options.buildingFacing && options.buildingFacing !== "unknown") {
    features.push(`${options.buildingFacing[0].toUpperCase()}${options.buildingFacing.slice(1)} facing building`);
  }
  if (options.floorName) features.push(options.floorName);

  if (!usable.length) {
    return {
      unit: "ft",
      rooms: [],
      bounds: { lengthFt: 0, widthFt: 0, heightFt: DEFAULT_HEIGHT_FT },
      totalAreaSqFt: 0,
      builtUpAreaSqFt: options.builtUpAreaSqFt,
      features,
      planFeatures: options.features || [],
      warnings,
    };
  }

  const totalArea = usable.reduce((sum, room) => sum + room.lengthFt * room.widthFt, 0);
  const hasExtractedCoordinates = usable.some((room) => {
    const rect = options.roomRects?.[room.id];
    return rect || (typeof room.xFt === "number" && typeof room.zFt === "number");
  });
  let ordered: FullHomeLayoutRoom[];
  if (hasExtractedCoordinates) {
    ordered = usable.map((room) => {
      const rect = options.roomRects?.[room.id];
      return layoutRoom(room, rect?.xFt ?? room.xFt ?? 0, rect?.zFt ?? room.zFt ?? 0, rect);
    });
  } else {
    const primaryIndex = Math.max(0, usable.findIndex((room) => room.category === "hall" || room.category === "other"));
    const primarySource = usable[primaryIndex];
    const byId = new Map<string, FullHomeLayoutRoom>();
    const placed: FullHomeLayoutRoom[] = [];
    const primary = layoutRoom(primarySource, 0, 0);
    placed.push(primary);
    byId.set(primarySource.id, primary);

    usable.forEach((room, index) => {
      if (index === primaryIndex) return;
      const preferred = candidateFor(room, primary, placed);
      const placedRoom = placeWithoutOverlap(room, preferred, placed);
      placed.push(placedRoom);
      byId.set(room.id, placedRoom);
    });
    ordered = normalizeRooms(usable.map((room) => byId.get(room.id)!));
  }
  if (!hasExtractedCoordinates) warnings.push(ADJACENCY_WARNING);
  const maxHeight = Math.max(...ordered.map((room) => room.heightFt), DEFAULT_HEIGHT_FT);
  const builtUpAreaSqFt = options.builtUpAreaSqFt && options.builtUpAreaSqFt > 0 ? round(options.builtUpAreaSqFt) : undefined;
  const unmodeledAreaSqFt = builtUpAreaSqFt ? round(Math.max(builtUpAreaSqFt - totalArea, 0)) : undefined;
  const modeledAreaRatio = builtUpAreaSqFt ? round(totalArea / builtUpAreaSqFt) : undefined;
  const bounds2d = boundsFor(ordered, builtUpAreaSqFt, options.footprint);

  if (builtUpAreaSqFt && unmodeledAreaSqFt && unmodeledAreaSqFt > 1) {
    warnings.push(`Modeled reviewed rooms cover ${(Math.min(modeledAreaRatio || 0, 1) * 100).toFixed(1)}% of the extracted built-up area; stairs, duct, circulation, setbacks or unreadable rooms may still need review.`);
  }

  return {
    unit: "ft",
    rooms: ordered,
    bounds: { ...bounds2d, heightFt: round(maxHeight) },
    totalAreaSqFt: round(totalArea),
    builtUpAreaSqFt,
    modeledAreaRatio,
    unmodeledAreaSqFt,
    features,
    planFeatures: options.features || [],
    warnings,
  };
}
