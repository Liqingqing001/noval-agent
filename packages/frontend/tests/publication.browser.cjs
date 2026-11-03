const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const {resolve}=require('node:path');
const {readFile,mkdir}=require('node:fs/promises');
const seed=require('../src/demo/lingShiOrigin.json');
const platforms=require('../src/data/publishingPlatforms.json');
const isDemo=process.env.PARITY_MODE!=='full';
const base=`http://127.0.0.1:5194${isDemo?'/noval-agent/':'/'}`;
(async()=>{
const server=spawn(process.execPath,[resolve(require.resolve('vite/package.json'),'..','bin/vite.js'),'preview','--host','127.0.0.1','--port','5194','--strictPort'],{cwd:resolve(__dirname,'..'),stdio:'ignore',env:{...process.env,VITE_BASE_PATH:isDemo?'/noval-agent/':'/'}});let browser;
try{
 for(let i=0;;i++){try{if((await fetch(base)).ok)break;}catch{}if(i===60)throw Error('Preview unavailable');await new Promise(r=>setTimeout(r,200));}
 browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 for(const width of [320,390,1680]){
 const context=await browser.newContext({viewport:{width,height:width===320?667:1000},acceptDownloads:true});
 const fixture=structuredClone(seed);fixture.novels.push({...fixture.novels[0],id:'other-book',title:'另一部作品'});fixture.chapters.push({...fixture.chapters[0],id:'foreign-chapter',novelId:'other-book',content:'不应导出的外部正文'});
 const page=await context.newPage();const errors=[];const remote=[];page.on('pageerror',e=>errors.push(e.message));
 await context.addInitScript(({fixture,isDemo})=>{const k=n=>isDemo?`${n}-demo-v1`:n;localStorage.setItem(k('novel-agent-storage'),JSON.stringify({state:{...fixture,sessions:[],lastReadChapterIds:{},currentNovelId:fixture.novels[0].id,currentChapterId:fixture.chapters[0].id,currentView:'chapters'},version:0}));if(!isDemo){localStorage.setItem('novel-agent-migrated','true');localStorage.setItem('novel-agent-auth-token','TEST_PLACEHOLDER');localStorage.setItem('novel-agent-auth',JSON.stringify({state:{isAuthenticated:true,user:{id:'test-user',nickname:'测试用户',email:'test@example.test'}}}));}Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.__copied=text;}}});},{fixture,isDemo});
 await page.route('**/api/**',async route=>{const path=new URL(route.request().url()).pathname;let body;if(path.endsWith('/auth/me'))body={user:{id:'test-user',nickname:'测试用户',email:'test@example.test'}};else{const resource=path.split('/').at(-1);const mapping={novels:'novels',chapters:'chapters',characters:'characters','world-settings':'worldSettings','plot-cards':'plotCards',foreshadowings:'foreshadowings'};if(route.request().method()==='GET'&&mapping[resource])body={[mapping[resource]]:resource==='novels'?fixture.novels:fixture[mapping[resource]].filter(item=>item.novelId===path.split('/').at(-2))};else if(route.request().method()==='PUT'){const update=route.request().postDataJSON();const item=Object.values(fixture).flat().find(x=>x.id===resource);Object.assign(item||{},update);body={novel:item,chapter:item};}else throw Error('Unexpected API '+path);}await route.fulfill({contentType:'application/json',body:JSON.stringify(body)});});
 page.on('request',r=>{if(platforms.some(p=>new URL(p.entryUrl).hostname===new URL(r.url()).hostname))remote.push(r.url());});
 await page.goto(base);await page.locator('.tiptap').waitFor();
 if(width===390){await page.getByRole('navigation',{name:'工作区切换'}).getByRole('button',{name:'书架',exact:true}).click();await page.getByRole('button',{name:'发布中心',exact:true}).click();}else await page.getByRole('button',{name:'发布',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'发布中心',exact:true});await dialog.waitFor();
 assert.equal(await dialog.locator('.publication-platforms>button').count(),platforms.length);
 for(const id of ['qidian','fanqie','jjwxc','ao3'])assert.ok(platforms.some(p=>p.id===id));
 assert.ok(platforms.every(p=>p.automatic===false&&p.sources.length&&p.checkedAt==='2026-11-03'));
 await dialog.getByLabel('搜索发布平台').fill('不存在的平台');assert.match(await dialog.locator('.publication-platforms').textContent(),/没有匹配平台/);await dialog.getByRole('button',{name:'清除筛选'}).click();
 assert.match(await dialog.locator('.publication-research').textContent(),/拒绝 AI 生成内容/);
 await dialog.getByLabel('平台地区',{exact:true}).selectOption('global');assert.equal(await dialog.locator('.publication-platforms>button').count(),4);await dialog.getByLabel('AI 政策筛选').selectOption('conditional');assert.equal(await dialog.locator('.publication-platforms>button').count(),1);assert.match(await dialog.locator('.publication-research').textContent(),/非商业/);await dialog.getByLabel('AI 政策筛选').selectOption('all');await dialog.getByLabel('平台地区',{exact:true}).selectOption('all');
 await dialog.getByRole('button',{name:'准备发布材料',exact:true}).click();
 assert.equal(await dialog.getByLabel('正文 AI 使用',{exact:true}).inputValue(),'unknown');
 await dialog.getByLabel('正文 AI 使用',{exact:true}).selectOption('generated');
 const [brief]=await Promise.all([page.waitForEvent('download'),dialog.getByRole('button',{name:'下载投稿资料',exact:true}).click()]);const briefText=await readFile(await brief.path(),'utf8');assert.match(briefText,/尚未提交/);assert.match(briefText,/包含 AI 生成内容/);assert.match(briefText,/封面 \/ 插图：尚未确认/);assert.ok(!briefText.includes('不应导出的外部正文'));
 await dialog.getByRole('button',{name:'复制章节标题',exact:true}).click();assert.equal(await page.evaluate(()=>window.__copied),fixture.chapters[0].title);
 await dialog.getByRole('button',{name:'复制章节正文',exact:true}).click();const copied=await page.evaluate(()=>window.__copied);assert.ok(copied.includes(fixture.chapters[0].content.slice(0,40)));assert.ok(!copied.includes('不应导出的外部正文'));assert.ok(!copied.startsWith(fixture.novels[0].title));
 await page.evaluate(()=>{navigator.clipboard.writeText=async()=>{throw Error('Denied');};});await dialog.getByRole('button',{name:'复制简介',exact:true}).click();await dialog.getByLabel('手动复制内容').waitFor();
 await dialog.getByLabel('搜索发布平台').fill('GitHub');await dialog.locator('.publication-platforms>button').first().click();
 const [html]=await Promise.all([page.waitForEvent('download'),dialog.getByRole('button',{name:'下载独立阅读页 HTML',exact:true}).click()]);const htmlText=await readFile(await html.path(),'utf8');assert.match(htmlText,/<!doctype html>/);assert.match(htmlText,/chapter-17/);assert.ok(!htmlText.includes('不应导出的外部正文'));
 assert.ok(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth+1),'Dialog overflow');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await mkdir('/tmp/publication-preview',{recursive:true});await page.screenshot({path:`/tmp/publication-preview/${isDemo?'demo':'full'}-${width}.png`});
 await dialog.getByRole('button',{name:'平台调研与 AI 政策',exact:true}).click();await dialog.getByLabel('搜索发布平台').fill('');await dialog.locator('.publication-platforms>button').first().click();await dialog.locator('.publication-scroll').evaluate(node=>node.scrollTop=0);await page.screenshot({path:`/tmp/publication-preview/${isDemo?'demo':'full'}-research-${width}.png`});await dialog.getByRole('button',{name:'准备发布材料',exact:true}).click();
 await dialog.getByLabel('准备发布的作品').selectOption('');assert.match(await dialog.textContent(),/先从书架创建或选择作品/);assert.equal(await dialog.getByRole('button',{name:'下载投稿资料',exact:true}).count(),0);
 await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.deepEqual(errors,[]);assert.deepEqual(remote,[]);
 await context.close();
 }
 console.log(JSON.stringify({mode:isDemo?'demo':'full',checks:['14-platform directory','source metadata','desktop/mobile entrances','filters','honest AI disclosure','private local exports','no cross-book leakage','clipboard fallback','standalone HTML','no remote posting','empty selection'],screenshots:'/tmp/publication-preview'}));
}finally{await browser?.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
