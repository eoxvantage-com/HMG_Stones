import{readFileSync,writeFileSync}from'node:fs';import{homedir}from'node:os';import{join}from'node:path';
// Endpoint verified against official Python SDK 0.2.1 AuthModule.signInWithPassword.
const path=join(homedir(),'.hmg-demo','accounts-20261005.json');const state=JSON.parse(readFileSync(path,'utf8'));
if(state.site!=='https://insurance.taruvi.cloud'||state.app!=='hmg_stones')throw new Error('Scope mismatch');
const results=[];
for(const account of state.accounts){
 const login=await fetch(state.site+'/_allauth/app/v1/auth/login',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:account.email,password:account.password})});const body=await login.json();
 if(!login.ok){results.push({label:account.label,loginStatus:login.status,errors:body.errors?.map(x=>({code:x.code,param:x.param}))});continue;}
 const token=body.meta?.session_token;
 if(!token){results.push({label:account.label,loginStatus:login.status,metaKeys:Object.keys(body.meta??{}),sessionAvailable:false});continue;}
 account.sessionToken=token;writeFileSync(path,JSON.stringify(state,null,2),{mode:0o600});
 const headers={'X-Session-Token':token};const sr=await fetch(state.site+'/_allauth/app/v1/auth/session',{headers,redirect:'error'});const sb=await sr.json();const ur=await fetch(state.site+'/api/users/me/',{headers,redirect:'error'});const ub=await ur.json();
 results.push({label:account.label,loginStatus:login.status,sessionStatus:sr.status,sessionMeta:{is_authenticated:sb.meta?.is_authenticated},sessionDataKeys:Object.keys(sb.data??{}),userStatus:ur.status,userKeys:Object.keys(ub.data??{}),id:ub.data?.id,is_superuser:ub.data?.is_superuser,roles:ub.data?.roles});
}
writeFileSync('backend/hmg/demo-login-verification.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
