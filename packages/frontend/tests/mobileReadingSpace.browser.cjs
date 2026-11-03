// Regression for usable reading/list space, including the short phone shown in the report.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const { resolve } = require('node:path');
const { mkdir } = require('node:fs/promises');
const source = require('../src/demo/tideMemory.json');
const base = process.env.MOBILE_SPACE_URL || 'http://127.0.0.1:5198/noval-agent/';
const sizes = process.env.MOBILE_SPACE_SIZES ? JSON.parse(process.env.MOBILE_SPACE_SIZES) : [[320,568],[375,667],[390,844],[844,390],[1280,800]];
const intersects = (a,b) => Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));

(async()=>{
 const server=process.env.MOBILE_SPACE_URL?null:spawn(process.execPath,[resolve(require.resolve('vite/package.json'),'..','bin/vite.js'),'preview','--host','127.0.0.1','--port','5198','--strictPort'],{cwd:resolve(__dirname,'..'),stdio:'ignore',env:{...process.env,VITE_BASE_PATH:'/noval-agent/'}});
 let browser;
 try{
  if(server)for(let attempt=0;;attempt++){try{if((await fetch(base)).ok)break;}catch{}if(attempt===60)throw Error('Mobile-space preview did not start');await new Promise(r=>setTimeout(r,200));}
  browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
  await mkdir('/tmp/mobile-space',{recursive:true});const results=[];
  for(const [width,height] of sizes){
   const compact=width<1280, phone=width<768||(compact&&height<500);
   const context=await browser.newContext({viewport:{width,height},hasTouch:compact});
   const fixture=structuredClone(source);
   if(phone)fixture.novels[0].summary='长简介用于验证展开后仍能返回阅读。'.repeat(70);
   fixture.chapters[0].title+='——长标题应换行，不应挤在一行里';
   const firstOutline=fixture.plotCards.find(card=>card.chapterId===fixture.chapters[0].id);if(firstOutline)firstOutline.title=fixture.chapters[0].title;
   await context.addInitScript(fixture=>{
    localStorage.setItem('novel-agent-sidebar-width','400');localStorage.setItem('novel-agent-panel-width','600');
    localStorage.setItem('novel-agent-storage-demo-v1',JSON.stringify({version:0,state:{...fixture,sessions:[],lastReadChapterIds:{},currentNovelId:fixture.novels[0].id,currentChapterId:fixture.chapters[0].id,currentView:'chapters'}}));
   },fixture);
   const page=await context.newPage(),errors=[],writes=[];
   page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(request.method()!=='GET')writes.push(request.url());});
   const panel=async label=>{if(compact)await page.getByRole('navigation',{name:'工作区切换'}).getByRole('button',{name:label,exact:true}).click();};
   const view=async label=>{await panel('书架');await page.locator('#workspace-bookshelf').getByRole('button',{name:label,exact:true}).click();};
   const noOverflow=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width}x${height}: document overflow`);
   try{
    await page.goto(base);await page.locator('.tiptap').waitFor();await noOverflow();
    await panel('书架');
    const shelf=page.locator('#workspace-bookshelf'),list=page.locator('.bookshelf-books'),card=page.locator('.shelf-book').first();
    await card.scrollIntoViewIfNeeded();const shelfBox=await shelf.boundingBox(),listBox=await list.boundingBox(),cardBox=await card.boundingBox();
    assert.ok(listBox&&listBox.height>=Math.min(180,shelfBox.height*.45),`${width}x${height}: books squeezed to ${listBox?.height}px in ${shelfBox.height}px shelf`);
    assert.ok(cardBox.y>=listBox.y-1&&cardBox.y+cardBox.height<=listBox.y+listBox.height+1,`${width}x${height}: first book clipped by navigation`);
    assert.equal(await page.locator('.shelf-book').count(),1);
    for(const label of ['发布中心','大纲','章节','人物','世界观','参考创作','设置']){
     const button=shelf.getByRole('button',{name:label,exact:true});await button.scrollIntoViewIfNeeded();
     assert.ok(await button.evaluate(node=>{const r=node.getBoundingClientRect();const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.width>0&&r.height>=30&&r.top>=0&&r.bottom<=innerHeight+1&&(hit===node||node.contains(hit));}),`${width}x${height}: ${label} inaccessible`);
    }
    await card.scrollIntoViewIfNeeded();await page.screenshot({path:`/tmp/mobile-space/bookshelf-${width}x${height}.png`});

    await view('大纲');await page.locator('.chapter-outline-scroll').waitFor();await noOverflow();
    const outline=page.locator('.outline-workspace'),outlineBody=page.locator('.outline-content');
    const outlineBox=await outline.boundingBox(),bodyBox=await outlineBody.boundingBox();
    assert.ok(bodyBox.height>=Math.min(210,outlineBox.height*.5),`${width}x${height}: outline body squeezed to ${bodyBox.height}px in ${outlineBox.height}px workspace`);
    await page.getByText('共 5 卷，40 章',{exact:true}).waitFor();
    if(phone){
     const expand=page.getByRole('button',{name:'作品简介',exact:true});assert.equal(await expand.getAttribute('aria-expanded'),'false');await expand.click();
     const collapse=page.getByRole('button',{name:'收起简介',exact:true});assert.equal(await collapse.getAttribute('aria-expanded'),'true');await page.locator('#outline-book-details').waitFor();
     await collapse.click();assert.equal(await page.getByRole('button',{name:'作品简介',exact:true}).getAttribute('aria-expanded'),'false');
     const restored=await outlineBody.boundingBox();assert.ok(restored.height>=bodyBox.height-2,`${width}x${height}: synopsis cannot release space`);
    }
    const outlineTitle=page.locator('.chapter-outline-scroll h4').filter({hasText:fixture.chapters[0].title}).first();
    if(phone){const initialTitle=await outlineTitle.boundingBox(),scrollBox=await page.locator('.chapter-outline-scroll').boundingBox();assert.ok(intersects(initialTitle,scrollBox)>=15,`${width}x${height}: outline chrome hides the first chapter`);}
    await outlineTitle.scrollIntoViewIfNeeded();if(width<550){const box=await outlineTitle.boundingBox();assert.ok(box.height>=30,`${width}x${height}: outline title remains one cramped line`);}
    await page.screenshot({path:`/tmp/mobile-space/outline-${width}x${height}.png`});

    await view('章节');await page.locator('.tiptap').waitFor();
    if(phone)await page.getByRole('button',{name:/^章节目录/}).click();
    const directory=page.locator('#chapter-directory-panel'),entries=page.locator('.chapter-entry > button');await entries.first().waitFor();assert.equal(await entries.count(),40);await page.screenshot({path:`/tmp/mobile-space/directory-start-${width}x${height}.png`});
    const directoryBox=await directory.boundingBox(),directoryList=page.locator('.chapter-directory-list'),directoryListBox=await directoryList.boundingBox();
    assert.ok(directoryListBox.height>=Math.min(180,directoryBox.height*.6),`${width}x${height}: chapter directory squeezed to ${directoryListBox.height}px in ${directoryBox.height}px`);
    await entries.first().scrollIntoViewIfNeeded();const title=entries.first().getByText(fixture.chapters[0].title,{exact:true});
    if(width<550){const box=await title.boundingBox();assert.ok(box.height>=30,`${width}x${height}: directory title not wrapping`);}
    await entries.last().scrollIntoViewIfNeeded();const lastBox=await entries.last().boundingBox();assert.ok(intersects(lastBox,directoryListBox)>=Math.min(lastBox.height,40)-1,`${width}x${height}: last chapter cannot be reached`);
    await page.screenshot({path:`/tmp/mobile-space/directory-${width}x${height}.png`});
    await entries.last().click();await page.waitForFunction(()=>document.querySelector('.tiptap')?.textContent.includes('——全文完——'));
    if(phone)assert.equal(await directory.isVisible(),false);
    await page.screenshot({path:`/tmp/mobile-space/reader-start-${width}x${height}.png`});
    const manuscript=page.locator('.manuscript-background'),paperBox=await manuscript.boundingBox(),contentBox=await page.locator('#workspace-content').boundingBox();
    assert.ok(paperBox.height>=Math.min(210,contentBox.height*.5),`${width}x${height}: editor viewport squeezed to ${paperBox.height}px in ${contentBox.height}px`);
    const paragraph=await page.locator('.tiptap p').first().boundingBox();assert.ok(intersects(paragraph,paperBox)>=15,`${width}x${height}: first paragraph hidden below editor chrome`);
    const scroll=await manuscript.evaluate(node=>{node.scrollTop=node.scrollHeight;return{top:node.scrollTop,scroll:node.scrollHeight,client:node.clientHeight};});assert.ok(scroll.top>0&&scroll.scroll>scroll.client,`${width}x${height}: manuscript cannot scroll`);
    assert.ok(await page.locator('.tiptap p').last().evaluate(node=>{const parent=node.closest('.manuscript-background');const a=node.getBoundingClientRect(),b=parent.getBoundingClientRect();return a.bottom<=b.bottom+1&&a.bottom>b.top;}),`${width}x${height}: ending unreachable`);
    await page.screenshot({path:`/tmp/mobile-space/reader-${width}x${height}.png`});await noOverflow();assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
    results.push({viewport:`${width}x${height}`,shelfList:Math.round(listBox.height),outlineBody:Math.round(bodyBox.height),chapterList:Math.round(directoryListBox.height),manuscript:Math.round(paperBox.height)});
   }finally{await context.close();}
  }
  console.log(JSON.stringify({results,screenshots:'/tmp/mobile-space'}));
 }finally{await browser?.close();server?.kill();}
})().catch(error=>{console.error(error);process.exitCode=1;});
