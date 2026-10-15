import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

function insuranceKey() {
  const lines = readFileSync('.env', 'utf8').split(/\r?\n/);
  let active = false;
  for (const line of lines) {
    if (line.startsWith('TARUVI_SITE_URL=https://insurance.taruvi.cloud')) active = true;
    else if (active && line.startsWith('TARUVI_API_KEY=')) return line.slice('TARUVI_API_KEY='.length);
  }
  throw new Error('Insurance Taruvi API key not found');
}

execFileSync('powershell.exe', ['-NoProfile', '-Command', 'Compress-Archive -Path dist\\* -DestinationPath dist.zip -Force'], { stdio: 'inherit' });
const apiKey = insuranceKey();
const zip = readFileSync('dist.zip');
const form = new FormData();
form.append('name', 'HMG Stones');
form.append('is_internal', 'true');
form.append('file', new Blob([zip], { type: 'application/zip' }), 'hmgstones.zip');
const update = await fetch('https://api.taruvi.cloud/sites/insurance/api/cloud/frontend_workers/hmgstones/', {
  method: 'PATCH',
  headers: { Authorization: `Api-Key ${apiKey}` },
  body: form,
});
const updateBody = await update.json().catch(async () => ({ raw: await update.text() }));
if (!update.ok) throw new Error(`Frontend upload failed HTTP ${update.status}: ${JSON.stringify(updateBody)}`);
const buildUuid = updateBody.data?.latest_build?.uuid;
if (!buildUuid) throw new Error('Updated frontend build UUID not returned');
const activate = await fetch('https://api.taruvi.cloud/sites/insurance/api/cloud/frontend_workers/hmgstones/set-active-build/', {
  method: 'PATCH',
  headers: { Authorization: `Api-Key ${apiKey}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ build_uuid: buildUuid }),
});
const activateBody = await activate.json().catch(async () => ({ raw: await activate.text() }));
if (!activate.ok) throw new Error(`Frontend activation failed HTTP ${activate.status}: ${JSON.stringify(activateBody)}`);
console.log(JSON.stringify({ success: true, url: activateBody.deployment_url, buildUuid }));
