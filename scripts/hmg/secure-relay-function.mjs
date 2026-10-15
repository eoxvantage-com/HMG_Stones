import{call,decode}from'./mcp.mjs';import{readFileSync,writeFileSync}from'node:fs';
// Tightens only the function policy generated during this implementation.
const existing=decode(await call('manage_policies',{action:'get',name_regexp:'hmg.workflow'}));
writeFileSync('backend/hmg/function-policy-before-relay.json',JSON.stringify(existing,null,2));
const policy={name:'hmg-workflow',policy_type:'resource',entity_type:'function',version:'default',rules:[{actions:['execute'],roles:['Super Admin'],effect:'EFFECT_ALLOW',name:'hmg_service_relay_only'}]};
writeFileSync('backend/hmg/function-policy-relay-preview.json',JSON.stringify(policy,null,2));
const applied=decode(await call('manage_policies',{action:'create_update',policy_data:policy}));if(!applied.success)throw new Error(JSON.stringify(applied));
const deployed=decode(await call('manage_function',{action:'create_update',function_slug:'hmg-workflow',name:'hmg-workflow',execution_mode:'app',is_public:false,code:readFileSync('backend/hmg/functions/commands.py','utf8').replace(/^\uFEFF/,'')}));
if(!deployed.success)throw new Error(deployed.error??'Deploy not confirmed');
writeFileSync('backend/hmg/policies-final.json',JSON.stringify(decode(await call('manage_policies',{action:'get'})),null,2));
console.log(JSON.stringify({success:true,version:deployed.data?.version,policyId:applied.data?.policy_id}));
