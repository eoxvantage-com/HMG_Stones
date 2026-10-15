/** Small, deterministic MCP pages avoid the provider's large-result TOON envelope. */
export async function readExistingOptions(call, decode) {
 const rows=[],seen=new Set();let expectedTotal;
 for(let offset=0;offset<1000;offset+=5){
  const result=decode(await call('datatable_data',{action:'query',table_name:'hmg_options',ordering:'id',limit:5,offset}));
  if(result.success!==true||!Array.isArray(result.data)||!Number.isSafeInteger(result.total)||result.total<0||result.total>1000)throw Error('Existing catalogue page unavailable or beyond import bound');
  expectedTotal??=result.total;
  if(result.total!==expectedTotal||result.data.length>5)throw Error('Catalogue changed during read; stop before import');
  for(const row of result.data){if(typeof row.id!=='string'||seen.has(row.id))throw Error('Duplicate or invalid catalogue identity');seen.add(row.id);rows.push(row);}
  if(rows.length===expectedTotal)return rows;
  if(!result.data.length||rows.length>expectedTotal)throw Error('Incomplete catalogue read; stop before import');
 }
 throw Error('Catalogue read exceeded import bound');
}
