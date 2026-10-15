import{call,decode}from './mcp.mjs';
import{writeFileSync}from'node:fs';
const ids=['10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003'];
const options=['Warm quiet direction','Balanced warm direction','Expressive direction'].map((title,i)=>({id:ids[i],title,tone:'Warm',movement:i===2?'Expressive':'Restrained',application:'Feature wall',status:'Demo concept',data:{code:`DEMO-OPT-${'ABC'[i]}`,imageUse:'Gallery inspiration, not an image of this fictional material or stock.',technicalSuitability:'Unknown — requires evidence',availability:'Fictional demo only',galleryAssetId:`gallery-${i+1}`}}));
const existing=decode(await call('datatable_data',{action:'query',table_name:'hmg_options',limit:10}));
console.log('Existing options',JSON.stringify(existing).slice(0,500));
if((existing.data?.length??existing.data?.data?.length??0)===0)console.log('Seed options',JSON.stringify(decode(await call('datatable_data',{action:'upsert',table_name:'hmg_options',data:options,unique_fields:'id'}))));
async function command(params){const r=decode(await call('execute_function',{function_slug:'hmg-workflow',params}));if(!r.success||!r.result?.ok)throw new Error(JSON.stringify(r));return r.result;}
const output=[];
for(const [index,name]of ['Courtyard Home','Atrium Office','Garden Suite'].entries()){
 let r=await command({command:'createProject',idempotencyKey:`hmg-seed-project-${index}-v1`,payload:{name,brief:{quantity:'120',priorities:['Warm light appearance','Restrained visual movement']}}});
 const pid=r.data.id;let version=r.version;
 async function mutate(commandName,payload={}){r=await command({command:commandName,projectId:pid,expectedVersion:version,idempotencyKey:`hmg-seed-${index}-${commandName}-${version}`,payload});version=r.version;}
 if(version===1){
   if(index===0){for(const optionId of ids)await mutate('addToShortlist',{optionId});await mutate('recordPreference',{optionId:ids[0],reason:'Warm, restrained appearance supports this living room.'});await mutate('rejectOption',{optionId:ids[2],reason:'Too much visual movement for this room.'});for(const text of ['Which real material and slab match this direction?','Is it suitable for this feature-wall installation?','Who will verify the final quantity?'])await mutate('saveQuestion',{text});}
   else {await mutate('saveQuestion',{text:index===1?'Who will verify final measurements?':'Can the application suitability be verified?'});await mutate('updateSalesStage',{stage:index===1?'Consultation':'Verification'});}
 }
 output.push({name,projectId:pid,version});
}
writeFileSync('backend/hmg/seed-result.json',JSON.stringify({options:ids,projects:output},null,2));console.log(JSON.stringify(output));
