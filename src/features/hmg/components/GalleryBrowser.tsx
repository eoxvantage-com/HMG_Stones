import { useEffect, useState } from 'react';
import { Alert, Box, Button, Card, CardActionArea, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Link, MenuItem, Stack, TablePagination, TextField, Typography } from '@mui/material';
import { useGallery } from '../galleryApi';
import { requestPrivateImageUrl } from '../api';
import type { GalleryReference } from '../design/galleryReferences';
import { EmptyState, LoadError, LoadingState } from './common';

export function GalleryImage({asset,full=false,onSelect}:{asset:GalleryReference;full?:boolean;onSelect?:()=>void}) {
  const [failed,setFailed]=useState(false);
  const [attempt,setAttempt]=useState(0);
  const [imageUrl,setImageUrl]=useState('');
  useEffect(()=>{const controller=new AbortController();setFailed(false);setImageUrl('');requestPrivateImageUrl(asset.id,controller.signal).then(url=>setImageUrl(url)).catch(()=>{if(!controller.signal.aborted)setFailed(true);});return()=>controller.abort();},[asset.id,attempt]);
  const picture=imageUrl?<Box component="img" key={`${asset.id}:${attempt}`} src={imageUrl} alt={asset.title} loading="lazy" decoding="async" onError={()=>setFailed(true)} sx={{display:'block',width:'100%',aspectRatio:full?undefined:'4/3',maxHeight:full?'70vh':undefined,objectFit:full?'contain':'cover'}}/>:<Box role="status" aria-label={`Loading ${asset.title}`} sx={{aspectRatio:'4/3',display:'grid',placeContent:'center',p:2}}><Typography variant="caption">{failed?'Image could not load':'Loading private image…'}</Typography></Box>;
  return failed ? <Box sx={{aspectRatio:'4/3',display:'grid',placeContent:'center',textAlign:'center',p:2}}>
    <Typography>Image could not load</Typography><Button onClick={()=>{setFailed(false);setAttempt(x=>x+1);}}>Retry image</Button>
  </Box> : onSelect?<CardActionArea aria-label={`Preview and select ${asset.title}`} onClick={onSelect}>{picture}</CardActionArea>:picture;
}

/** Shared server-filtered, paginated browser; photographs are never assigned to fictional products. */
export function GalleryBrowser({onSelect,selectedId,compact=false,mode='gallery',container}:{onSelect?:(asset:GalleryReference)=>void;selectedId?:string;compact?:boolean;mode?:'gallery'|'materials';container?:HTMLElement|null}) {
  const [input,setInput]=useState('');const [search,setSearch]=useState('');const [category,setCategory]=useState('');const [page,setPage]=useState(1);const [pageSize,setPageSize]=useState(compact?6:12);
  const [colour,setColour]=useState('');const materials=mode==='materials';
  const [detail,setDetail]=useState<GalleryReference>();
  useEffect(()=>{const timer=setTimeout(()=>{setSearch(input);setPage(1);},350);return()=>clearTimeout(timer);},[input]);
  const query=useGallery({search,category,colour,page,pageSize},mode);
  return <Stack spacing={2}>
    <Stack direction={{xs:'column',sm:compact?'column':'row'}} spacing={2}>
      <TextField label={materials?'Search HMG stones':'Search HMG gallery'} value={input} onChange={e=>setInput(e.target.value)} fullWidth/>
      <TextField select SelectProps={{MenuProps:{container}}} label={materials?'Stone type':'Gallery collection'} value={category} onChange={e=>{setCategory(e.target.value);setPage(1);}} fullWidth>
        <MenuItem value="">{materials?'All stone types':'All collections'}</MenuItem>{(materials?query.data?.types||[]:query.data?.categories||['Experience Centre - 1 Sankey Road','HMG Factory 1']).map(c=><MenuItem key={c} value={c}>{c}</MenuItem>)}
      </TextField>
      {materials&&<TextField select SelectProps={{MenuProps:{container}}} label="Stone colour" value={colour} onChange={e=>{setColour(e.target.value);setPage(1);}} fullWidth><MenuItem value="">All published colours</MenuItem>{(query.data?.colours||[]).map(c=><MenuItem key={c} value={c}>{c}</MenuItem>)}</TextField>}
    </Stack>
    {(search||category||colour)&&<Stack direction="row" gap={1} flexWrap="wrap">{search&&<Chip label={`Search: ${search}`} onDelete={()=>{setInput('');setSearch('');setPage(1);}}/>}{category&&<Chip label={category} onDelete={()=>{setCategory('');setPage(1);}}/>}{colour&&<Chip label={colour} onDelete={()=>{setColour('');setPage(1);}}/>}<Button onClick={()=>{setInput('');setSearch('');setCategory('');setColour('');setPage(1);}}>Clear filters</Button></Stack>}
    {query.loading?<LoadingState/>:query.error?<LoadError retry={()=>query.refetch()}/>:!query.data?.total?<EmptyState title={search?'No results found':category||colour?'No matching items':materials?'No sourced stones yet':'No gallery images yet'} description={search||category||colour?'Try another search or filter.':'Verified HMG references will appear here.'}/>:<>
      <Typography variant="caption">{query.data.total} {materials?'official product references. Natural variations and screen colours differ from the final slab.':'verified gallery references. Inspiration photographs, not product specifications.'}</Typography>
      <Box sx={{display:'grid',gridTemplateColumns:compact?'repeat(2,minmax(0,1fr))':{xs:'1fr',sm:'repeat(2,minmax(0,1fr))',lg:'repeat(3,minmax(0,1fr))'},gap:2}}>
        {query.data.data.map(asset=><Card key={asset.id} variant="outlined" sx={{minWidth:0,outline:asset.id===selectedId?'2px solid':undefined,outlineColor:'primary.main'}}>
          <GalleryImage asset={asset} onSelect={()=>onSelect?onSelect(asset):setDetail(asset)}/>
          <CardActionArea aria-label={`Select ${asset.title}`} onClick={()=>onSelect?onSelect(asset):setDetail(asset)}><CardContent sx={{p:compact?1:2}}>
            <Typography variant="subtitle2">{asset.title}</Typography><Typography variant="caption" color="text.secondary">{asset.category}</Typography>{materials&&<Typography variant="caption" display="block">{asset.colour||'Colour not published'}{asset.variant?` / ${asset.variant}`:''}</Typography>}<Typography variant="caption" display="block">{asset.surfaceEligible?'Surface preview eligible':materials?'Reference only':'Inspiration only'}</Typography>
          </CardContent></CardActionArea>
        </Card>)}
      </Box>
      <TablePagination SelectProps={{MenuProps:{container}}} component="div" count={query.data.total} page={page-1} rowsPerPage={pageSize} rowsPerPageOptions={compact?[6,12]:[12,24,48]} onPageChange={(_,p)=>setPage(p+1)} onRowsPerPageChange={e=>{setPageSize(Number(e.target.value));setPage(1);}} sx={{'.MuiTablePagination-toolbar':{flexWrap:'wrap',px:0},'.MuiTablePagination-spacer':{display:compact?'none':undefined}}}/>
    </>}
    <Dialog container={container} open={!!detail} onClose={()=>setDetail(undefined)} fullWidth maxWidth="md"><DialogTitle>{detail?.title}</DialogTitle><DialogContent>{detail&&<Stack spacing={2}><GalleryImage asset={detail} full/><Typography>{detail.category} · {detail.width} × {detail.height}px</Typography><Typography variant="body2">Source caption: {detail.sourceCaption}</Typography><Alert severity="info">{detail.eligibilityReason} {materials ? "Preview dimensions, price and availability are not asserted. See the official source for published product information." : "No product identity, dimensions, price or availability is asserted."}</Alert><Link href={detail.sourcePageUrl} target="_blank" rel="noopener noreferrer">Official HMG source</Link></Stack>}</DialogContent><DialogActions><Button onClick={()=>setDetail(undefined)}>Close</Button></DialogActions></Dialog>
  </Stack>;
}



