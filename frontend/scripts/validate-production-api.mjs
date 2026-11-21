// Node-only validation step used by both verified CI and Pages builds.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import policy from '../../scripts/production-api-url.cjs';
export const { validateProductionApiBaseUrl, apiBaseSha256 } = policy;
if (process.argv[1] && fileURLToPath(import.meta.url)===path.resolve(process.argv[1])) {
  try { validateProductionApiBaseUrl(process.env.VITE_API_BASE_URL); }
  catch (error) { console.error(error.message); process.exitCode=1; }
}
