import { chromium } from 'playwright-core';
const exe='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b=await chromium.launch({executablePath:exe,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
const p=await b.newPage({viewport:{width:1536,height:1024}});
await p.goto('http://localhost:4173/',{waitUntil:'load'});
await p.waitForFunction(()=>document.getElementById('loader')?.classList.contains('is-hidden'),{timeout:30000}).catch(()=>{});
await p.waitForTimeout(1200);
// FAST drag left to build velocity; capture at ~mid (void+feather+blur all active)
await p.mouse.move(1200,512); await p.mouse.down();
let shot=false;
for(let x=1200; x>=470; x-=60){
  await p.mouse.move(x,512,{steps:1}); await p.waitForTimeout(12);
  const prog=await p.evaluate(()=>window.__trans?.progress||0);
  if(!shot && prog>=0.42 && prog<=0.62){
    const info=await p.evaluate(()=>{
      const t=window.__trans||{};
      return {prog:Number(t.progress||0).toFixed(2), vel:Number(t.vel||0).toFixed(2),
        voidOp:getComputedStyle(document.getElementById('voidoverlay')).opacity,
        e1filter:getComputedStyle(document.getElementById('env1')).filter,
        mblur:document.getElementById('mblur-g')?.getAttribute('stdDeviation')};
    });
    console.log('MID', JSON.stringify(info));
    await p.screenshot({path:'screenshots/trans-mid2.png'}); shot=true;
  }
}
await p.mouse.up();
await b.close();
