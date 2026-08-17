import { chromium } from 'playwright-core';
const exe='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b=await chromium.launch({executablePath:exe,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage({viewport:{width:1536,height:1024}});
const errs=[];p.on('pageerror',e=>errs.push('ERR '+e.message));
await p.goto('http://localhost:4173/',{waitUntil:'load'});
await p.waitForFunction(()=>window.__scene&&document.getElementById('loader')?.classList.contains('is-hidden'),{timeout:25000}).catch(()=>{});
await p.waitForTimeout(1500);
// sweep the cursor across the floor to trigger the circuit decal, end mid-floor
for(const x of [500,700,900,1000]){ await p.mouse.move(x,860,{steps:8}); await p.waitForTimeout(120); }
await p.mouse.move(1000,840,{steps:4});
await p.waitForTimeout(300);
console.log('ERRORS', errs.slice(0,4).join(' | ')||'none');
await p.screenshot({path:'screenshots/hover.png'});
await b.close();
