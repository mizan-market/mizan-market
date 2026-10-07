import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

for (const f of ['server/index.js','src/api.js','src/store.js','src/lib/supabase.js']) execFileSync(process.execPath,['--check',f],{stdio:'inherit'});
for (const f of ['src/App.jsx','src/main.jsx']) {
  if (!fs.existsSync(f)) throw new Error(`Missing ${f}`);
  const s=fs.readFileSync(f,'utf8');
  if (!s.includes('createElement') && !s.includes('<')) throw new Error(`Unexpected JSX content in ${f}`);
}
console.log('MIZAN MARKET project checks passed. Run npm install and npm run build on a machine with npm network access.');
