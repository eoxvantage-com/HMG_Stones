import{readFileSync,writeFileSync}from'node:fs';import{basename}from'node:path';import{createHash}from'node:crypto';import{loadEnv}from'vite';import{call,decode}from'./mcp.mjs';
import{readExistingOptions}from'./catalogue-readback.mjs';
const env=loadEnv('development',process.cwd(),'');if(env.TARUVI_SITE_URL!=='https://insurance.taruvi.cloud'||env.TARUVI_APP_SLUG!=='hmg_stones')throw Error('HMG scope mismatch');const manifest=JSON.parse(readFileSync('docs/hmg/stone-products.json','utf8'));const review=JSON.parse(readFileSync('docs/hmg/stone-eligibility.json','utf8'));const approved=new Set(review.approvedAssetIds);const source=manifest.assets.filter(a=>!a.error&&(!process.argv.includes('--priority')||approved.has(a.id)));const stored=[];
for(const asset of source){
 if(!/^hmg-stone-[a-z0-9_-]{1,80}$/.test(asset.id)||!asset.sourcePageUrl.startsWith('https://www.hmgstones.com/product/')||!asset.localUrl.startsWith('/hmg-materials/'))throw Error('Invalid source manifest');
 const filename=basename(asset.localUrl),path='materials/'+filename,storageUrl=env.TARUVI_SITE_URL+'/api/apps/hmg_stones/storage/buckets/hmg-gallery/objects/'+path+'/';
 const local=readFileSync('public/hmg-materials/'+filename);if(createHash('sha256').update(local).digest('hex')!==asset.sha256)throw Error('Local product image changed');
 const prior=await fetch(storageUrl,{redirect:'error'});
 if(prior.status===200){const bytes=Buffer.from(await prior.arrayBuffer());if(createHash('sha256').update(bytes).digest('hex')!==asset.sha256)throw Error('Existing product image differs; stop');}
 else if(prior.status===404){const form=new FormData();const mime=filename.endsWith('.png')?'image/png':filename.endsWith('.webp')?'image/webp':'image/jpeg';form.append('files',new Blob([local],{type:mime}),filename);form.append('paths',JSON.stringify([path]));form.append('metadata',JSON.stringify([{sourcePage:asset.sourcePageUrl,sourceUrl:asset.sourceUrl,sha256:asset.sha256,assetId:asset.id}]));const response=await fetch(env.TARUVI_SITE_URL+'/api/apps/hmg_stones/storage/buckets/hmg-gallery/objects/batch-upload/',{method:'POST',redirect:'error',headers:{Authorization:'Api-Key '+env.TARUVI_API_KEY},body:form});const result=await response.json();if(!result.success||result.data?.uploaded_count!==1)throw Error('Upload not confirmed; no retry');}
 else throw Error('Storage lookup unavailable');
 const remote=await fetch(storageUrl,{redirect:'error'});const bytes=Buffer.from(await remote.arrayBuffer());if(remote.status!==200||createHash('sha256').update(bytes).digest('hex')!==asset.sha256)throw Error('Product readback mismatch');
 const material={...asset,storageUrl,url:'/api/hmg/material-assets/'+asset.id,surfaceEligible:approved.has(asset.id),allowedUse:approved.has(asset.id)?'surface':'inspiration',eligibilityReason:approved.has(asset.id)?review.reason:'Official reference image; not approved for surface application.'};delete material.localUrl;
 stored.push(material);writeFileSync('backend/hmg/stone-storage-progress.json',JSON.stringify({assets:stored},null,2));
}
for(const id of approved)if(!stored.some(x=>x.id===id))throw Error('Approved asset missing from inventory');
const existing=await readExistingOptions(call,decode);
for(const m of stored){const old=existing.find(x=>x.id===m.optionId);if(old&&old.data?.kind!=='official_stone')throw Error('ID collision with unrelated option');}
const rows=stored.map(m=>({id:m.optionId,title:m.title,tone:'',movement:'',application:'',status:'Official reference',data:{kind:'official_stone',material:m}}));
const result=decode(await call('datatable_data',{action:'upsert',table_name:'hmg_options',data:rows,unique_fields:'id'}));if(!result.success)throw Error('Catalogue import not confirmed; read before retry');
writeFileSync('docs/hmg/stone-catalogue.json',JSON.stringify({at:new Date().toISOString(),assets:stored},null,2));console.log(JSON.stringify({imported:rows.length,eligible:approved.size,bytes:stored.reduce((n,x)=>n+x.bytes,0)}));
