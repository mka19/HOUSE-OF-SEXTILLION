import { chromium } from 'playwright-core';
const exe='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b=await chromium.launch({executablePath:exe,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
const p=await b.newPage({viewport:{width:1536,height:1024}});
const errs=[];p.on('pageerror',e=>errs.push('ERR '+e.message)); p.on('console',m=>{if(m.type()==='error')errs.push('CON '+m.text());});
await p.goto('http://localhost:4173/',{waitUntil:'load'});
await p.waitForFunction(()=>document.getElementById('loader')?.classList.contains('is-hidden'),{timeout:30000}).catch(()=>console.log('WARN loader'));
await p.waitForTimeout(1200);
// real drag left to Env2 (triggers on-demand build of Env2)
await p.mouse.move(1200,512); await p.mouse.down();
for(let x=1200;x>=360;x-=40){ await p.mouse.move(x,512,{steps:1}); await p.waitForTimeout(14); }
await p.mouse.up();
// keep rAF alive while it settles onto Env2
async function keepAlive(ms){const t=Date.now();let y=520;while(Date.now()-t<ms){y=y===520?521:520;await p.mouse.move(3,y);await p.waitForTimeout(16);}}
await keepAlive(1600);
const info=await p.evaluate(()=>({activeEnv:window.__activeEnv, prog:+window.__trans.progress.toFixed(3), env2Built:!!(window.__env2&&window.__env2.instance)}));
console.log('STATE', JSON.stringify(info));
// move mouse over the centre to test hover
await p.mouse.move(760,560); await p.waitForTimeout(300);
await p.screenshot({path:'screenshots/env2-3d.png'});
console.log('ERRORS', errs.slice(0,6).join(' | ')||'none');
await b.close();
