import { createServer, loadEnv } from 'vite';
import { call, decode } from './mcp.mjs';

const env = loadEnv('development', process.cwd(), '');
if (env.TARUVI_APP_SLUG !== 'hmg_stones' || new URL(env.TARUVI_SITE_URL).hostname !== 'insurance.taruvi.cloud') {
  throw new Error('Refusing to seed outside the approved HMG Stones workspace.');
}

async function workflow(params) {
  const response = decode(await call('execute_function', { function_slug: 'hmg-workflow', params }));
  if (!response?.success || response.result?.ok !== true) {
    throw new Error(response?.result?.error?.message || 'Taruvi did not confirm the sample-project workflow.');
  }
  return response.result;
}

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
const { createSampleDesigns } = await vite.ssrLoadModule('/src/features/hmg/studio3d/sampleDesigns.ts');
const samples = createSampleDesigns();
const seeded = [];
try { for (const sample of samples) {
  const key = sample.name === 'Harbour Loft' ? 'harbour-loft' : 'atrium-gallery';
  const created = await workflow({
    command: 'createProject',
    idempotencyKey: `hmg-spatial-sample-${key}-create-v1`,
    payload: {
      name: `${sample.name} (Sample)`,
      brief: { ...sample.brief, priorities: [...sample.brief.priorities] },
    },
  });
  const projectId = created.data?.id;
  if (!projectId || !Number.isInteger(created.version)) throw new Error(`Taruvi returned an invalid project for ${sample.name}.`);
  const design = { ...sample.design, projectId };
  const saved = await workflow({
    command: 'saveStudioDesign',
    projectId,
    expectedVersion: created.version,
    idempotencyKey: `hmg-spatial-sample-${key}-design-v1`,
    payload: { design },
  });
  const persisted = saved.data?.stoneStudioDesigns?.some((item) => item.design?.id === design.id);
  if (!persisted) throw new Error(`Taruvi did not return the saved sample design for ${sample.name}.`);
  seeded.push({ name: `${sample.name} (Sample)`, projectId, version: saved.version, designId: design.id });
} } finally { await vite.close(); }

console.log(JSON.stringify({ seeded }, null, 2));
