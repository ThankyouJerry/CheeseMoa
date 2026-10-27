import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const modules=['src/shared/power-build.js','src/shared/log-power.js','src/shared/power-session.js','src/shared/power-page-owner.js','src/shared/watch-ui-claim.js','src/shared/power-page-agent.js','src/viewer/floating-power-panel.js','src/viewer/power-receipt-panel.js','src/viewer/power-page-entry.js'];
let body='// Generated from shared production modules. Run node scripts/build-power-page.mjs.\n(() => {\n"use strict";\n';
for(const file of modules){const source=await readFile(new URL(file,root),'utf8');body+=`\n// ${file}\n`+source.replace(/^import .*;\n/gm,'').replace(/^export /gm,'')+'\n'}
body+='})();\n';await writeFile(new URL('src/viewer/power-page.js',root),body);
