import {validViewportImageBlobs,type PrivateImageBlobs} from './privateImages';
import {moveRoomObject,parseStudioDesign,surfaces} from './geometry';
import type {StudioDesign,StudioCamera} from './types';
export const STUDIO_CHANNEL='hmg-blueprint-v1';
export type ViewportState={document:StudioDesign;view:'2d'|'3d';selectedSurfaceId?:string|null;resetViewKey?:number;imageBlobs?:PrivateImageBlobs};
export type ViewportEvent={type:'ready'|'webgl-unavailable'}|{type:'selection';surfaceId:string|null}|{type:'camera';camera:StudioCamera}|{type:'status';message:string}|{type:'runtime-error';message:string}|{type:'object-select';objectId:string}|{type:'object-move';objectId:string;xM:number;zM:number};
export function validateViewportEvent(value:unknown,nonce:string,design:StudioDesign):ViewportEvent|null{
 if(!value||typeof value!=='object')return null;const msg=value as Record<string,unknown>;if(msg.channel!==STUDIO_CHANNEL||msg.nonce!==nonce)return null;
 if(msg.type==='ready'||msg.type==='webgl-unavailable')return {type:msg.type};
 if(msg.type==='status'&&typeof msg.message==='string'&&msg.message.length<=500)return {type:'status',message:msg.message};
 if(msg.type==='runtime-error'&&typeof msg.message==='string'&&msg.message.length<=500)return {type:'runtime-error',message:msg.message};
 if((msg.type==='object-select'||msg.type==='object-move')&&typeof msg.objectId==='string'&&design.objects.some(object=>object.id===msg.objectId)){
  if(msg.type==='object-select')return {type:'object-select',objectId:msg.objectId};
  const xM=msg.xM,zM=msg.zM;
  // Validate the complete catalogue footprint against the actual polygon (and
  // other objects), not merely the room's rectangular bounding dimensions.
  if(typeof xM==='number'&&typeof zM==='number'&&moveRoomObject(design,msg.objectId,{xM,zM}))return {type:'object-move',objectId:msg.objectId,xM,zM};
 }
 if(msg.type==='selection'&&(msg.surfaceId===null||typeof msg.surfaceId==='string'&&surfaces(design).some(s=>s.id===msg.surfaceId)))return {type:'selection',surfaceId:msg.surfaceId as string|null};
 if(msg.type==='camera'){const parsed=parseStudioDesign({...design,camera:msg.camera});if(parsed)return {type:'camera',camera:parsed.camera};}
 return null;
}
export function createViewportAdapter(frame:HTMLIFrameElement,onEvent:(event:ViewportEvent)=>void){
 const nonce=crypto.randomUUID();const origin=window.location.origin;let state:ViewportState|undefined,ready=false,disposed=false,imageRevision=0;
 // The frame has an opaque origin. Wildcard is required for delivery, so trust
 // only its exact WindowProxy, null origin, random channel nonce, and schema.
 const post=()=>{if(ready&&state&&!disposed)frame.contentWindow?.postMessage({channel:STUDIO_CHANNEL,nonce,type:'state',...state,imageRevision},'*');};
 const receive=(event:MessageEvent)=>{if(disposed||event.origin!=='null'||event.source!==frame.contentWindow||!state)return;const parsed=validateViewportEvent(event.data,nonce,state.document);if(!parsed)return;if(parsed.type==='ready'){if(ready)return;ready=true;post();}onEvent(parsed);};
 // A single load-triggered hello recovers a startup ready message missed by the host.
 const hello=()=>{if(!disposed&&!ready)frame.contentWindow?.postMessage({channel:STUDIO_CHANNEL,nonce,type:'hello'},'*');};
 frame.addEventListener('load',hello);window.addEventListener('message',receive);frame.src=`/hmg-blueprint3d/index.html#${nonce}|${encodeURIComponent(origin)}`;
 return {update(next:ViewportState){if(!parseStudioDesign(next.document))throw new Error('Invalid saved room design.');if(!validViewportImageBlobs(next.document,next.imageBlobs))throw new Error('Invalid private image bytes.');const previous=state?.imageBlobs??{},images=next.imageBlobs??{};if(Object.keys(previous).length!==Object.keys(images).length||Object.entries(images).some(([id,blob])=>previous[id]!==blob))imageRevision++;state=next;post();},dispose(){disposed=true;frame.removeEventListener('load',hello);window.removeEventListener('message',receive);frame.contentWindow?.postMessage({channel:STUDIO_CHANNEL,nonce,type:'dispose'},'*');frame.src='about:blank';}};
}
