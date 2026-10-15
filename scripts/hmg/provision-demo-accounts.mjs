import {call,decode} from './mcp.mjs';
import {randomBytes} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';

// Run only after explicit user approval. Folder must already have current-user-only ACL.
const privatePath=join(homedir(),'.hmg-demo','accounts-20261005.json');
const state=existsSync(privatePath)?JSON.parse(readFileSync(privatePath,'utf8')):{site:'https://insurance.taruvi.cloud',app:'hmg_stones',roles:{},accounts:[]};
const persist=()=>writeFileSync(privatePath,JSON.stringify(state,null,2),{mode:0o600});
const roles=['HMG Customer','HMG Consultant','HMG Operations','HMG Sales Head','HMG Executive'];
const existing=decode(await call('manage_roles',{action:'list'}));
for(const name of roles){
 if(state.roles[name])continue;
 if(existing.data?.roles?.some(r=>r.name===name))throw new Error(`Role ${name} already exists; inspect exact slug rather than guessing`);
 const r=decode(await call('manage_roles',{action:'create',name,description:'Isolated fictional HMG demo; no organization privileges'}));
 if(!r.success||!r.data?.slug)throw new Error(`Role creation not confirmed for ${name}`);
 state.roles[name]=r.data.slug;persist();
}
for(const [label,role] of [['customer','HMG Customer'],['second_customer','HMG Customer'],['consultant','HMG Consultant'],['operations','HMG Operations'],['sales_head','HMG Sales Head'],['executive','HMG Executive']]){
 let account=state.accounts.find(a=>a.label===label);
 if(account?.id)continue;
 if(account)throw new Error(`Uncertain prior creation for ${label}; use read-only user lookup before any retry`);
 account={label,role,username:`qa_hmg_${label}_20261005`,email:`qa_hmg_${label}_20261005@example.invalid`,password:`HmG!${randomBytes(24).toString('base64url')}9a`};
 state.accounts.push(account);persist();
 const r=decode(await call('create_user',{username:account.username,email:account.email,password:account.password,first_name:'HMG Demo',last_name:label.replaceAll('_',' '),is_active:true,is_staff:false,role_slugs:[state.roles[role]]}));
 if(!r.success)throw new Error(`Account creation not confirmed for ${label}: ${r.error??'unknown response'}`);
 account.id=r.data?.id??r.data?.user?.id??r.user?.id;
 if(!account.id)throw new Error(`Account ${label} created but response ID shape requires inspection`);
 persist();
}
const publicState={site:state.site,app:state.app,roles:state.roles,accounts:state.accounts.map(({label,role,username,id})=>({label,role,username,id})),credentialsPath:privatePath};
writeFileSync('backend/hmg/demo-identities.json',JSON.stringify(publicState,null,2));
console.log(JSON.stringify(publicState,null,2));
