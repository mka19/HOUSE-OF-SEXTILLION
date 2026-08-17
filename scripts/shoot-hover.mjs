import { chromium } from 'playwright-core';
const exe='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b=await chromium.launch({executablePath:exe,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage({viewport:{width:1536,height:1024}});
await p.goto('http://localhost:4173/',{waitUntil:'load'});
await p.waitForFunction(()=>window.__scene&&document.getElementById('loader')?.classList.contains('is-hidden'),{timeout:25000}).catch(()=>{});
await p.waitForTimeout(1500);
// move mouse toward the left pedestal area then settle
await p.mouse.move(300,720,{steps:20});
await p.waitForTimeout(1500);
await p.screenshot({path:'screenshots/hover.png'});
await b.close();
console.log('saved hover');
