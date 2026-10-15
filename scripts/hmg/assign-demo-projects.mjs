import{call,decode}from'./mcp.mjs';import{readFileSync,writeFileSync}from'node:fs';
const seed=JSON.parse(readFileSync('backend/hmg/seed-result.json','utf8'));const identities=JSON.parse(readFileSync('backend/hmg/demo-identities.json','utf8'));
const output=[];
for(const [i,project] of seed.projects.entries()){
 const read=decode(await call('execute_function',{function_slug:'hmg-workflow',params:{command:'getProject',projectId:project.projectId}}));
 if(!read.result?.ok)throw new Error('Project read failed');
 const customerId=identities.accounts.find(a=>a.label===(i===2?'second_customer':'customer')).id;
 const r=decode(await call('execute_function',{function_slug:'hmg-workflow',params:{command:'configureDemoProject',projectId:project.projectId,expectedVersion:read.result.version,idempotencyKey:`configure-demo-members-${project.projectId}-v1`,payload:{customerId}}}));
 if(!r.result?.ok)throw new Error(JSON.stringify(r.result?.error??r.error));
 output.push({id:project.projectId,name:project.name,ownerId:r.result.data.ownerId,participants:r.result.data.participants,version:r.result.version});
}
writeFileSync('backend/hmg/demo-project-membership.json',JSON.stringify(output,null,2));console.log(JSON.stringify(output,null,2));
