import { chromium } from 'playwright-core';
const exe='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b=await chromium.launch({executablePath:exe,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
const p=await b.newPage({viewport:{width:1536,height:1024}});
const errs=[];p.on('pageerror',e=>errs.push('ERR '+e.message));
await p.goto('http://localhost:4173/',{waitUntil:'load'});
await p.waitForFunction(()=>document.getElementById('loader')?.classList.contains('is-hidden'),{timeout:30000}).catch(()=>console.log('WARN loader'));
await p.waitForTimeout(1400);
// clean framing/vibrancy shot
await p.mouse.move(768,512); await p.waitForTimeout(400);
await p.screenshot({path:'screenshots/env1-frame.png'});
// now sweep the cursor across the lower floor to light the circuit network
for(let x=520;x<=1040;x+=20){ await p.mouse.move(x, 760); await p.waitForTimeout(16); }
await p.mouse.move(820,780); await p.waitForTimeout(60);
await p.screenshot({path:'screenshots/env1-circuit.png'});
console.log('ERRORS', errs.slice(0,4).join(' | ')||'none');
await b.close();
