// The actual Pages output must pass the same package-free release checks.
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import checks from '../../scripts/publish-tree-check.cjs';
export const {verifyPagesOutput}=checks;
if(process.argv[1] && fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
 try {verifyPagesOutput(path.resolve(process.argv[2]||'not-a-real-build'));console.log('v58: Pages output verified');}
 catch {console.error('v58: Pages build tree or fallback invalid; NOT PASS');process.exitCode=1;}
}
