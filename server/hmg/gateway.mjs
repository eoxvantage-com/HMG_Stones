import { handleGallery } from './gallery.mjs';
import { galleryAssets } from '../../src/features/hmg/design/galleryAssets.mjs';
import { randomBytes } from 'node:crypto';
/** Fixed-tenant BFF. Never forward browser identity claims or credentials to the service call. */
const SITE = 'https://insurance.taruvi.cloud';
const APP = 'hmg_stones';
const MAX_BYTES = 64 * 1024;
const aiRequests = new Map(); // bounded ephemeral per-actor cost limit, never logged
const privateImageTickets=new Map();let privateImageBytes=0;
const PRIVATE_IMAGE_TTL=60_000,PRIVATE_IMAGE_MAX_TICKETS=128,PRIVATE_IMAGE_MAX_BYTES=32*1024*1024;
const APP_ROLES = new Set(['Super Admin','HMG Customer','HMG Consultant','HMG Operations','HMG Sales Head','HMG Executive','HMG Architect']);
const ENVELOPE_KEYS = new Set(['command','projectId','expectedVersion','idempotencyKey','payload']);
const FORBIDDEN_KEYS = new Set(['verifiedactor','trustedactor','user_data','roles','is_superuser','is_staff','actorid']);
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const failure = (status, code, message) => ({status,body:{ok:false,error:{code,message}}});
function safePayload(value, depth=0) {
  if (depth > 16) return false;
  if (Array.isArray(value)) return value.length <= 1000 && value.every(v=>safePayload(v,depth+1));
  if (object(value)) return Object.entries(value).every(([k,v])=>!FORBIDDEN_KEYS.has(k.toLowerCase()) && !['__proto__','constructor','prototype'].includes(k) && safePayload(v,depth+1));
  return value === null || ['string','boolean'].includes(typeof value) || (typeof value==='number' && Number.isFinite(value));
}
function envelope(body) {
  if (!object(body) || Object.keys(body).some(k=>!ENVELOPE_KEYS.has(k))) return null;
  if (typeof body.command!=='string' || !/^[a-zA-Z]{1,60}$/.test(body.command)) return null;
  if (body.projectId!==undefined && (typeof body.projectId!=='string' || body.projectId.length>100)) return null;
  if (body.idempotencyKey!==undefined && (typeof body.idempotencyKey!=='string' || !body.idempotencyKey || body.idempotencyKey.length>100)) return null;
  if (body.expectedVersion!==undefined && (!Number.isSafeInteger(body.expectedVersion) || body.expectedVersion<0)) return null;
  if (body.payload!==undefined && (!object(body.payload) || !safePayload(body.payload))) return null;
  return body;
}
async function readJson(response, max=4*1024*1024) {
  if (!response.body) throw new Error('Missing response');
  const reader=response.body.getReader(); const chunks=[];let size=0;
  try { for (;;) {const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();throw new Error('Response too large');}chunks.push(value);} }
  finally {reader.releaseLock();}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
/** Injectable fetch permits trust-boundary tests without credentials or external network. */
export async function handleWorkflow(body, token, config, fetcher=fetch) {
  if (config.siteUrl?.replace(/\/$/,'')!==SITE || config.appSlug!==APP || !config.apiKey)
    return failure(503,'GATEWAY_UNAVAILABLE','The HMG server gateway is not configured.');
  if (typeof token!=='string' || !token || token.length>4096 || /[\s\x00-\x1f\x7f]/.test(token))
    return failure(401,'UNAUTHENTICATED','Sign in required.');
  const command=envelope(body);
  if (!command) return failure(400,'VALIDATION','Invalid command envelope.');
  const ai=command.command==='generateAiFindings';
  if(ai && (!command.projectId || Object.keys(command).some(k=>!['command','projectId','payload'].includes(k)) || command.payload?.consent!==true || Object.keys(command.payload).some(k=>k!=='consent')))return failure(400,'VALIDATION','AI findings require explicit consent and a project.');
  try {
    const verified=await verifyHmgSession(token,fetcher);
    if(verified.error)return verified.error;
    const verifiedActor=verified.actor;
    if(ai){
      const now=Date.now();for(const [id,at] of aiRequests)if(now-at>=30000)aiRequests.delete(id);
      if(aiRequests.has(verifiedActor.id)||aiRequests.size>=1000)return failure(429,'RATE_LIMIT','Wait 30 seconds before requesting more AI findings.');
      aiRequests.set(verifiedActor.id,now);
    }
    const functionSlug=ai?'hmg-ai-findings':'hmg-workflow';
    const response=await fetcher(`${SITE}/api/apps/${APP}/functions/${functionSlug}/execute/`,{
      method:'POST',redirect:'error',signal:AbortSignal.timeout(45000),
      headers:{Accept:'application/json','Content-Type':'application/json',Authorization:`Api-Key ${config.apiKey}`},
      body:JSON.stringify({async:false,params:{...command,verifiedActor}}),
    });
    if (!response.ok) return failure(502,'RELAY_FAILED','The server did not confirm this operation. Refresh before retrying.');
    const result=await readJson(response);
    if (result?.status!=='success' || !object(result.data) || typeof result.data.ok!=='boolean')
      return failure(502,'RELAY_FAILED','The server did not confirm this operation. Refresh before retrying.');
    const status=result.data.error?.code==='FORBIDDEN'?403:result.data.error?.code==='UNAUTHENTICATED'?401:200;
    return {status,body:result.data};
  } catch {
    // Intentionally never log/return upstream exceptions, headers, bodies, tokens, or service keys.
    return failure(502,'UPSTREAM_UNAVAILABLE','The server did not confirm this operation. Refresh before retrying.');
  }
}

const DEV_ORIGINS = new Set(['http://localhost:5173','http://127.0.0.1:5173','http://[::1]:5173','http://localhost:5174','http://127.0.0.1:5174','http://[::1]:5174']);
export function createWorkflowMiddleware(config, fetcher=fetch) {
  const origins=new Set(config.allowedOrigin ? [config.allowedOrigin] : config.development ? DEV_ORIGINS : []);
  return async (req,res,next=()=>{res.statusCode=404;res.end();})=>{
    const path=req.url?.split('?')[0];
    const catalogue=path==='/api/hmg/catalogue';
    const gallery=path==='/api/hmg/gallery';
    const materials=path==='/api/hmg/materials';
    const ticketRequest=path==='/api/hmg/image-ticket';
    const privateImage=path?.startsWith('/api/hmg/private-images/');
    // Blueprint3D intentionally runs in a sandboxed opaque-origin iframe. Only
    // opaque ticket URLs for image GETs cross that boundary.
    const opaquePrivateImage=privateImage&&req.method==='GET'&&req.headers.origin==='null'&&
      req.headers['sec-fetch-dest']==='image'&&req.headers['sec-fetch-mode']==='cors'&&
      req.headers.cookie===undefined&&req.headers.authorization===undefined;
    const publicRead=catalogue||gallery||materials;
    if (path!=='/api/hmg/workflow'&&!publicRead&&!ticketRequest&&!privateImage) return next();
    const send=result=>{if(res.writableEnded)return;res.statusCode=result.status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.end(JSON.stringify(result.body));};
    const expectedMethod=publicRead?'GET':privateImage?'GET':'POST';
    if(req.method!==expectedMethod){res.setHeader('Allow',expectedMethod);return send(failure(405,'METHOD_NOT_ALLOWED','Unsupported method.'));}
    // Reject cross-site requests and DNS-rebinding hosts. No CORS headers are emitted.
    const host=req.headers.host;
    const origin=req.headers.origin;
    const hosts=new Set([...origins].map(o=>new URL(o).host));
    if(typeof host!=='string'||!hosts.has(host)||(!opaquePrivateImage&&req.headers['sec-fetch-site']==='cross-site')||(origin!==undefined && (typeof origin!=='string'||(!origins.has(origin)&&!opaquePrivateImage))))
      return send(failure(403,'FORBIDDEN','Same-origin access required.'));
    if(ticketRequest){
      if(!String(req.headers['content-type']||'').toLowerCase().startsWith('application/json'))return send(failure(415,'INVALID_CONTENT_TYPE','Use application/json.'));
      const token=req.headers['x-session-token'];if(typeof token!=='string'||!token)return send(failure(401,'UNAUTHENTICATED','Sign in required.'));
      const chunks=[];let bytes=0;try{for await(const chunk of req){bytes+=chunk.length;if(bytes>2048)return send(failure(413,'PAYLOAD_TOO_LARGE','Image request is too large.'));chunks.push(chunk);}}catch{return send(failure(400,'VALIDATION','Image request could not be read.'));}
      let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return send(failure(400,'VALIDATION','Invalid image request.'));}
      const result=await handleImageTicket(body,token,config,fetcher);return send(result);
    }
    if(privateImage){
      if(req.url.includes('?'))return send(failure(400,'VALIDATION','Image tickets do not accept query parameters.'));
      const key=path.slice('/api/hmg/private-images/'.length),result=handlePrivateImage(key);
      if(result.status!==200)return send(result);
      res.statusCode=200;res.setHeader('Content-Type',result.contentType);res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','private, max-age=60, immutable');
      res.setHeader('Cross-Origin-Resource-Policy',opaquePrivateImage?'cross-origin':'same-origin');
      if(opaquePrivateImage){res.setHeader('Access-Control-Allow-Origin','null');res.setHeader('Vary','Origin');}
      res.end(result.bytes);return;
    }
    if(gallery)return send(handleGallery(new URL(req.url,'http://localhost').searchParams));
    if(materials)return send(await handleMaterials(new URL(req.url,'http://localhost').searchParams,config));
    if(catalogue)return send(await handleCatalogue(new URL(req.url,'http://localhost').searchParams,config));
    if(!String(req.headers['content-type']||'').toLowerCase().startsWith('application/json'))return send(failure(415,'INVALID_CONTENT_TYPE','Use application/json.'));
    const token=req.headers['x-session-token'];
    if(typeof token!=='string'||!token)return send(failure(401,'UNAUTHENTICATED','Sign in required.'));
    if(Number(req.headers['content-length']||0)>MAX_BYTES)return send(failure(413,'PAYLOAD_TOO_LARGE','Command is too large.'));
    const chunks=[];let bytes=0;
    const timer=setTimeout(()=>{send(failure(408,'REQUEST_TIMEOUT','Request timed out.'));req.destroy();},10000);
    try {
      for await(const chunk of req){bytes+=chunk.length;if(bytes>MAX_BYTES){send(failure(413,'PAYLOAD_TOO_LARGE','Command is too large.'));return;}chunks.push(chunk);}
      clearTimeout(timer);
      let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return send(failure(400,'VALIDATION','Invalid JSON.'));}
      send(await handleWorkflow(body,token,config));
    }catch{send(failure(400,'VALIDATION','Request could not be read.'));}
    finally{clearTimeout(timer);}
  };
}

/** Public catalogue is deliberately NOT a general command proxy. */
export async function handleCatalogue(query, config, fetcher=fetch) {
  if (config.siteUrl?.replace(/\/$/,'')!==SITE || config.appSlug!==APP || !config.apiKey)
    return failure(503,'GATEWAY_UNAVAILABLE','The HMG catalogue gateway is not configured.');
  const allowed=new Set(['optionId','search','tone','page','pageSize']);
  for(const key of query.keys())if(!allowed.has(key)||query.getAll(key).length!==1)return failure(400,'VALIDATION','Invalid catalogue filter.');
  const id=query.get('optionId');const search=query.get('search')||'';const tone=query.get('tone')||'';
  const page=Number(query.get('page')||1),pageSize=Number(query.get('pageSize')||10);
  if((id!==null&&!/^[a-zA-Z0-9_-]{1,100}$/.test(id))||search.length>100||tone.length>50||!Number.isSafeInteger(page)||page<1||page>10000||!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>50)
    return failure(400,'VALIDATION','Invalid catalogue filter.');
  const params=id?{command:'getOption',payload:{optionId:id}}:{command:'listOptions',payload:{search,tone,page,pageSize}};
  const project=option=>{
    if(!object(option)||typeof option.id!=='string'||typeof option.title!=='string')throw new Error('Invalid option');
    const out={data:{}};
    for(const key of ['id','title','tone','movement','application','status'])out[key]=typeof option[key]==='string'?option[key].slice(0,500):'Unknown';
    return out;
  };
  try {
    const response=await fetcher(`${SITE}/api/apps/${APP}/functions/hmg-workflow/execute/`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Accept:'application/json','Content-Type':'application/json',Authorization:`Api-Key ${config.apiKey}`},body:JSON.stringify({async:false,params})});
    if(!response.ok)throw new Error('Unavailable');
    const result=await readJson(response);
    if(result?.status!=='success'||result?.data?.ok!==true){if(result?.data?.error?.code==='NOT_FOUND')return failure(404,'NOT_FOUND','Option not found.');throw new Error('Unavailable');}
    const raw=result.data.data;
    if(id)return {status:200,body:{ok:true,data:project(raw)}};
    if(!object(raw)||!Array.isArray(raw.data)||raw.data.length>pageSize||!Number.isSafeInteger(raw.total)||raw.total<0)throw new Error('Invalid list');
    return {status:200,body:{ok:true,data:{data:raw.data.map(project),total:raw.total,page,pageSize}}};
  }catch{return failure(502,'CATALOGUE_UNAVAILABLE','The reference catalogue is temporarily unavailable.');}
}

async function verifyHmgSession(token,fetcher){
  if(typeof token!=='string'||!token||token.length>4096||/[\s\x00-\x1f\x7f]/.test(token))return {error:failure(401,'UNAUTHENTICATED','Sign in required.')};
  // Exact platform session/identity endpoints. Session verification never uses service credentials.
  const sessionHeaders={Accept:'application/json','X-Session-Token':token};
  const session=await fetcher(`${SITE}/_allauth/app/v1/auth/session`,{method:'GET',headers:sessionHeaders,redirect:'error',signal:AbortSignal.timeout(12000)});
  if([401,403,410,419].includes(session.status))return {error:failure(401,'UNAUTHENTICATED','Your session is not valid. Sign in again.')};
  if(!session.ok)return {error:failure(502,'UPSTREAM_UNAVAILABLE','Session verification is temporarily unavailable.')};
  const sessionData=await readJson(session,128*1024);
  if(sessionData?.meta?.is_authenticated!==true)return {error:failure(401,'UNAUTHENTICATED','Your session is not authenticated.')};
  const identity=await fetcher(`${SITE}/api/users/me/`,{method:'GET',headers:sessionHeaders,redirect:'error',signal:AbortSignal.timeout(12000)});
  if([401,410,419].includes(identity.status))return {error:failure(401,'UNAUTHENTICATED','Your session is not valid. Sign in again.')};
  if(identity.status===403)return {error:failure(403,'FORBIDDEN','Your account cannot access this workspace.')};
  if(!identity.ok)return {error:failure(502,'UPSTREAM_UNAVAILABLE','Identity verification is temporarily unavailable.')};
  const identityData=await readJson(identity,256*1024),user=identityData?.status==='success'?identityData.data:null;
  if(!object(user)||typeof user.id!=='string'||!user.id||user.is_active!==true||user.is_deleted===true||!Array.isArray(user.roles))return {error:failure(403,'FORBIDDEN','An active HMG account is required.')};
  if(sessionData?.data?.user?.id!==user.id)return {error:failure(401,'UNAUTHENTICATED','Session identity could not be verified.')};
  const roles=user.roles.filter(r=>object(r)&&r.app_slug===APP&&r.type==='app_role'&&APP_ROLES.has(r.name)).map(r=>({name:r.name,app_slug:APP,type:'app_role'}));
  if(user.is_superuser!==true&&!roles.length)return {error:failure(403,'FORBIDDEN','Your account has no HMG workspace role.')};
  return {actor:{id:user.id,is_active:true,is_deleted:false,is_superuser:user.is_superuser===true,roles}};
}

const MATERIAL_ID=/^hmg-stone-[a-z0-9_-]{1,80}$/;
const STORAGE_MATERIAL_PREFIX=`${SITE}/api/apps/${APP}/storage/buckets/hmg-gallery/objects/materials/`;
const STORAGE_GALLERY_PREFIX=`${SITE}/api/apps/${APP}/storage/buckets/hmg-gallery/objects/gallery/`;
function officialUrl(value){try{const url=new URL(value);return url.protocol==='https:'&&['www.hmgstones.com','hmgstones.com'].includes(url.hostname)&&!url.username&&!url.password;}catch{return false;}}
function materialProjection(raw){
  if(!object(raw)||!MATERIAL_ID.test(raw.id)||typeof raw.title!=='string'||!officialUrl(raw.sourcePageUrl)||!officialUrl(raw.sourceUrl)||!Number.isSafeInteger(raw.width)||raw.width<1||!Number.isSafeInteger(raw.height)||raw.height<1)throw Error('Invalid material provenance');
  const out={id:raw.id,url:'',width:raw.width,height:raw.height,
    surfaceEligible:raw.surfaceEligible===true&&raw.allowedUse==='surface',allowedUse:raw.allowedUse==='surface'?'surface':'inspiration'};
  for(const key of ['optionId','title','sourcePageUrl','sourceUrl','sourceCaption','sourceCheckedAt','category','eligibilityReason','description'])out[key]=typeof raw[key]==='string'?raw[key].slice(0,key==='description'?1600:1000):'';
  for(const key of ['stoneType','colour','variant'])out[key]=typeof raw[key]==='string'?raw[key].slice(0,150):null;
  // Published dimensions can describe a range, not the exact photographed slab.
  // The renderer therefore always requires explicit preview assumptions.
  out.physicalDimensions=null;
  return out;
}
async function materialCommand(params,config,fetcher){
  const response=await fetcher(`${SITE}/api/apps/${APP}/functions/hmg-workflow/execute/`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Accept:'application/json','Content-Type':'application/json',Authorization:`Api-Key ${config.apiKey}`},body:JSON.stringify({async:false,params})});
  if(!response.ok)throw Error('Material catalogue unavailable');
  const result=await readJson(response);
  if(result?.status!=='success'||result?.data?.ok!==true)throw Error('Material catalogue unavailable');
  return result.data.data;
}
export async function handleMaterials(query,config,fetcher=fetch){
  if(config.siteUrl?.replace(/\/$/,'')!==SITE||config.appSlug!==APP||!config.apiKey)return failure(503,'GATEWAY_UNAVAILABLE','The material catalogue is not configured.');
  const allowed=new Set(['assetId','search','stoneType','colour','page','pageSize']);
  for(const key of query.keys())if(!allowed.has(key)||query.getAll(key).length!==1)return failure(400,'VALIDATION','Invalid material filter.');
  const assetId=query.get('assetId'),search=query.get('search')||'',stoneType=query.get('stoneType')||'',colour=query.get('colour')||'';
  const page=Number(query.get('page')||1),pageSize=Number(query.get('pageSize')||12);
  if((assetId!==null&&!MATERIAL_ID.test(assetId))||search.length>100||stoneType.length>100||colour.length>100||!Number.isSafeInteger(page)||page<1||page>10000||!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>48)return failure(400,'VALIDATION','Invalid material filter.');
  try{
    const raw=await materialCommand(assetId?{command:'getStoneMaterial',payload:{assetId}}:{command:'listStoneMaterials',payload:{search,stoneType,colour,page,pageSize}},config,fetcher);
    if(assetId){if(raw?.id!==assetId)throw Error('Mismatched material');return {status:200,body:{ok:true,data:materialProjection(raw)}};}
    if(!object(raw)||!Array.isArray(raw.data)||raw.data.length>pageSize||!Number.isSafeInteger(raw.total)||raw.total<0)throw Error('Invalid material list');
    const facet=key=>Array.isArray(raw[key])?raw[key].filter(v=>typeof v==='string'&&v.length<=150).slice(0,200):[];
    return {status:200,body:{ok:true,data:{data:raw.data.map(materialProjection),total:raw.total,page,pageSize,types:facet('types'),colours:facet('colours')}}};
  }catch{return failure(502,'MATERIALS_UNAVAILABLE','The official material catalogue could not be loaded. Please retry.');}
}
function imagePath(assetId){
  if(/^hmg-gallery-\d{3}$/.test(assetId)){
    const asset=galleryAssets.find(item=>item.id===assetId),filename=typeof asset?.localUrl==='string'?asset.localUrl.slice('/hmg-gallery/'.length):'';
    if(!/^[A-Za-z0-9._ -]{1,180}$/.test(filename)||filename.includes('..'))return null;
    const expected=STORAGE_GALLERY_PREFIX+encodeURIComponent(filename)+'/';
    return {url:expected,kind:'gallery'};
  }
  return MATERIAL_ID.test(assetId)?{kind:'material'}:null;
}
function sweepTickets(now=Date.now()){
  for(const [key,item] of privateImageTickets)if(item.until<=now){privateImageBytes-=item.bytes.length;privateImageTickets.delete(key);}
  while(privateImageTickets.size>=PRIVATE_IMAGE_MAX_TICKETS||privateImageBytes>PRIVATE_IMAGE_MAX_BYTES){const oldest=privateImageTickets.keys().next().value;if(!oldest)break;privateImageBytes-=privateImageTickets.get(oldest).bytes.length;privateImageTickets.delete(oldest);}
}
async function readApprovedImage(url,config,fetcher){
  const parsed=new URL(url);
  if(parsed.origin!==SITE||(!url.startsWith(STORAGE_GALLERY_PREFIX)&&!url.startsWith(STORAGE_MATERIAL_PREFIX)))throw Error('Invalid private object location');
  const image=await fetcher(url,{method:'GET',headers:{Accept:'*/*',Authorization:`Api-Key ${config.apiKey}`},credentials:'omit',redirect:'error',signal:AbortSignal.timeout(20000)});
  const contentType=(image.headers.get('content-type')||'').split(';')[0];
  if(!image.ok||!['image/jpeg','image/png','image/webp'].includes(contentType)||!image.body)throw Error('Image unavailable');
  const reader=image.body.getReader(),chunks=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8*1024*1024){await reader.cancel();throw Error('Image exceeds limit');}chunks.push(value);}}finally{reader.releaseLock();}
  const bytes=Buffer.concat(chunks);
  const signature=contentType==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:contentType==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
  if(!signature||bytes.length<12)throw Error('Invalid image signature');
  return {bytes,contentType};
}
export async function handleImageTicket(body,token,config,fetcher=fetch){
  if(config.siteUrl?.replace(/\/$/,'')!==SITE||config.appSlug!==APP||!config.apiKey)return failure(503,'GATEWAY_UNAVAILABLE','Private image delivery is not configured.');
  if(!object(body)||Object.keys(body).length!==1||typeof body.assetId!=='string')return failure(400,'VALIDATION','Invalid image request.');
  const approved=imagePath(body.assetId);if(!approved)return failure(400,'VALIDATION','Unknown image reference.');
  try{
    const verified=await verifyHmgSession(token,fetcher);if(verified.error)return verified.error;
    if(privateImageTickets.size>=PRIVATE_IMAGE_MAX_TICKETS)sweepTickets();
    if(approved.kind==='material'){
      const raw=await materialCommand({command:'getStoneMaterial',payload:{assetId:body.assetId}},config,fetcher);
      materialProjection(raw);
      if(raw.id!==body.assetId||typeof raw.storageUrl!=='string'||!raw.storageUrl.startsWith(STORAGE_MATERIAL_PREFIX)||!new RegExp(`^${body.assetId}\\.(jpg|jpeg|png|webp)/$`).test(raw.storageUrl.slice(STORAGE_MATERIAL_PREFIX.length)))return failure(502,'IMAGE_UNAVAILABLE','The approved image is unavailable.');
      approved.url=raw.storageUrl;
    }
    const asset=await readApprovedImage(approved.url,config,fetcher);
    if(asset.bytes.length>PRIVATE_IMAGE_MAX_BYTES)return failure(413,'IMAGE_TOO_LARGE','The approved image exceeds the delivery limit.');
    sweepTickets();while(privateImageBytes+asset.bytes.length>PRIVATE_IMAGE_MAX_BYTES&&privateImageTickets.size){const key=privateImageTickets.keys().next().value;privateImageBytes-=privateImageTickets.get(key).bytes.length;privateImageTickets.delete(key);}
    if(privateImageBytes+asset.bytes.length>PRIVATE_IMAGE_MAX_BYTES)return failure(429,'IMAGE_BUSY','Image delivery is busy. Retry shortly.');
    const ticket=randomBytes(32).toString('base64url');
    privateImageTickets.set(ticket,{bytes:asset.bytes,contentType:asset.contentType,until:Date.now()+PRIVATE_IMAGE_TTL});privateImageBytes+=asset.bytes.length;
    return {status:200,body:{ok:true,data:{url:`/api/hmg/private-images/${ticket}`,expiresInSeconds:PRIVATE_IMAGE_TTL/1000}}};
  }catch{return failure(502,'IMAGE_UNAVAILABLE','The approved HMG image could not be loaded.');}
}
export function handlePrivateImage(ticket,now=Date.now()){
  if(typeof ticket!=='string'||!/^[A-Za-z0-9_-]{40,50}$/.test(ticket))return failure(404,'NOT_FOUND','Image unavailable.');
  sweepTickets(now);const entry=privateImageTickets.get(ticket);
  if(!entry)return failure(404,'NOT_FOUND','Image unavailable.');
  return {status:200,bytes:entry.bytes,contentType:entry.contentType};
}
