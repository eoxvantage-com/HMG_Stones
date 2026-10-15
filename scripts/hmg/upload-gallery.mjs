import{readFileSync,writeFileSync}from'node:fs';import{resolve,basename}from'node:path';import{createHash}from'node:crypto';import{loadEnv}from'vite';
const env=loadEnv('development',process.cwd(),'');if(env.TARUVI_APP_SLUG!=='hmg_stones'||env.TARUVI_SITE_URL!=='https://insurance.taruvi.cloud')throw Error('Scope mismatch');
const manifest=JSON.parse(readFileSync('docs/hmg/gallery-assets.json','utf8'));const evidence=[];
for(const asset of manifest.assets){
 if(asset.sourcePageUrl!=='https://www.hmgstones.com/gallery/'||!asset.localUrl.startsWith('/hmg-gallery/'))throw Error('Invalid gallery provenance');
 const filename=basename(asset.localUrl),path='gallery/'+filename,publicUrl=env.TARUVI_SITE_URL+'/api/apps/hmg_stones/storage/buckets/hmg-gallery/objects/'+path+'/';
 const local=readFileSync(resolve('public/hmg-gallery',filename));if(createHash('sha256').update(local).digest('hex')!==asset.sha256)throw Error('Local asset hash mismatch');
 const existing=await fetch(publicUrl,{redirect:'error'});let present=existing.status===200;
 if(present){const bytes=Buffer.from(await existing.arrayBuffer());if(createHash('sha256').update(bytes).digest('hex')!==asset.sha256)throw Error('Existing different object; do not overwrite');}
 else if(existing.status!==404)throw Error('Unexpected storage read status '+existing.status);
 if(!present){const form=new FormData();form.append('files',new Blob([local],{type:'image/jpeg'}),filename);form.append('paths',JSON.stringify([path]));form.append('metadata',JSON.stringify([{sourcePage:asset.sourcePageUrl,sourceUrl:asset.sourceUrl,allowedUse:'inspiration',sha256:asset.sha256}]));const upload=await fetch(env.TARUVI_SITE_URL+'/api/apps/hmg_stones/storage/buckets/hmg-gallery/objects/batch-upload/',{method:'POST',redirect:'error',headers:{Authorization:'Api-Key '+env.TARUVI_API_KEY},body:form});const body=await upload.json();if(!body.success||body.data?.uploaded_count!==1)throw Error('Upload not confirmed; stop without retry');}
 const response=await fetch(publicUrl,{redirect:'error'});const remote=Buffer.from(await response.arrayBuffer());if(response.status!==200||createHash('sha256').update(remote).digest('hex')!==asset.sha256)throw Error('Storage readback hash mismatch');
 evidence.push({id:asset.id,publicUrl,sha256:asset.sha256,bytes:remote.length,anonymousReadStatus:response.status});writeFileSync('docs/hmg/gallery-storage.json',JSON.stringify({at:new Date().toISOString(),bucket:'hmg-gallery',storageProvider:'s3',assets:evidence},null,2));
}
console.log(JSON.stringify({uploadedOrVerified:evidence.length,bytes:evidence.reduce((n,a)=>n+a.bytes,0)}));
