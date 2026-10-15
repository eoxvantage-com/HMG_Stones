import{call,decode}from './mcp.mjs';
import{writeFileSync}from'node:fs';
const field=(name,type='string',extra={})=>({name,type,...extra});
const required={constraints:{required:true}};
const schema={name:'hmg-demo',resources:[
 {name:'hmg_options',schema:{fields:[field('id','string',{...required}),field('title','string',required),field('tone'),field('movement'),field('application'),field('status'),field('data','object',required)],primaryKey:['id']}},
 {name:'hmg_revisions',audit_enabled:true,schema:{fields:[field('id','string',required),field('project_id','string',required),field('version','integer',required),field('command_key','string',{constraints:{required:true,unique:true}}),field('owner_id','string',required),field('name','string',required),field('stage'),field('archived','boolean'),field('created_at','datetime'),field('snapshot','object',required)],primaryKey:['id'],indexes:[{name:'hmg_project_version_uq',fields:['project_id','version'],unique:true},{name:'hmg_project_lookup',fields:['project_id']},{name:'hmg_owner_lookup',fields:['owner_id']}]} }
]};
writeFileSync('backend/hmg/schema.json',JSON.stringify(schema,null,2));
const before=decode(await call('get_datatable_schema',{}));
if(before.data.some(x=>schema.resources.some(r=>r.name===x.name)))throw new Error('Already provisioned: inspect and preserve schema before updating');
console.log(JSON.stringify(decode(await call('create_update_schema',{datapackage:schema}))));
for(const table_name of schema.resources.map(x=>x.name))writeFileSync(`backend/hmg/${table_name}-schema.json`,JSON.stringify(decode(await call('get_datatable_schema',{table_name})),null,2));
writeFileSync('backend/hmg/policies-after.json',JSON.stringify(decode(await call('manage_policies',{action:'get'})),null,2));
