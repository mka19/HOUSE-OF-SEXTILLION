import { chromium } from 'playwright-core';
const exe='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b=await chromium.launch({executablePath:exe,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
const p=await b.newPage({viewport:{width:1536,height:1024}});
await p.goto('http://localhost:4173/',{waitUntil:'load'});
await p.waitForFunction(()=>document.getElementById('loader')?.classList.contains('is-hidden'),{timeout:30000}).catch(()=>console.log('WARN loader'));
await p.waitForTimeout(700);
// Force-hold progress at exact points and read the applied transforms.
async function shotAt(prog, name){
  await p.evaluate((pr)=>{ window.__trans.dragging=true; window.__trans.animating=false; window.__trans.vel=1.2; window.__trans.progress=pr; window.__trans.target=pr; }, prog);
  await p.waitForTimeout(120);
  await p.screenshot({path:`screenshots/${name}.png`});
  const info=await p.evaluate(()=>{
    const e1=getComputedStyle(document.getElementById('env1')).transform;
    const vo=+getComputedStyle(document.getElementById('voidoverlay')).opacity;
    return {e1t:e1.slice(0,40), voidOp:+vo.toFixed(3)};
  });
  console.log(name, 'prog='+prog, info);
}
await shotAt(0.30,'curve-30');
await shotAt(0.50,'curve-50');
await shotAt(0.72,'curve-72');
await b.close();
