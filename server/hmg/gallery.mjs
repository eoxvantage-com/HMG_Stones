import { galleryAssets } from '../../src/features/hmg/design/galleryAssets.mjs';
/** Immutable public provenance registry: never forwards a URL, command or credential. */
export function handleGallery(query) {
  const allowed = new Set(['search','category','page','pageSize']);
  const invalid = () => ({ status:400, body:{ok:false,error:{code:'VALIDATION',message:'Invalid gallery filter.'}} });
  for (const key of query.keys()) if (!allowed.has(key) || query.getAll(key).length !== 1) return invalid();
  const search = query.get('search') || '', category = query.get('category') || '';
  const page = Number(query.get('page') || 1), pageSize = Number(query.get('pageSize') || 12);
  if (search.length>100 || category.length>100 || !Number.isSafeInteger(page) || page<1 || page>10000 || !Number.isSafeInteger(pageSize) || pageSize<1 || pageSize>48) return invalid();
  const rows = galleryAssets.filter(a => (!category || a.category===category) && (!search || `${a.id} ${a.title} ${a.sourceCaption} ${a.category}`.toLowerCase().includes(search.toLowerCase())));
  const data=rows.slice((page-1)*pageSize,page*pageSize).map(({localUrl,...asset})=>({...asset,url:''}));
  return {status:200,body:{ok:true,data:{data,total:rows.length,page,pageSize,categories:[...new Set(galleryAssets.map(a=>a.category))]}}};
}
