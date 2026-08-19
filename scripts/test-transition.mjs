import { chromium } from 'playwright-core';
const exe='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b=await chromium.launch({executablePath:exe,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
const p=await b.newPage({viewport:{width:1536,height:1024}});
const errs=[];p.on('pageerror',e=>errs.push('ERR '+e.message));
await p.goto('http://localhost:4173/',{waitUntil:'load'});
await p.waitForFunction(()=>document.getElementById('loader')?.classList.contains('is-hidden'),{timeout:30000}).catch(()=>console.log('WARN loader'));
await p.waitForTimeout(700);
async function keepAlive(ms){const t=Date.now();let y=520;while(Date.now()-t<ms){y=y===520?521:520;await p.mouse.move(2,y);await p.waitForTimeout(16);}}
// drag left
await p.mouse.move(1150,512); await p.mouse.down();
for (let x=1150; x>=520; x-=45){ await p.mouse.move(x,512,{steps:2}); await p.waitForTimeout(16); }
await p.screenshot({path:'screenshots/trans-mid.png'});
console.log('DURING', await p.evaluate(()=>({dragging:window.__trans?.dragging, prog:+window.__trans?.progress.toFixed(3)})));
await p.mouse.up();
await keepAlive(1600);   // keep rAF alive while the spring settles
await p.screenshot({path:'screenshots/trans-end.png'});
console.log('AFTER ', await p.evaluate(()=>({activeEnv:window.__activeEnv, prog:+window.__trans?.progress.toFixed(3)})));
console.log('ERRORS', errs.slice(0,4).join(' | ')||'none');
await b.close();
