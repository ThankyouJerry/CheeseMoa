import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runScenario} from '../dev/power-harness-scenarios.js';
// In-memory mutant only; production files and saved user data are never edited.
let source=await readFile(new URL('../src/shared/power-collector.js',import.meta.url),'utf8');
source=source.replaceAll('"./power-build.js"',JSON.stringify(new URL('../src/shared/power-build.js',import.meta.url).href)).replaceAll('"./log-power.js"',JSON.stringify(new URL('../src/shared/log-power.js',import.meta.url).href));
assert.ok(source.includes('const previous = state.attempts.find'));
source=source.replace(/const previous = state\.attempts\.find\([^\n]+;/,'const previous = null;');
const {createPowerCollector}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
for(const key of ['success','uncertain','two-clients'])test(`negative control: removing receipt/uncertain guard must fail ${key}`,async()=>{
 await assert.rejects(runScenario(key,{collectorFactory:createPowerCollector}),/재전송|중복/);
});
