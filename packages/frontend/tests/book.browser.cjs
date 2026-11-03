const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { readFile, stat, mkdir } = require('node:fs/promises');
const { resolve, extname } = require('node:path');
const { createHash } = require('node:crypto');
const { chromium } = require('playwright');
(async()=>{
 const root=resolve(__dirname,process.env.BOOK_DIST==='1'?'../dist':'../public');
 const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.json':'application/json','.md':'text/plain; charset=utf-8','.txt':'text/plain; charset=utf-8','.webp':'image/webp','.svg':'image/svg+xml'};
 const server=createServer(async(req,res)=>{try{let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(!pathname.startsWith('/noval-agent/'))throw Error();let path=resolve(root,pathname.slice('/noval-agent/'.length)||'index.html');if(!path.startsWith(root+'/'))throw Error();if((await stat(path)).isDirectory())path=resolve(path,'index.html');res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');res.end(await readFile(path));}catch{res.statusCode=404;res.end('Not found');}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}/noval-agent/book/`;
 let browser;
 try{
 const manifest=JSON.parse(await readFile(resolve(root,'book/manifest.json'),'utf8'));let total=0;
 for(const c of manifest.chapters){const text=await readFile(resolve(root,`book/chapters/${c.id}.md`),'utf8');assert.equal(createHash('sha256').update(text.trim()+'\n').digest('hex'),c.sha256);const count=(text.replace(/^# .*\n/,'').match(/\p{Script=Han}/gu)||[]).length;assert.equal(count,c.hanCount);total+=count;}
 assert.equal(manifest.chapterCount,40);assert.ok(total>=60000);assert.equal(total,manifest.hanCount);
 browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.locator('.chapter-link').last().waitFor();assert.equal(await page.locator('.chapter-link').count(),40);assert.equal(await page.locator('.character-card').count(),4);assert.equal(await page.locator('.world-card').count(),6);
 await page.locator('.cover img').evaluate(img=>img.decode());assert.ok(await page.locator('.cover img').evaluate(img=>img.naturalWidth>0));
 await mkdir('/tmp/tide-book-preview',{recursive:true});await page.screenshot({path:'/tmp/tide-book-preview/desktop.png',fullPage:true});
 await page.locator('#start-reading').click();await page.waitForFunction(()=>!document.querySelector('#reader').hidden && document.querySelector('#chapter-body').getAttribute('aria-busy')==='false' && document.querySelector('#chapter-body').textContent.includes('林雾第一次'));assert.match(await page.locator('#chapter-title').textContent(),/第一章/);assert.match(await page.locator('#chapter-body').textContent(),/林雾第一次/);
 await page.locator('#font-up').click();assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--reader-size')),'21px');await page.locator('#theme').click();assert.equal(await page.locator('#theme').getAttribute('aria-pressed'),'true');
 await page.evaluate(()=>window.scrollTo(0,750));await page.waitForTimeout(300);await page.reload();await page.waitForFunction(()=>!document.querySelector('#reader').hidden && document.querySelector('#chapter-body').getAttribute('aria-busy')==='false' && document.querySelector('#chapter-body').textContent.includes('林雾第一次'));await page.waitForFunction(()=>scrollY>500);assert.equal(await page.locator('#theme').getAttribute('aria-pressed'),'true');
 await page.locator('#next').click();await page.waitForFunction(()=>document.querySelector('#chapter-title').textContent.includes('第二章')&&document.querySelector('#chapter-body').getAttribute('aria-busy')==='false');
 await page.locator('#chapter-select').selectOption('40');await page.waitForFunction(()=>document.querySelector('#chapter-body').textContent.includes('——全文完——'));assert.equal(await page.locator('#next').getAttribute('aria-disabled'),'true');
 await page.goto(base+'#contents');await page.locator('#resume').waitFor();assert.match(await page.locator('#resume').textContent(),/40/);
 const [download]=await Promise.all([page.waitForEvent('download'),page.getByText('下载完整 TXT ↓',{exact:true}).click()]);const path=await download.path();const txt=await readFile(path,'utf8');assert.ok(txt.startsWith('\ufeff'));assert.match(txt,/——全文完——/);
 // An uncached chapter failure must keep progress and offer a successful retry.
 await page.route('**/chapters/03.md',r=>r.abort());await page.goto(base+'#read/03');await page.locator('#reading-error').waitFor();await page.unroute('**/chapters/03.md');await page.locator('#retry').click();await page.waitForFunction(()=>document.querySelector('#chapter-body').textContent.includes('借河街'));
 for(const width of [320,390,768]){await page.setViewportSize({width,height:844});await page.goto(base);await page.locator('.chapter-link').last().waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`landing overflow at ${width}`);await page.locator('#start-reading').click();await page.waitForFunction(()=>!document.querySelector('#reader').hidden && document.querySelector('#chapter-body').getAttribute('aria-busy')==='false' && document.querySelector('#chapter-body').textContent.includes('林雾第一次'));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`reader overflow at ${width}`);if(width===390){await page.screenshot({path:'/tmp/tide-book-preview/mobile-reader.png',fullPage:false});await page.goto(base);await page.locator('.chapter-link').last().waitFor();await page.screenshot({path:'/tmp/tide-book-preview/mobile.png',fullPage:true});}}
 assert.deepEqual(errors,[]);
 // Private browsing/storage denial should still allow reading.
 const restricted=await browser.newContext();await restricted.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw Error('Storage disabled');}});});const rp=await restricted.newPage();await rp.goto(base+'#read/01');await rp.waitForFunction(()=>document.querySelector('#chapter-body').textContent.includes('林雾第一次'));await restricted.close();
 console.log(JSON.stringify({chapters:40,bodyHan:total,checks:['chapter hashes','complete text download','desktop/mobile layout','navigation','resume scroll','theme/font','failure retry','storage denied'],screenshots:'/tmp/tide-book-preview'}));
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
