import { chromium } from 'playwright-core';
const exe='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b=await chromium.launch({executablePath:exe,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage({viewport:{width:1536,height:1024}});
const logs=[];
p.on('console',m=>logs.push(m.type()+': '+m.text()));
p.on('pageerror',e=>logs.push('PAGEERROR: '+e.message+'\n'+(e.stack||'')));
await p.goto('http://localhost:4173/',{waitUntil:'load'});
await p.waitForTimeout(6000);
const state=await p.evaluate(()=>({
  hasScene: !!window.__scene,
  loaderHidden: document.getElementById('loader')?.classList.contains('is-hidden'),
  bodyReady: document.body.classList.contains('is-ready'),
  webgl: (()=>{try{const c=document.createElement('canvas');return !!(c.getContext('webgl2')||c.getContext('webgl'));}catch(e){return 'err '+e.message;}})(),
}));
console.log('STATE', JSON.stringify(state));
console.log('LOGS:\n'+logs.join('\n'));
await b.close();
