import type { HmgPlanExtractionRoom, HmgReviewedPlanRoom } from "../types";

export type ReviewRoomDraft = Omit<HmgReviewedPlanRoom, "lengthFt" | "widthFt" | "heightFt"> & {
  lengthFt: number | "";
  widthFt: number | "";
  heightFt: number | "";
};

const MIN_STUDIO_DIMENSION_FT = 3.3;
const MAX_STUDIO_DIMENSION_FT = 100;
const MIN_HEIGHT_FT = 6;
const MAX_HEIGHT_FT = 20;

export function draftToReviewRoom(room: HmgPlanExtractionRoom): ReviewRoomDraft {
  return {
    id: room.id,
    name: room.label,
    category: room.category,
    lengthFt: room.lengthFt ?? "",
    widthFt: room.widthFt ?? "",
    heightFt: room.heightFt ?? 10,
    includeFloor: room.includeFloor,
    includeInteriorWalls: room.includeInteriorWalls,
    xFt: room.xFt,
    zFt: room.zFt,
  };
}

export function reviewedToDraft(room: HmgReviewedPlanRoom): ReviewRoomDraft {
  return { ...room };
}

function hasStudioSafeExtractedDimensions(room: HmgPlanExtractionRoom): boolean {
  return typeof room.lengthFt === "number" && Number.isFinite(room.lengthFt) && room.lengthFt >= MIN_STUDIO_DIMENSION_FT &&
    typeof room.widthFt === "number" && Number.isFinite(room.widthFt) && room.widthFt >= MIN_STUDIO_DIMENSION_FT;
}

export function reviewRoomsForUpload(upload: { status?: string; extraction?: { rooms?: HmgPlanExtractionRoom[] }; reviewed?: { rooms?: HmgReviewedPlanRoom[] } } | undefined): ReviewRoomDraft[] {
  if (!upload) return [];
  if (upload.status === "Ready for 3D" && upload.reviewed?.rooms?.length) return upload.reviewed.rooms.map(reviewedToDraft);
  if (upload.extraction?.rooms?.length) {
    const modelable = upload.extraction.rooms.filter(hasStudioSafeExtractedDimensions);
    return (modelable.length ? modelable : upload.extraction.rooms).map(draftToReviewRoom);
  }
  if (upload.reviewed?.rooms?.length) return upload.reviewed.rooms.map(reviewedToDraft);
  return [];
}

function isFiniteNumber(value: number | ""): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function reviewRowsToPayload(rooms: ReviewRoomDraft[]): HmgReviewedPlanRoom[] {
  if (!areReviewRoomsValid(rooms)) throw new Error(reviewRoomsValidationMessage(rooms));
  return rooms.map((room) => ({
    ...room,
    lengthFt: room.lengthFt as number,
    widthFt: room.widthFt as number,
    heightFt: room.heightFt as number,
  }));
}

export function reviewRoomsValidationMessage(rooms: Array<ReviewRoomDraft | HmgReviewedPlanRoom>): string {
  if (!rooms.length) return "Review at least one extracted room before generating 3D.";
  const unreadable = rooms.find((room) => !isFiniteNumber(room.lengthFt) || !isFiniteNumber(room.widthFt));
  if (unreadable) return `Enter readable length and width for ${unreadable.name}.`;
  const tooSmall = rooms.find((room) => isFiniteNumber(room.lengthFt) && isFiniteNumber(room.widthFt) && (room.lengthFt < MIN_STUDIO_DIMENSION_FT || room.widthFt < MIN_STUDIO_DIMENSION_FT));
  if (tooSmall) return `${tooSmall.name} must be at least 3.3 ft by 3.3 ft to generate a 3D room.`;
  const tooLarge = rooms.find((room) => isFiniteNumber(room.lengthFt) && isFiniteNumber(room.widthFt) && (room.lengthFt > MAX_STUDIO_DIMENSION_FT || room.widthFt > MAX_STUDIO_DIMENSION_FT));
  if (tooLarge) return `${tooLarge.name} is outside the supported 3D room size.`;
  const invalidHeight = rooms.find((room) => !isFiniteNumber(room.heightFt) || room.heightFt < MIN_HEIGHT_FT || room.heightFt > MAX_HEIGHT_FT);
  if (invalidHeight) return `${invalidHeight.name} must have a wall height between 6 and 20 ft.`;
  return "";
}

export function areReviewRoomsValid(rooms: Array<ReviewRoomDraft | HmgReviewedPlanRoom>): boolean {
  return reviewRoomsValidationMessage(rooms) === "";
}

export function numberInputValue(value: number | ""): string | number {
  return value === "" ? "" : value;
}

export function parseNumberInput(value: string): number | "" {
  if (value.trim() === "") return "";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : "";
}
