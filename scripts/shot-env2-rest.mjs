import { chromium } from 'playwright-core';
const exe='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b=await chromium.launch({executablePath:exe,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
const p=await b.newPage({viewport:{width:1536,height:1024}});
const errs=[];p.on('pageerror',e=>errs.push('ERR '+e.message));p.on('console',m=>{if(m.type()==='error')errs.push('CON '+m.text());});
await p.goto('http://localhost:4173/',{waitUntil:'load'});
await p.waitForFunction(()=>document.getElementById('loader')?.classList.contains('is-hidden'),{timeout:30000}).catch(()=>{});
await p.waitForTimeout(1000);
// build Env2 and park fully on it
await p.evaluate(()=>{ window.__env2.ensure(); });
await p.waitForTimeout(400);
await p.evaluate(()=>{ const s=window.__trans; s.dragging=false; s.animating=false; s.vel=0; s.progress=1; s.target=1; window.__activeEnv=2; });
// keep rAF alive so Env2 renders and settles visually
async function keepAlive(ms){const t=Date.now();let i=0;while(Date.now()-t<ms){await p.mouse.move(760, 500+(i++%2));await p.waitForTimeout(16);}}
await keepAlive(1400);
await p.mouse.move(760,540); await p.waitForTimeout(300); // hover centre products
await p.screenshot({path:'screenshots/env2-rest.png'});
console.log('ERRORS', errs.slice(0,6).join(' | ')||'none');
await b.close();
