import { chromium } from 'playwright-core';
import { pathToFileURL } from 'url';
const exe='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b=await chromium.launch({executablePath:exe,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
const p=await b.newPage({viewport:{width:1536,height:1024}});
const errs=[];p.on('pageerror',e=>errs.push('ERR '+e.message));p.on('console',m=>{if(m.type()==='error')errs.push('CON '+m.text());});
const url=pathToFileURL(process.cwd()+'/artifact/house-of-sextillion.html').href;
await p.goto(url,{waitUntil:'load'});
await p.waitForFunction(()=>window.__env2!==undefined,{timeout:30000}).catch(()=>console.log('WARN no env2 api'));
await p.waitForTimeout(1200);
await p.evaluate(()=>{ window.__env2.ensure(); });
await p.waitForTimeout(400);
await p.evaluate(()=>{ const s=window.__trans; s.dragging=false; s.animating=false; s.vel=0; s.progress=1; s.target=1; window.__activeEnv=2; });
async function keepAlive(ms){const t=Date.now();let i=0;while(Date.now()-t<ms){await p.mouse.move(760,500+(i++%2));await p.waitForTimeout(16);}}
await keepAlive(1400);
await p.screenshot({path:'screenshots/artifact-env2-3d.png'});
const built=await p.evaluate(()=>!!(window.__env2&&window.__env2.instance));
console.log('env2Built', built, 'ERRORS', errs.slice(0,5).join(' | ')||'none');
await b.close();
