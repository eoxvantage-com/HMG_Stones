import { useMemo } from 'react';
import { useCustom } from '@refinedev/core';
import { hasHmgSession, workflow } from './api';
import type { GalleryReference } from './design/galleryReferences';
export interface GalleryPage {data:GalleryReference[];total:number;page:number;pageSize:number;categories?:string[];types?:string[];colours?:string[]}
function officialUrl(value: unknown) {
  if (typeof value !== 'string') return false;
  try { const url = new URL(value); return url.protocol === 'https:' && ['www.hmgstones.com','hmgstones.com'].includes(url.hostname) && !url.username && !url.password; } catch { return false; }
}
/** Preserve the former gateway projection; storage URLs never enter UI state. */
export function projectMaterial(raw: GalleryReference): GalleryReference {
  if (!raw || !/^hmg-stone-[a-z0-9_-]{1,80}$/.test(raw.id) || typeof raw.title !== 'string' || !officialUrl(raw.sourcePageUrl) || !officialUrl(raw.sourceUrl) ||
      !Number.isSafeInteger(raw.width) || raw.width < 1 || !Number.isSafeInteger(raw.height) || raw.height < 1) throw new Error('Invalid material provenance.');
  const text = (value: unknown, max = 1000) => typeof value === 'string' ? value.slice(0,max) : '';
  return {
    id:raw.id,url:'',width:raw.width,height:raw.height,
    surfaceEligible:raw.surfaceEligible===true && raw.allowedUse==='surface',allowedUse:raw.allowedUse==='surface'?'surface':'inspiration',
    optionId:text(raw.optionId),title:text(raw.title),sourcePageUrl:text(raw.sourcePageUrl),sourceUrl:text(raw.sourceUrl),
    sourceCaption:text(raw.sourceCaption),sourceCheckedAt:text(raw.sourceCheckedAt),category:text(raw.category),
    eligibilityReason:text(raw.eligibilityReason),description:text(raw.description,1600),
    stoneType:typeof raw.stoneType==='string'?text(raw.stoneType,150):null,
    colour:typeof raw.colour==='string'?text(raw.colour,150):null,
    variant:typeof raw.variant==='string'?text(raw.variant,150):null,
    physicalDimensions:null,
  };
}
export async function galleryPage(filters: Record<string, unknown>, mode: 'gallery'|'materials'): Promise<GalleryPage> {
  const raw = await workflow<GalleryPage>({command:mode==='materials'?'listStoneMaterials':'listGallery',payload:filters});
  if (!raw || !Array.isArray(raw.data) || raw.data.length > Number(filters.pageSize) || !Number.isSafeInteger(raw.total) || raw.total < 0) throw new Error('Invalid gallery list.');
  const facet = (values?: string[]) => Array.isArray(values) ? values.filter(value=>typeof value==='string' && value.length<=150).slice(0,200) : [];
  return {...raw,data:raw.data.map(asset=>mode==='materials'?projectMaterial(asset):({...asset,url:'',localUrl:undefined})),types:facet(raw.types),colours:facet(raw.colours),categories:facet(raw.categories)};
}
export function useGallery(filters:{search:string;category:string;colour?:string;page:number;pageSize:number},mode:'gallery'|'materials'='gallery') {
  const signature=JSON.stringify(filters);
  const stable=useMemo(()=>{const f=JSON.parse(signature);return mode==='materials'?{search:f.search,stoneType:f.category,colour:f.colour||'',page:f.page,pageSize:f.pageSize}:{search:f.search,category:f.category,page:f.page,pageSize:f.pageSize};},[signature,mode]);
  const query=useCustom({url:'hmg-native-workflow',method:'post',dataProviderName:'app',config:{payload:stable},errorNotification:false,
    queryOptions:{enabled:hasHmgSession(),retry:false,staleTime:60000,queryKey:['hmg-gallery',mode,signature],queryFn:async()=>({data:{value:await galleryPage(stable,mode)}})}});
  return {data:query.result?.data?.value as GalleryPage|undefined,loading:query.query.isLoading,error:query.query.error,refetch:query.query.refetch};
}
export async function material(assetId: string): Promise<GalleryReference> {
  const raw = await workflow<GalleryReference>({command:'getStoneMaterial',payload:{assetId}});
  if (raw?.id !== assetId) throw new Error('Mismatched material.');
  return projectMaterial(raw);
}
export function useMaterial(assetId?:string){
  const query=useCustom({url:'hmg-native-workflow',method:'post',dataProviderName:'app',errorNotification:false,queryOptions:{enabled:!!assetId && hasHmgSession(),retry:false,staleTime:60000,queryKey:['hmg-material',assetId],queryFn:async()=>({data:{value:await material(assetId||'')}})}});
  return {data:query.result?.data?.value as GalleryReference|undefined,loading:query.query.isLoading,error:query.query.error,refetch:query.query.refetch};
}
