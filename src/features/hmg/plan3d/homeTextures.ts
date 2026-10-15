import { MeshStandardMaterial, SRGBColorSpace, Texture, TextureLoader } from 'three';

export type HomeAssignment = {assetId:string; rotation?:number};
export type HomeTextureTarget = {key:string; fallbackKey?:string; material:MeshStandardMaterial};

async function loadPrivateTexture(assetId:string, signal:AbortSignal) {
  const { requestPrivateImageUrl } = await import('../api');
  const url = await requestPrivateImageUrl(assetId, signal);
  return new TextureLoader().loadAsync(url);
}

/** Update material maps in place: orbit/camera and geometry remain untouched. */
export function createHomeTextures(
  targets: HomeTextureTarget[], render:()=>void,
  status:(pending:number, failed:number)=>void,
  load:(assetId:string, signal:AbortSignal)=>Promise<Texture> = loadPrivateTexture,
) {
  let disposed = false;
  const slots = targets.map(target => ({...target, color:target.material.color.clone(),
    opacity:target.material.opacity, transparent:target.material.transparent,
    signature:'', pending:false, failed:false, abort:new AbortController(), texture:null as Texture|null}));
  const report = () => {if (!disposed) status(slots.filter(s=>s.pending).length, slots.filter(s=>s.failed).length);};
  const reset = (slot:typeof slots[number]) => {
    slot.abort.abort();
    slot.texture?.dispose();
    slot.texture=null;
    slot.material.map=null;
    slot.material.color.copy(slot.color);
    slot.material.opacity=slot.opacity;
    slot.material.transparent=slot.transparent;
    slot.material.needsUpdate=true;
  };
  return {
    async update(assignments:Record<string,HomeAssignment>) {
      if (disposed) return;
      await Promise.all(slots.map(async slot => {
        const assignment = assignments[slot.key] || (slot.fallbackKey ? assignments[slot.fallbackKey] : undefined);
        const signature = assignment ? JSON.stringify([assignment.assetId,assignment.rotation || 0]) : '';
        if (signature === slot.signature) return;
        reset(slot);
        slot.signature=signature;
        slot.pending=!!assignment;
        slot.failed=false;
        report(); render();
        if (!assignment) return;
        const abort = new AbortController();
        slot.abort=abort;
        try {
          const texture = await load(assignment.assetId, abort.signal);
          if (disposed || abort.signal.aborted) {texture.dispose();return;}
          texture.colorSpace=SRGBColorSpace;
          texture.center.set(0.5,0.5);
          texture.rotation=(assignment.rotation || 0)*Math.PI/180;
          texture.needsUpdate=true;
          slot.texture=texture;
          slot.material.map=texture;
          slot.material.color.setRGB(1,1,1);
          slot.material.opacity=1;
          slot.material.transparent=false;
          slot.material.needsUpdate=true;
        } catch {
          if (disposed || abort.signal.aborted) return;
          slot.failed=true;
        }
        if (!disposed && !abort.signal.aborted) {slot.pending=false;report();render();}
      }));
    },
    dispose() {disposed=true; slots.forEach(reset);},
  };
}
