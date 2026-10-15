import{readFileSync,writeFileSync}from'node:fs';import{homedir}from'node:os';import{join}from'node:path';import{randomUUID}from'node:crypto';import{loadEnv}from'vite';
import{handleWorkflow}from'../../server/hmg/gateway.mjs';
// Run after independent security review. Uses genuine separately authenticated QA sessions.
const secrets=JSON.parse(readFileSync(join(homedir(),'.hmg-demo','accounts-20261005.json'),'utf8'));
const env=loadEnv('development',process.cwd(),'');const config={siteUrl:env.TARUVI_SITE_URL,appSlug:env.TARUVI_APP_SLUG,apiKey:env.TARUVI_API_KEY};
const accounts=Object.fromEntries(secrets.accounts.map(a=>[a.label,a]));const evidence=[];
const record=(name,pass,details={})=>{evidence.push({name,pass:!!pass,...details});writeFileSync('backend/hmg/live-role-progress.json',JSON.stringify({at:new Date().toISOString(),evidence},null,2));if(!pass)throw new Error(name);};
const run=async(label,envelope)=>{const r=await handleWorkflow(envelope,accounts[label].sessionToken,config);return r.body;};
record('Gateway rejects absent session',(await handleWorkflow({command:'context'},'',config)).status===401);
record('Gateway rejects forged actor envelope',(await handleWorkflow({command:'context',verifiedActor:{id:'forged',is_superuser:true}},accounts.customer.sessionToken,config)).status===400);
record('Gateway rejects nested role claims',(await handleWorkflow({command:'createProject',payload:{roles:['Super Admin']}},accounts.customer.sessionToken,config)).status===400);
for(const label of Object.keys(accounts)){
 const result=await run(label,{command:'context'});record(`${label} genuine session context`,result.ok&&result.data.actorId===accounts[label].id,{isStaff:result.data?.isStaff,canPrice:result.data?.canPrice,isExecutive:result.data?.isExecutive});
}
for(const label of ['customer','second_customer','consultant','operations']){
 const headers={'X-Session-Token':accounts[label].sessionToken};
 const table=await fetch(secrets.site+'/api/apps/hmg_stones/datatables/hmg_revisions/data/',{headers,redirect:'error'});
 record(`${label} direct private table denied`,[401,403].includes(table.status),{httpStatus:table.status});
 const fn=await fetch(secrets.site+'/api/apps/hmg_stones/functions/hmg-workflow/execute/',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({async:false,params:{command:'context',verifiedActor:{id:accounts.sales_head.id,is_superuser:true,is_active:true}}}),redirect:'error'});
 record(`${label} direct elevated function denied`,[401,403].includes(fn.status),{httpStatus:fn.status});
}
let r=await run('customer',{command:'createProject',idempotencyKey:randomUUID(),payload:{name:'Disposable role workflow',brief:{quantity:'120'}}});record('Customer creates persisted project',r.ok);const pid=r.data.id;let version=r.version;
async function mutate(label,command,payload={}){const result=await run(label,{command,projectId:pid,expectedVersion:version,idempotencyKey:randomUUID(),payload});record(`${label}:${command}`,result.ok,{code:result.error?.code});version=result.version;return result;}
r=await run('second_customer',{command:'getProject',projectId:pid});record('Cross customer guessed project denied',!r.ok&&r.error.code==='NOT_FOUND');
r=await run('customer',{command:'getSalesProject',projectId:pid});record('Customer staff route denied',!r.ok&&r.error.code==='FORBIDDEN');
r=await mutate('customer','saveQuestion',{text:'Disposable question'});const qid=r.data.questions[0].id;await mutate('customer','saveQuestion',{id:qid,text:'Edited question'});await mutate('customer','deleteQuestionDraft',{id:qid});
const scene={version:1,mode:'geometry_3d',visualizationStatus:'ready',surface:'wall',room:{width:5,height:3,depth:4},camera:{position:[6,4,7],target:[0,1,0]},title:'Role test geometry',note:'',reference:{assetId:'gallery-1',zoom:1,pan:[0,0],annotations:[]}};
r=await mutate('customer','saveConcept',{name:'Disposable geometry',scene});const cid=r.data.concepts[0].id;await mutate('customer','saveConcept',{id:cid,name:'Updated geometry',scene:{...scene,title:'Updated'}});await mutate('customer','deleteConcept',{id:cid});
const [a,b,c]=['10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003'];
for(const optionId of [a,b,c])await mutate('customer','addToShortlist',{optionId});await mutate('customer','recordPreference',{optionId:a,reason:'Quiet appearance'});await mutate('customer','rejectOption',{optionId:c,reason:'Too much visual movement'});
const key=randomUUID();r=await run('customer',{command:'createInquiry',projectId:pid,expectedVersion:version,idempotencyKey:key,payload:{acknowledged:true}});record('Customer advice request saved',r.ok);version=r.version;const replay=await run('customer',{command:'createInquiry',projectId:pid,expectedVersion:version-1,idempotencyKey:key,payload:{acknowledged:true}});record('Customer inquiry replay one revision',replay.ok&&replay.version===version&&replay.data.inquiries.length===1);
r=await run('consultant',{command:'getSalesProject',projectId:pid});record('Assigned consultant sees same request',r.ok&&r.data.inquiries.length===1&&r.data.tasks[0].ownerId===accounts.consultant.id);
r=await mutate('consultant','saveStaffNote',{text:'PRIVATE_COMMERCIAL_QA'});const noteId=r.data.notes[0].id;await mutate('consultant','saveStaffNote',{id:noteId,text:'PRIVATE_COMMERCIAL_QA_UPDATED'});
r=await run('operations',{command:'getSalesProject',projectId:pid});record('Assigned operations safe response',r.ok&&!JSON.stringify(r).includes('PRIVATE_COMMERCIAL')&&!('quoteHistory'in r.data)&&!('notes'in r.data));
for(const command of ['getQuote','createQuoteDraft','requestPriceApproval','saveStaffNote']){r=await run('operations',{command,projectId:pid,payload:{}});record(`Operations ${command} forbidden`,!r.ok&&r.error.code==='FORBIDDEN');}
r=await mutate('consultant','createQuoteDraft');record('Role quote 5 percent total',r.data.quote.totals.total==='96181.80');const lines=r.data.quote.lines;lines[0].discountPct='8';r=await mutate('consultant','saveQuoteRevision',{lines});record('Role quote 8 percent total and margin',r.data.quote.totals.total==='93144.48'&&r.data.quote.financials.grossMarginPct==='29.77');await mutate('consultant','requestPriceApproval',{reason:'Demo negotiation scenario'});
r=await run('consultant',{command:'reviewPriceApproval',projectId:pid,expectedVersion:version,idempotencyKey:randomUUID(),payload:{approved:true,note:'Must deny'}});record('Consultant cannot self approve',!r.ok);
await mutate('sales_head','reviewPriceApproval',{approved:true,note:'Approved for this fictional demo revision only.'});r=await mutate('consultant','createProposalSnapshot');const proposalId=r.data.proposals[0].id;
r=await run('customer',{command:'getProposal',projectId:pid,payload:{proposalId}});record('Customer proposal excludes private fields deeply',r.ok&&!JSON.stringify(r).includes('financials')&&!JSON.stringify(r).includes('costTotal')&&!JSON.stringify(r).includes('PRIVATE_COMMERCIAL')&&!JSON.stringify(r).includes('requesterId')&&r.data.currentness==='Current');
await mutate('consultant','markDemoLotUnavailable',{optionId:a,reason:'Fictional lot unavailable'});r=await run('customer',{command:'getProject',projectId:pid});record('Unavailable preserves preference and marks snapshots stale',r.data.preferredOptionId===a&&r.data.inquiries[0].currentness==='Stale'&&r.data.proposals[0].currentness==='Stale'&&r.data.rejected[c]);
await mutate('customer','recordPreference',{optionId:b,reason:'Balanced alternative'});await mutate('customer','createInquiry',{acknowledged:true});r=await mutate('consultant','saveQuoteRevision',{lines});record('Successor quote binds new inquiry and loses old approval',r.data.quote.inquiryRevisionId===r.data.inquiries.at(-1).id&&!r.data.quote.approval&&r.data.quoteHistory.length>=2);
await mutate('consultant','deleteStaffNoteDraft',{id:noteId});
r=await run('executive',{command:'overview'});record('Executive four computed metrics',r.ok&&['preferredDirections','adviceRequestsWaiting','quotesAwaitingPriceReview','selectionsChangedAfterQuote'].every(k=>typeof r.data[k]==='number'));
await mutate('customer','archiveProject');r=await run('customer',{command:'getProject',projectId:pid});record('Customer archive readback',r.ok&&r.data.archived);
writeFileSync('backend/hmg/live-role-verification.json',JSON.stringify({at:new Date().toISOString(),disposableProjectId:pid,version,evidence,transport:'Real session validation and Taruvi HTTP through production gateway handler; no browser UI assertions.'},null,2));console.log(JSON.stringify({checks:evidence.length,passed:evidence.filter(x=>x.pass).length,disposableProjectId:pid}));
