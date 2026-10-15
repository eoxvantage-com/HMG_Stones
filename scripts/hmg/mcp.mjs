import {loadEnv} from 'vite';
import {pathToFileURL} from 'node:url';
const env=loadEnv('development',process.cwd(),'');
const siteUrl=(env.VITE_TARUVI_API_URL||env.VITE_TARUVI_BASE_URL||env.TARUVI_SITE_URL||'').replace(/\/$/,'');
const appSlug=env.VITE_TARUVI_APP_SLUG||env.TARUVI_APP_SLUG||'';
const apiKey=env.VITE_TARUVI_API_KEY||env.TARUVI_API_KEY||'';
if(appSlug!=='hmg_stones'||siteUrl!=='https://insurance.taruvi.cloud') throw new Error('HMG scope mismatch');
let id=0;
let sessionId;
let initialization;
export async function rpc(method,params={}) {
 if(method!=='initialize') {
   initialization??=rpc('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'hmg-scoped-provisioner',version:'1.0.0'}});
   await initialization;
 }
 const response=await fetch(`${siteUrl}/mcp/`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(180000),headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream','X-App-Slug':'hmg_stones',Authorization:`Api-Key ${apiKey}`,...(sessionId?{'Mcp-Session-Id':sessionId}:{})},body:JSON.stringify({jsonrpc:'2.0',id:++id,method,params})});
 sessionId=response.headers.get('Mcp-Session-Id')??sessionId;
 const body=await response.text();
 if(!response.ok) throw new Error(`MCP HTTP ${response.status}`);
 const dataLines=body.split('\n').filter(line=>line.startsWith('data:'));
 const parsed=dataLines.length?JSON.parse(dataLines.at(-1).slice(5)):JSON.parse(body);
 if(parsed.error) throw new Error(JSON.stringify(parsed.error));
 return parsed.result;
}
export async function call(name,args={}) {return rpc('tools/call',{name,arguments:args});}
export function decode(result) { if(result.structuredContent)return result.structuredContent; const texts=result.content?.filter(x=>x.type==='text').map(x=>x.text).join('\n');try{return JSON.parse(texts)}catch{return texts??result} }
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const name=process.argv[2];console.log(JSON.stringify(name?decode(await call(name,JSON.parse(process.argv[3]||'{}'))):await rpc('tools/list'),null,2));}
