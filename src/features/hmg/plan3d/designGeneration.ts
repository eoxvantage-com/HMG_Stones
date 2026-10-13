import { roomIds } from "../studio3d/geometry";
import type { StudioDesignV1 } from "../studio3d/types";
import { feetToMeters } from "./dimensions";
import type { HmgReviewedPlanRoom } from "./planTypes";

function safeIdPart(value: string) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized.slice(0, 40) || "room";
}

export function createStudioDesignFromReviewedRoom(input: {
  projectId: string;
  floorName: string;
  room: HmgReviewedPlanRoom;
  index: number;
}): StudioDesignV1 {
  const length = feetToMeters(input.room.lengthFt);
  const width = feetToMeters(input.room.widthFt);
  const height = feetToMeters(input.room.heightFt);
  const roomId = `plan-${safeIdPart(input.room.id)}-${input.index + 1}`.slice(0, 80);
  const ids = roomIds(roomId);
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    projectId: input.projectId,
    name: `${input.floorName} - ${input.room.name}`.slice(0, 120),
    geometryRevision: 1,
    room: {
      id: roomId,
      name: input.room.name.slice(0, 120),
      length,
      width,
      height,
      unit: "m",
      ...ids,
    },
    activeOption: "A",
    options: { A: { assignments: {} }, B: { assignments: {} } },
    camera: {
      position: [Number((length * 1.3).toFixed(4)), 6, Number((width * 1.5).toFixed(4))],
      target: [Number((length / 2).toFixed(4)), 1, Number((width / 2).toFixed(4))],
    },
    objects: [],
  };
}
