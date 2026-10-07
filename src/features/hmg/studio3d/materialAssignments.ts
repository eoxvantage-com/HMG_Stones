import { surfaces } from "./geometry";
import type { StudioAssignment, StudioDesign } from "./types";
export type AssignmentInputs = {
  width: string;
  height: string;
  rotation: 0 | 90;
  mode: "surface" | "tile" | "slab";
  grout: string;
  color: string;
};
export function parseAssignmentSettings(
  assetId: string,
  input: AssignmentInputs
): StudioAssignment {
  if (input.mode === "surface") {
    if (
      !assetId ||
      ![0, 90].includes(input.rotation) ||
      !/^#[0-9a-fA-F]{6}$/.test(input.color)
    )
      throw new Error("Select a valid surface material.");
    return {
      assetId,
      mode: "surface",
      widthM: 1,
      heightM: 1,
      rotation: input.rotation,
      groutMm: 0,
      groutColor: input.color,
      dimensionsAssumed: true,
    };
  }
  const widthM = Number(input.width),
    heightM = Number(input.height),
    groutMm = Number(input.grout);
  if (
    !assetId ||
    !input.width.trim() ||
    !input.height.trim() ||
    (input.mode === "tile" && !input.grout.trim()) ||
    !["tile", "slab"].includes(input.mode) ||
    ![0, 90].includes(input.rotation) ||
    ![widthM, heightM, groutMm].every(Number.isFinite) ||
    widthM < 0.05 ||
    widthM > 10 ||
    heightM < 0.05 ||
    heightM > 10 ||
    groutMm < 0 ||
    groutMm > 20 ||
    !/^#[0-9a-fA-F]{6}$/.test(input.color)
  )
    throw new Error(
      "Enter preview width and height from 0.05 to 10 metres, grout from 0 to 20 mm, and a valid grout colour."
    );
  return {
    assetId,
    widthM,
    heightM,
    rotation: input.rotation,
    mode: input.mode,
    groutMm: input.mode === "slab" ? 0 : groutMm,
    groutColor: input.color,
    dimensionsAssumed: true,
  };
}
export function applyAssignment(
  design: StudioDesign,
  target: string,
  assignment: StudioAssignment
): StudioDesign {
  const availableSurfaces = surfaces(design);
  const ids = target === "all-walls"
    ? availableSurfaces.filter((surface) => surface.kind === "wall").map((surface) => surface.id)
    : [target];
  const validIds = new Set(availableSurfaces.map((surface) => surface.id));
  if (ids.some((id) => !validIds.has(id)))
    throw new Error("Choose a floor or interior wall.");
  const assignments = { ...design.options[design.activeOption].assignments };
  for (const id of ids) {
    const face = availableSurfaces.find((s) => s.id === id)!;
    assignments[id] =
      assignment.mode === "surface"
        ? {
            ...assignment,
            widthM: face.width,
            heightM: face.height,
            groutMm: 0,
          }
        : { ...assignment };
  }
  return {
    ...design,
    options: { ...design.options, [design.activeOption]: { assignments } },
  };
}
