import { readFileSync, writeFileSync } from 'node:fs';
import { call, decode } from './mcp.mjs';

// Deployment helper only. Do not run without explicit user deployment approval.
const functionPolicy = {
  name: 'hmg-plan-visual-preview',
  policy_type: 'resource',
  entity_type: 'function',
  version: 'default',
  rules: [{ actions: ['execute'], roles: ['HMG Administrator'], effect: 'EFFECT_ALLOW', name: 'authenticated_hmg_administrator' }],
};
writeFileSync('backend/hmg/visual-preview-policy-preview.json', JSON.stringify({ functionPolicy }, null, 2));

const applied = decode(await call('manage_policies', { action: 'create_update', policy_data: functionPolicy }));
if (!applied.success) throw new Error(JSON.stringify({ error: applied.error, policy: functionPolicy.name }));

const code = readFileSync('backend/hmg/functions/visual_preview.py', 'utf8').replace(/^\uFEFF/, '');
const result = decode(await call('manage_function', {
  action: 'create_update',
  name: 'hmg-plan-visual-preview',
  execution_mode: 'app',
  is_public: false,
  code,
  description: 'Generate private HMG plan visual preview by calling an external Diffusers GPU endpoint.',
}));

if (!result.success) throw new Error(JSON.stringify({ error: result.error }));
console.log(JSON.stringify({ success: true, slug: result.data?.slug, version: result.data?.version }));
