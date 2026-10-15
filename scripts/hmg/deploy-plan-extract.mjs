import { readFileSync, writeFileSync } from 'node:fs';
import { call, decode } from './mcp.mjs';

// Deployment helper only. Do not run without explicit user deployment approval.
const functionPolicy = {
  name: 'hmg-extract-plan-dimensions',
  policy_type: 'resource',
  entity_type: 'function',
  version: 'default',
  rules: [{ actions: ['execute'], roles: ['HMG Administrator'], effect: 'EFFECT_ALLOW', name: 'authenticated_hmg_administrator' }],
};
const storagePolicy = {
  name: 'hmg-project-plans',
  policy_type: 'resource',
  entity_type: 'storage',
  version: 'default',
  rules: [
    { actions: ['read', 'create'], roles: ['HMG Administrator'], effect: 'EFFECT_ALLOW', name: 'hmg_plan_private_rw' },
    { actions: ['update', 'delete'], roles: ['*'], effect: 'EFFECT_DENY', name: 'hmg_plan_no_browser_mutation' },
  ],
};
writeFileSync('backend/hmg/plan-extract-policy-preview.json', JSON.stringify({ functionPolicy, storagePolicy }, null, 2));

for (const policy_data of [functionPolicy, storagePolicy]) {
  const applied = decode(await call('manage_policies', { action: 'create_update', policy_data }));
  if (!applied.success) throw new Error(JSON.stringify({ error: applied.error, policy: policy_data.name }));
}

const code = readFileSync('backend/hmg/functions/plan_extract.py', 'utf8').replace(/^\uFEFF/, '');
const result = decode(await call('manage_function', {
  action: 'create_update',
  function_slug: 'hmg-extract-plan-dimensions',
  name: 'hmg-extract-plan-dimensions',
  execution_mode: 'app',
  is_public: false,
  code,
  description: 'Extract HMG plan room dimensions with Gemini using Taruvi secret G_API_key.',
}));

if (!result.success) throw new Error(JSON.stringify({ error: result.error }));
console.log(JSON.stringify({ success: true, slug: result.data?.slug, version: result.data?.version }));
