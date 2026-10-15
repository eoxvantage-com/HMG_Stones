import { readFileSync, writeFileSync } from 'node:fs';
import { call, decode } from './mcp.mjs';
import { nativeFunctionSource } from './native-function-source.mjs';

const policy = {
  name: 'hmg-native-workflow',
  policy_type: 'resource',
  entity_type: 'function',
  version: 'default',
  rules: [{ actions: ['execute'], roles: ['HMG Administrator'], effect: 'EFFECT_ALLOW', name: 'authenticated_hmg_administrator' }],
};
writeFileSync('backend/hmg/native-function-policy-preview.json', JSON.stringify(policy, null, 2));
const applied = decode(await call('manage_policies', { action: 'create_update', policy_data: policy }));
if (!applied.success) throw new Error(JSON.stringify({ error: applied.error }));
const code = nativeFunctionSource(readFileSync('backend/hmg/functions/commands.py', 'utf8'));
const result = decode(await call('manage_function', {
  action: 'create_update',
  function_slug: 'hmg-native-workflow',
  name: 'hmg-native-workflow',
  execution_mode: 'app',
  is_public: false,
  code,
  description: 'HMG browser-session workflow with catalogue and Plan-to-3D commands.',
}));
if (!result.success) throw new Error(JSON.stringify({ error: result.error }));
console.log(JSON.stringify({ success: true, slug: result.data?.slug, version: result.data?.version }));
