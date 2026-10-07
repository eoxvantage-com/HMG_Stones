import { readFileSync } from 'node:fs';
import { galleryAssets } from '../../src/features/hmg/design/galleryAssets.mjs';

/** One authoritative workflow source; exclude the privileged legacy entrypoint. */
export function nativeFunctionSource(source = readFileSync(new URL('../../backend/hmg/functions/commands.py', import.meta.url), 'utf8')) {
  const start = source.indexOf('def main(params, user_data, sdk_client):');
  const end = source.indexOf('NATIVE_GALLERY = []', start);
  if (start < 0 || end < start || !source.includes('def native_main(params, user_data, sdk_client):'))
    throw new Error('Native workflow entrypoint markers missing');
  const native = source.slice(0, start) + source.slice(end);
  return native.replace(/^\uFEFF/, '')
    .replace(/^SERVICE_USER_ID = .*\r?\n/m, '')
    .replace('NATIVE_GALLERY = []', `NATIVE_GALLERY = json.loads(${JSON.stringify(JSON.stringify(galleryAssets))})`)
    .replace('def native_main(params, user_data, sdk_client):', 'def main(params, user_data, sdk_client):');
}
