import { chromium } from 'playwright-core';
const exe='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b=await chromium.launch({executablePath:exe,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage({viewport:{width:1536,height:1024}});
const errs=[];p.on('pageerror',e=>errs.push('ERR '+e.message));
await p.goto('http://localhost:4173/',{waitUntil:'load'});
await p.waitForFunction(()=>window.__scene&&document.getElementById('loader')?.classList.contains('is-hidden'),{timeout:25000}).catch(()=>{});
await p.waitForTimeout(1200);
// hover over the PEDESTAL column (lower centre ~ x768,y800)
await p.mouse.move(768,800,{steps:10}); await p.waitForTimeout(400);
const onPedestal = await p.evaluate(()=>document.body.classList.contains('is-hovering'));
// hover over the PRODUCT (floating knot ~ x760,y430)
await p.mouse.move(760,430,{steps:10}); await p.waitForTimeout(400);
const onProduct = await p.evaluate(()=>document.body.classList.contains('is-hovering'));
console.log('hovering when over PEDESTAL:', onPedestal, '| over PRODUCT:', onProduct);
console.log('ERRORS', errs.slice(0,3).join(' | ')||'none');
await b.close();
