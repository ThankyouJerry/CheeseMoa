import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('deployable classic content bundle contains the exact shared production modules',async()=>{
 const root=new URL('../',import.meta.url);
 const modules=['src/shared/power-build.js','src/shared/log-power.js','src/shared/power-session.js','src/shared/power-page-owner.js','src/shared/power-page-agent.js','src/viewer/floating-power-panel.js','src/viewer/power-receipt-panel.js','src/viewer/power-page-entry.js'];
 let expected='// Generated from shared production modules. Run node scripts/build-power-page.mjs.\n(() => {\n"use strict";\n';
 for(const file of modules)expected+=`\n// ${file}\n`+(await readFile(new URL(file,root),'utf8')).replace(/^import .*;\n/gm,'').replace(/^export /gm,'')+'\n';
 expected+='})();\n';assert.equal(await readFile(new URL('src/viewer/power-page.js',root),'utf8'),expected);
 const manifest=JSON.parse(await readFile(new URL('manifest.json',root),'utf8'));
 assert.equal(manifest.background.type,'module');assert.ok(manifest.content_scripts.some(c=>c.js.includes('src/viewer/power-page.js')&&c.all_frames===false));
 assert.deepEqual(manifest.permissions,['storage']);
});
