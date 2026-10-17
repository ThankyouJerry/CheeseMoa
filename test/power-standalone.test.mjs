import test from 'node:test';
import assert from 'node:assert/strict';
import {scenarios,runScenario} from '../dev/power-harness-scenarios.js';
for(const [key,name]of scenarios)test(`standalone: ${name}`,async()=>{assert.equal((await runScenario(key)).passed,true)});
