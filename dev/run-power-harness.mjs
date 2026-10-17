import {writeFile} from 'node:fs/promises';
import {scenarios,runScenario} from './power-harness-scenarios.js';
const results=[];
for(const [key,name]of scenarios){try{results.push({...await runScenario(key),name})}catch(error){results.push({key,name,passed:false,error:error.message})}}
const report={version:'standalone-power-harness-20261011.1',server:'simulated only',realChzzkClaimVerified:false,passed:results.filter(r=>r.passed).length,total:results.length,results};
await writeFile(new URL('./power-harness-results.json',import.meta.url),JSON.stringify(report,null,2));
console.log(`${report.passed}/${report.total} PASS · simulated server; no real CHZZK requests`);
if(report.passed!==report.total)process.exitCode=1;
