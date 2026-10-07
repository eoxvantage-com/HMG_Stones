import type {StudioDesign} from './types';
export type PrivateImageBlobs=Record<string,Blob>;
export function validViewportImageBlobs(design:StudioDesign,images:unknown):images is PrivateImageBlobs {
 if(images===undefined)return true;
 if(!images||typeof images!=='object'||Array.isArray(images))return false;
 const assigned=new Set(Object.values(design.options[design.activeOption].assignments).map(a=>a.assetId));
 const entries=Object.entries(images);
 return entries.length<=32&&entries.reduce((total,[,blob])=>total+(blob instanceof Blob?blob.size:0),0)<=64*1024*1024&&entries.every(([id,blob])=>assigned.has(id)&&/^hmg-stone-[a-z0-9_-]{1,80}$/.test(id)&&blob instanceof Blob&&blob.size>0&&blob.size<=8*1024*1024&&['image/png','image/jpeg','image/webp'].includes(blob.type));
}
/** Called only inside the opaque-origin child. Never accept parent-created URLs. */
export function createPrivateImageRegistry(urlApi:Pick<typeof URL,'createObjectURL'|'revokeObjectURL'>=URL){
 let revision:number|undefined,paths:Record<string,string>={};
 function dispose(){for(const path of Object.values(paths))urlApi.revokeObjectURL(path);paths={};revision=undefined;}
 return {update(design:StudioDesign,images:unknown={},nextRevision:number){
  if(!Number.isSafeInteger(nextRevision)||nextRevision<0||!validViewportImageBlobs(design,images))throw Error('Invalid private image bytes');
  if(revision===nextRevision)return paths;
  const next:Record<string,string>={};
  try{for(const [id,blob] of Object.entries(images as PrivateImageBlobs))next[id]=urlApi.createObjectURL(blob);}catch(error){for(const path of Object.values(next))urlApi.revokeObjectURL(path);throw error;}
  dispose();paths=next;revision=nextRevision;return paths;
 },dispose};
}
