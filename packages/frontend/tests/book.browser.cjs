const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { readFile, stat, mkdir } = require('node:fs/promises');
const { resolve, extname } = require('node:path');
const { createHash } = require('node:crypto');
const { chromium } = require('playwright');
(async()=>{
 const root=resolve(__dirname,'../dist');
 const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.json':'application/json','.md':'text/plain; charset=utf-8','.txt':'text/plain; charset=utf-8','.webp':'image/webp','.svg':'image/svg+xml'};
 const server=createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(!pathname.startsWith('/noval-agent/'))throw Error();let path=resolve(root,pathname.slice('/noval-agent/'.length)||'index.html');if(!path.startsWith(root+'/'))throw Error();if((await stat(path)).isDirectory())path=resolve(path,'index.html');res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');res.end(await readFile(path));}catch{res.statusCode=404;res.end('Not found');}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}/noval-agent/`;
 let browser;
 try{
 const manifest=JSON.parse(await readFile(resolve(root,'book/manifest.json'),'utf8'));let total=0;
 const snapshot=JSON.parse(await readFile(resolve(__dirname,'../src/demo/tideMemory.json'),'utf8'));
 for(const c of manifest.chapters){const text=await readFile(resolve(root,`book/chapters/${c.id}.md`),'utf8');assert.equal(createHash('sha256').update(text.trim()+'\n').digest('hex'),c.sha256);const body=text.replace(/^# .*\n/,'').trim();const count=(body.match(/\p{Script=Han}/gu)||[]).length;assert.equal(count,c.hanCount);total+=count;const row=snapshot.chapters.slice().sort((a,b)=>a.sequence-b.sequence)[Number(c.id)-1];assert.equal(row?.content,body,'Database snapshot body differs from source');}
 assert.equal(manifest.chapterCount,40);assert.ok(total>=60000);assert.equal(total,manifest.hanCount);
 browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 await mkdir('/tmp/tide-product-preview',{recursive:true});
 for(const width of [390,1680]){
 const context=await browser.newContext({viewport:{width,height:1000},acceptDownloads:true});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'book/');await page.locator('.tiptap').waitFor();assert.equal(new URL(page.url()).pathname,'/noval-agent/');
 const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('novel-agent-storage-demo-v1')).state);
 assert.equal(state.novels.length,1);assert.equal(state.novels[0].title,'潮汐替人记得');assert.equal(state.chapters.length,40);assert.equal(state.characters.length,8);assert.equal(state.plotCards.length,45);assert.equal(state.sessions.length,0);assert.match(await page.locator('.tiptap').innerText(),/林雾第一次/);
 const navigate=async label=>{if(width<1280)await page.getByRole('navigation',{name:'工作区切换'}).getByRole('button',{name:'书架',exact:true}).click();await page.getByRole('button',{name:label,exact:true}).click();};
 if(width<1280)await page.getByRole('navigation',{name:'工作区切换'}).getByRole('button',{name:'书架',exact:true}).click();
 assert.equal(await page.locator('.shelf-book').count(),1);const cover=page.getByAltText('潮汐替人记得封面');await cover.evaluate(img=>img.decode());assert.ok(await cover.evaluate(img=>img.naturalWidth>0));
 await navigate('人物');await page.getByRole('button',{name:'人物列表',exact:true}).click();for(const name of ['林雾','沈砚','许照','陆苗'])await page.getByText(name,{exact:true}).first().waitFor();
 await page.screenshot({path:`/tmp/tide-product-preview/characters-${width}.png`});
 await navigate('世界观');const art=page.locator('.world-setting-content img');await art.waitFor();await art.scrollIntoViewIfNeeded();await art.evaluate(img=>img.decode());assert.ok(await art.evaluate(img=>img.naturalWidth>0));await art.scrollIntoViewIfNeeded();await page.screenshot({path:`/tmp/tide-product-preview/world-${width}.png`});
 await navigate('大纲');await page.getByText('共 5 卷，40 章',{exact:true}).waitFor();await page.screenshot({path:`/tmp/tide-product-preview/outline-${width}.png`});
 await navigate('章节');if(width<768)await page.getByRole('button',{name:/^章节目录/}).click();await page.locator('.chapter-directory button[aria-current]').first().waitFor();await page.locator('.chapter-directory button').filter({hasText:'把门留给活着的人'}).first().click();await page.waitForFunction(()=>document.querySelector('.tiptap')?.textContent.includes('——全文完——'));await page.screenshot({path:`/tmp/tide-product-preview/ending-${width}.png`});
 await page.reload();await page.locator('.tiptap').waitFor();assert.match(await page.locator('.tiptap').innerText(),/——全文完——/);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);await context.close();
 }
 console.log(JSON.stringify({chapters:40,bodyHan:total,checks:['database snapshot equals manuscript','legacy book URL redirects to product','one-book shelf','cover','8 characters','world illustration','5 volumes / 40 linked outlines','ending and reload','desktop/mobile product UI'],screenshots:'/tmp/tide-product-preview'}));
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
