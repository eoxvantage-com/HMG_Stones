import{call,decode}from './mcp.mjs';import{writeFileSync}from'node:fs';
const results={};
for(const params of [{command:'getOption',payload:{optionId:'10000000-0000-4000-8000-000000000001'}},{command:'listProjects'},{command:'overview'}]){
 const r=decode(await call('execute_function',{function_slug:'hmg-workflow',params}));
 if(!r.success||!r.result?.ok)throw new Error(JSON.stringify(r));
 results[params.command]=params.command==='listProjects'?{total:r.result.data.total,projects:r.result.data.data.map(x=>({id:x.id,name:x.name,version:x.version}))}:r.result;
}
writeFileSync('backend/hmg/final-readback.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
