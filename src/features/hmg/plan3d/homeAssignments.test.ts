import { describe, expect, it } from 'vitest';
import { createDesign } from '../studio3d/geometry';
import type { HmgPlanUpload } from '../types';
import type { StudioAssignment } from '../studio3d/types';
import { homeAssignments } from './homeAssignments';

const stone: StudioAssignment = {assetId:'hmg-stone-amarone',rotation:0,mode:'surface',widthM:1,heightM:1,groutMm:0,groutColor:'#ffffff',dimensionsAssumed:false};
const design = createDesign('project');
const upload = {generatedDesignIds:[design.id],reviewed:{rooms:[{id:'plan-room'}],assignments:{'plan-room:floor':stone,'plan-room:walls':stone}}} as unknown as HmgPlanUpload;
describe('homeAssignments', () => {
  it('maps live floor and individual wall edits without leaking to other sides', () => {
    const draft = structuredClone(design);
    draft.options.A.assignments[`${draft.room.id}:floor`] = stone;
    draft.options.A.assignments[draft.room.wallSideIds[1]] = stone;
    expect(homeAssignments(upload, [], draft)).toEqual({'plan-room:floor':stone,'plan-room:east':stone});
  });
  it('respects cleared assignments and active option rather than restoring plan defaults', () => {
    const draft = structuredClone(design);
    draft.options.A.assignments[`${draft.room.id}:floor`] = stone;
    draft.activeOption = 'B';
    expect(homeAssignments(upload, [], draft)).toEqual({});
  });
  it('uses saved rooms when not editing them and retains defaults before generation', () => {
    const saved = structuredClone(design);
    saved.options.A.assignments[`${saved.room.id}:floor`] = stone;
    expect(homeAssignments(upload, [{design:saved,revision:1,updatedAt:''}])).toEqual({'plan-room:floor':stone});
    expect(homeAssignments({...upload,generatedDesignIds:[]}, [])).toEqual(upload.reviewed?.assignments);
  });
});
