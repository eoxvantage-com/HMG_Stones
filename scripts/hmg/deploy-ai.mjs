import{call,decode}from'./mcp.mjs';import{readFileSync,writeFileSync}from'node:fs';
// Run only after independent security review and user backend-publish authorization.
const prior=decode(await call('manage_function',{action:'list'}));
if(prior.data?.some(x=>x.slug==='hmg-ai-findings'))throw Error('Existing AI function found; inspect before replacing');
const policyBefore=decode(await call('manage_policies',{action:'get',name_regexp:'^hmg-ai-findings$'}));
writeFileSync('backend/hmg/ai-policy-before.json',JSON.stringify(policyBefore,null,2));
if(!policyBefore.success||policyBefore.data?.policies?.length)throw Error('Existing or unconfirmed AI policy; inspect before replacing');
const policy={name:'hmg-ai-findings',policy_type:'resource',entity_type:'function',version:'default',rules:[{actions:['execute'],roles:['Super Admin'],effect:'EFFECT_ALLOW',name:'hmg_ai_service_only'}]};
const shared=readFileSync('backend/hmg/functions/commands.py','utf8').replace(/^\uFEFF/,'').split('\ndef main(')[0];
const code=shared+'\n'+readFileSync('backend/hmg/functions/ai_findings.py','utf8').replace(/^\uFEFF/,'');
const result=decode(await call('manage_function',{action:'create_update',name:'hmg-ai-findings',execution_mode:'app',is_public:false,code,description:'Optional customer-visible evidence findings. Human review only, no workflow writes.'}));
if(!result.success)throw Error(JSON.stringify({error:result.error}));
const applied=decode(await call('manage_policies',{action:'create_update',policy_data:policy}));
if(!applied.success)throw Error('AI execute policy not confirmed; do not invoke');
writeFileSync('backend/hmg/ai-deployment.json',JSON.stringify({at:new Date().toISOString(),slug:result.data?.slug,version:result.data?.version,policy,provider:'OpenAI',model:'gpt-4.1-mini',systemModeReason:'No installed system functions; custom Python uses documented app mode.'},null,2));
console.log(JSON.stringify({success:true,slug:result.data?.slug,version:result.data?.version}));
