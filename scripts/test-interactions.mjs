import { chromium } from 'playwright-core';
const exe='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b=await chromium.launch({executablePath:exe,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage({viewport:{width:1536,height:1024}});
const errs=[];p.on('pageerror',e=>errs.push('ERR '+e.message));
await p.goto('http://localhost:4173/',{waitUntil:'load'});
await p.waitForFunction(()=>window.__scene&&document.getElementById('loader')?.classList.contains('is-hidden'),{timeout:25000}).catch(()=>{});
await p.waitForTimeout(1500);
// click Shoes nav -> product swap + swipe blur
await p.click('.nav-link[data-product="Shoes"]');
await p.waitForTimeout(120);
await p.screenshot({path:'screenshots/swipe.png'}); // mid-burst
const st = await p.evaluate(()=>({active:[...document.querySelectorAll('.nav-link.is-active')].map(e=>e.textContent)}));
console.log('ACTIVE', JSON.stringify(st));
console.log('ERRORS', errs.slice(0,4).join(' | ')||'none');
await b.close();
