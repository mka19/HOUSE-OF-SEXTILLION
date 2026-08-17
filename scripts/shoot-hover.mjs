import { chromium } from 'playwright-core';
const exe='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b=await chromium.launch({executablePath:exe,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage({viewport:{width:1536,height:1024}});
const errs=[];
p.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
await p.goto('http://localhost:4173/',{waitUntil:'load'});
await p.waitForFunction(()=>window.__scene&&document.getElementById('loader')?.classList.contains('is-hidden'),{timeout:25000}).catch(()=>{});
await p.waitForTimeout(1500);
// hover the centered hero product/plate
await p.mouse.move(760,700,{steps:25});
await p.waitForTimeout(1600);
const st=await p.evaluate(()=>({hovering:document.body.classList.contains('is-hovering'),tip:document.getElementById('tooltip')?.textContent,tipVis:document.getElementById('tooltip')?.classList.contains('is-visible')}));
console.log('STATE',JSON.stringify(st));
console.log('ERRORS',errs.join('|')||'none');
await p.screenshot({path:'screenshots/hover.png'});
await b.close();
