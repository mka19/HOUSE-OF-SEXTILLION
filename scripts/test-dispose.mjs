import { chromium } from 'playwright-core';
const exe='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b=await chromium.launch({executablePath:exe,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--disable-background-timer-throttling']});
const p=await b.newPage({viewport:{width:1280,height:800}});
const errs=[];p.on('pageerror',e=>errs.push('ERR '+e.message));p.on('console',m=>{if(m.type()==='error')errs.push('CON '+m.text());});
await p.goto('http://localhost:4173/',{waitUntil:'load'});
await p.waitForFunction(()=>document.getElementById('loader')?.classList.contains('is-hidden'),{timeout:30000}).catch(()=>{});
await p.waitForTimeout(1000);
// build, then dispose, twice — verify no throw, instance nulled, context count sane
const r1=await p.evaluate(()=>{ window.__env2.ensure(); return !!window.__env2.instance; });
await p.waitForTimeout(300);
const r2=await p.evaluate(()=>{ window.__env2.dispose(); return !!window.__env2.instance; });
await p.waitForTimeout(200);
const r3=await p.evaluate(()=>{ window.__env2.ensure(); return !!window.__env2.instance; }); // rebuild after dispose
await p.waitForTimeout(300);
const r4=await p.evaluate(()=>{ window.__env2.dispose(); return !!window.__env2.instance; });
console.log('built1', r1, 'afterDispose1', r2, 'rebuilt', r3, 'afterDispose2', r4);
console.log('ERRORS', errs.slice(0,6).join(' | ')||'none');
await b.close();
