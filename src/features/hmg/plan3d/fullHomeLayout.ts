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

export interface FullHomeLayout {
  unit: "ft";
  rooms: FullHomeLayoutRoom[];
  bounds: { lengthFt: number; widthFt: number; heightFt: number };
  totalAreaSqFt: number;
  warnings: string[];
}

export const MIN_SCHEMATIC_ROOM_GAP_FT = 0.25;
const GAP_FT = MIN_SCHEMATIC_ROOM_GAP_FT;
const DEFAULT_HEIGHT_FT = 10;
const SCHEMATIC_WARNING = "Schematic arrangement derived from reviewed room dimensions; exact wall adjacency requires readable plan coordinates or manual calibration.";

function round(value: number) {
  return Number(value.toFixed(3));
}

function isUsableRoom(room: HmgReviewedPlanRoom) {
  return Number.isFinite(room.lengthFt) && Number.isFinite(room.widthFt) && room.lengthFt > 0 && room.widthFt > 0;
}

export function createFullHomeLayout(rooms: HmgReviewedPlanRoom[]): FullHomeLayout {
  const warnings = [SCHEMATIC_WARNING];
  const usable = rooms.filter((room) => {
    const ok = isUsableRoom(room);
    if (!ok) warnings.push(`Skipped ${room.name || room.id} because its reviewed length/width is not usable for 3D.`);
    return ok;
  });

  if (!usable.length) {
    return {
      unit: "ft",
      rooms: [],
      bounds: { lengthFt: 0, widthFt: 0, heightFt: DEFAULT_HEIGHT_FT },
      totalAreaSqFt: 0,
      warnings,
    };
  }

  const totalArea = usable.reduce((sum, room) => sum + room.lengthFt * room.widthFt, 0);
  const longest = Math.max(...usable.map((room) => room.lengthFt));
  const targetRowLength = Math.max(longest, Math.sqrt(totalArea) * 1.35);
  const placed: FullHomeLayoutRoom[] = [];
  let cursorX = 0;
  let cursorZ = 0;
  let rowWidth = 0;
  let maxX = 0;
  let maxHeight = DEFAULT_HEIGHT_FT;

  usable.forEach((room) => {
    if (cursorX > 0 && cursorX + room.lengthFt > targetRowLength) {
      cursorX = 0;
      cursorZ += rowWidth + GAP_FT;
      rowWidth = 0;
    }
    const item: FullHomeLayoutRoom = {
      id: room.id,
      name: room.name,
      category: room.category,
      xFt: round(cursorX),
      zFt: round(cursorZ),
      lengthFt: round(room.lengthFt),
      widthFt: round(room.widthFt),
      heightFt: round(room.heightFt || DEFAULT_HEIGHT_FT),
      areaSqFt: round(room.lengthFt * room.widthFt),
      includeFloor: room.includeFloor,
      includeInteriorWalls: room.includeInteriorWalls,
    };
    placed.push(item);
    cursorX += room.lengthFt + GAP_FT;
    rowWidth = Math.max(rowWidth, room.widthFt);
    maxX = Math.max(maxX, cursorX - GAP_FT);
    maxHeight = Math.max(maxHeight, item.heightFt);
  });

  const maxZ = placed.reduce((max, room) => Math.max(max, room.zFt + room.widthFt), 0);
  return {
    unit: "ft",
    rooms: placed,
    bounds: { lengthFt: round(maxX), widthFt: round(maxZ), heightFt: round(maxHeight) },
    totalAreaSqFt: round(totalArea),
    warnings,
  };
}

