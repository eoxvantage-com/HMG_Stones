import type { HmgPlanUpload, HmgStudioSavedDesign } from '../types';
import type { StudioAssignment, StudioDesign } from '../studio3d/types';

/** Generated design order is the reviewed room order; never match by room name. */
export function homeAssignments(upload: HmgPlanUpload | undefined, saved: HmgStudioSavedDesign[], draft?: StudioDesign) {
  const result: Record<string, StudioAssignment> = {...upload?.reviewed?.assignments};
  upload?.reviewed?.rooms.forEach((room, index) => {
    const id = upload.generatedDesignIds[index];
    const design = draft?.id === id ? draft : saved.find(entry => entry.design.id === id)?.design;
    if (!design) return;
    // A generated design is authoritative, including removals and empty options.
    for (const key of Object.keys(result)) if (key.startsWith(`${room.id}:`)) delete result[key];
    const assignments = design.options[design.activeOption].assignments;
    const floor = assignments[`${design.room.id}:floor`];
    if (floor) result[`${room.id}:floor`] = floor;
    (['north','east','south','west'] as const).forEach((direction, side) => {
      const assignment = assignments[design.room.wallSideIds[side]];
      if (assignment) result[`${room.id}:${direction}`] = assignment;
    });
  });
  return result;
}
