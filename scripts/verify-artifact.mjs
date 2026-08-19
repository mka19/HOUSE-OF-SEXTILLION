import { chromium } from 'playwright-core';
import { pathToFileURL } from 'url';
const exe='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b=await chromium.launch({executablePath:exe,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
const p=await b.newPage({viewport:{width:1536,height:1024}});
const url=pathToFileURL(process.cwd()+'/artifact/house-of-sextillion.html').href;
await p.goto(url,{waitUntil:'load'});
await p.waitForFunction(()=>window.__trans!==undefined,{timeout:30000}).catch(()=>console.log('WARN no __trans'));
await p.waitForTimeout(1200);
await p.evaluate(()=>{const s=window.__trans;s.animating=false;s.dragging=false;s.vel=0;s.progress=1;s.target=1;});
for(let i=0;i<12;i++){await p.mouse.move(3,i%2?520:521);await p.waitForTimeout(16);}
const info=await p.evaluate(()=>({hasPhoto:document.getElementById('env2img').classList.contains('has-photo'), bg:getComputedStyle(document.getElementById('env2img')).backgroundImage.slice(0,30)}));
console.log(info);
await p.screenshot({path:'screenshots/artifact-env2.png'});
await b.close();
