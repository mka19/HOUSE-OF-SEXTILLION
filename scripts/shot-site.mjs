import { chromium } from 'playwright-core';
const exe='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b=await chromium.launch({executablePath:exe,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
const p=await b.newPage({viewport:{width:1440,height:900}});
const errs=[];p.on('pageerror',e=>errs.push('ERR '+e.message));p.on('console',m=>{if(m.type()==='error')errs.push('CON '+m.text());});
await p.goto('http://localhost:4173/',{waitUntil:'load'});
await p.waitForFunction(()=>document.getElementById('loader')?.classList.contains('is-hidden'),{timeout:25000}).catch(()=>console.log('WARN loader'));
await p.mouse.move(720,450); await p.waitForTimeout(1800);
await p.screenshot({path:'screenshots/site-hero.png'});
// scroll helper (disable Lenis fight by setting scroll directly + waiting)
async function scrollTo(y){ await p.evaluate((Y)=>{ window.scrollTo(0,Y); }, y); await p.waitForTimeout(1400); }
const H=await p.evaluate(()=>document.body.scrollHeight);
console.log('scrollHeight', H);
await scrollTo(Math.round(H*0.30)); await p.screenshot({path:'screenshots/site-statement.png'});
await scrollTo(Math.round(H*0.52)); await p.screenshot({path:'screenshots/site-collection.png'});
await scrollTo(Math.round(H*0.80)); await p.screenshot({path:'screenshots/site-subscribe.png'});
await scrollTo(H); await p.screenshot({path:'screenshots/site-footer.png'});
console.log('ERRORS', errs.slice(0,6).join(' | ')||'none');
await b.close();
