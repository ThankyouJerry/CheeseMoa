import {createPowerCoordinator,safePowerError} from './power-coordinator.js';
const coordinator=createPowerCoordinator({});
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
 if(message?.type!=='cheesemoa-power-core')return;
 void coordinator.handle(message,sender).then(result=>respond({ok:true,result}),error=>respond({ok:false,error:safePowerError(error)}));
 return true;
});

chrome.tabs.onRemoved.addListener(tabId=>{void coordinator.removeTab(tabId).catch(()=>{})});
