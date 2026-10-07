import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Link, Stack, TextField, Typography } from '@mui/material';
import type { DesignState } from './state';
import { approvedGalleryReferences } from './galleryReferences';
import { requestPrivateImageUrl } from '../api';

export function ReferenceCanvas({ value, onChange }: { value: DesignState; onChange: (next: DesignState) => void }) {
  const image = useRef<HTMLImageElement>(null);
  const drag = useRef<{ x: number; y: number; pan: [number, number] } | null>(null);
  const [note, setNote] = useState('');
  const [placing, setPlacing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [imageUrl,setImageUrl]=useState('');
  useEffect(() => { const controller=new AbortController();setFailed(false);setImageUrl('');setPlacing(false);setNote('');drag.current=null;if(value.reference.assetId)requestPrivateImageUrl(value.reference.assetId,controller.signal).then(setImageUrl).catch(()=>{if(!controller.signal.aborted)setFailed(true);});return()=>controller.abort(); }, [value.reference.assetId]);
  const reference = approvedGalleryReferences.find(item => item.id === value.reference.assetId);
  if (!reference) return <Box sx={{ p: 3, minHeight: 320 }}><Alert severity="info">No gallery reference is currently verified. 3D geometry, concept notes and the rest of your project remain available. No substitute images are used.</Alert></Box>;
  const patch = (data: Partial<DesignState['reference']>) => onChange({ ...value, reference: { ...value.reference, ...data } });
  return <Stack spacing={2}>
    {failed ? <Alert severity="warning">The approved gallery reference could not load. Concept notes remain available.</Alert> : <Box
      tabIndex={0} role="group" aria-label="Gallery reference. Arrow keys pan; use zoom buttons above."
      onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault();
        patch({ pan: [Math.max(-1000, Math.min(1000, value.reference.pan[0] + (event.key === 'ArrowLeft' ? -20 : event.key === 'ArrowRight' ? 20 : 0))),
          Math.max(-1000, Math.min(1000, value.reference.pan[1] + (event.key === 'ArrowUp' ? -20 : event.key === 'ArrowDown' ? 20 : 0)))] });
      }}
      onPointerDown={event => {
        if (placing && image.current) {
          if (!note.trim() || note.length > 500 || value.reference.annotations.length >= 30) { setPlacing(false); return; }
          const rect = image.current.getBoundingClientRect();
          const x = (event.clientX - rect.left) / rect.width; const y = (event.clientY - rect.top) / rect.height;
          if (x >= 0 && x <= 1 && y >= 0 && y <= 1) { patch({ annotations: [...value.reference.annotations, { id: crypto.randomUUID(), x, y, text: note.trim() }] }); setNote(''); setPlacing(false); }
          return;
        }
        event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, y: event.clientY, pan: value.reference.pan };
      }}
      onPointerUp={event => {
        if (!drag.current) return;
        patch({ pan: [Math.max(-1000, Math.min(1000, drag.current.pan[0] + event.clientX - drag.current.x)), Math.max(-1000, Math.min(1000, drag.current.pan[1] + event.clientY - drag.current.y))] }); drag.current = null;
      }}
      onPointerCancel={() => { drag.current = null; }}
      sx={{ overflow: 'hidden', height: { xs: 320, md: 480 }, bgcolor: 'action.hover', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'none', cursor: placing ? 'crosshair' : 'grab' }}>
      <Box sx={{ position: 'relative', maxWidth: '100%', maxHeight: '100%', lineHeight: 0,
        transform: `translate(${value.reference.pan[0]}px, ${value.reference.pan[1]}px) scale(${value.reference.zoom})` }}>
      {imageUrl?<Box component="img" ref={image} src={imageUrl} alt={reference.title} draggable={false} onError={() => setFailed(true)} sx={{ display: 'block', maxWidth: '100%', maxHeight: { xs: 320, md: 480 }, objectFit: 'contain' }} />:<Typography role="status">Loading private HMG reference…</Typography>}
        {value.reference.annotations.map((annotation, index) => <Box key={annotation.id} aria-label={annotation.text} sx={{ position: 'absolute', left: `${annotation.x * 100}%`, top: `${annotation.y * 100}%`, transform: 'translate(-50%, -50%)', width: 24, height: 24, borderRadius: '50%', bgcolor: 'background.paper', color: 'text.primary', border: '1px solid', textAlign: 'center', lineHeight: '24px' }}>{index + 1}</Box>)}
      </Box>
    </Box>}
    <Typography variant="caption">{reference.sourceCaption} ? Source checked {reference.sourceCheckedAt}. <Link href={reference.sourcePageUrl} target="_blank" rel="noopener noreferrer">Original HMG gallery</Link></Typography>
    <Typography variant="caption">HMG gallery inspiration · Material identity not established. This is not a photograph of your room.</Typography>
    <TextField label="Reference annotation" value={note} onChange={event => setNote(event.target.value)} inputProps={{ maxLength: 500 }} helperText="Add at the image centre using the keyboard, or place a marker with a pointer." />
    <Stack direction="row" spacing={1} flexWrap="wrap">
      <Button disabled={!note.trim() || value.reference.annotations.length >= 30} onClick={() => { patch({ annotations: [...value.reference.annotations, { id: crypto.randomUUID(), x: .5, y: .5, text: note.trim() }] }); setNote(''); setPlacing(false); }}>Add centre annotation</Button>
      <Button disabled={!note.trim() || value.reference.annotations.length >= 30} onClick={() => setPlacing(!placing)}>{placing ? 'Cancel placement' : 'Place on image'}</Button>
    </Stack>
    {value.reference.annotations.map((a, index) => <Typography key={a.id} variant="body2">{index + 1}. {a.text}</Typography>)}
  </Stack>;
}
