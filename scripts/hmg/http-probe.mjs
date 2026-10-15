import{loadEnv}from'vite';import{writeFileSync}from'node:fs';
const e=loadEnv('development',process.cwd(),'');
const r=await fetch(`${e.TARUVI_SITE_URL}/api/apps/hmg_stones/functions/hmg-workflow/execute/`,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:`Api-Key ${e.TARUVI_API_KEY}`},body:JSON.stringify({async:false,params:{command:'context'}})});
const b=await r.json();writeFileSync('backend/hmg/http-envelope.json',JSON.stringify({status:r.status,body:b},null,2));console.log(JSON.stringify({status:r.status,body:b}));
