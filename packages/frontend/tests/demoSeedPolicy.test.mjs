import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { demoFixtureFingerprint, shouldInitializeTideDemo, mergeDemoLibrary } from '../src/demo/seedPolicy.ts';
const legacy=JSON.parse(readFileSync(new URL('../src/demo/lingShiOrigin.json',import.meta.url),'utf8'));
const empty={novels:[],chapters:[],characters:[],worldSettings:[],plotCards:[],foreshadowings:[]};
const library=JSON.parse(readFileSync(new URL('../src/demo/library.json',import.meta.url),'utf8'));

test('an empty browser receives both complete cases with School first',()=>{
 assert.deepEqual(mergeDemoLibrary(empty,library),{...library,sessions:[]});
});

test('historical Tide migration recognizes the retired pristine sample',()=>{
 assert.equal(shouldInitializeTideDemo(empty),true);
 assert.equal(demoFixtureFingerprint(legacy),'1ff88ccd');
 assert.equal(shouldInitializeTideDemo(legacy),true);
 const progressed=structuredClone(legacy);
 for(const card of progressed.plotCards){card.status='completed';card.statusMode='auto';card.chapterId=progressed.chapters[0].id;}
 progressed.novels[0].lastOpenedChapterId=progressed.chapters.at(-1).id;
 progressed.novels[0].wordCount=1;
 assert.equal(shouldInitializeTideDemo(progressed),true);
});

test('library upgrades add both complete cases without removing edited or visitor-created books',()=>{
 const edited=structuredClone(legacy);
 edited.chapters[0].content+='\n保留我的正文';
 edited.novels.push({id:'visitor-book',title:'自写作品'});
 edited.chapters.push({id:'visitor-chapter',novelId:'visitor-book',title:'自写章节',content:'自写正文'});
 edited.sessions=[{id:'visitor-chat',novelId:edited.novels[0].id}];
 const merged=mergeDemoLibrary(edited,library);
 assert.deepEqual(merged.novels.slice(0,2).map(novel=>novel.id),['demo-school-night','demo-tide-remembers']);
 for(const key of Object.keys(empty))for(const record of edited[key])assert.deepEqual(merged[key].find(item=>item.id===record.id),record);
 assert.deepEqual(merged.sessions,edited.sessions);
 assert.deepEqual(mergeDemoLibrary(merged,library),merged,'Repeated initialization is idempotent');
});

test('edited Tide survives new-book initialization; explicit restore affects only the selected case',()=>{
 const edited=structuredClone(library);
 const tideId='demo-tide-remembers';
 const tideChapter=edited.chapters.find(chapter=>chapter.novelId===tideId);
 tideChapter.content+='\n潮汐正文的本地修改';
 edited.novels.push({id:'visitor-book',title:'新书'});
 edited.chapters.push({id:'visitor-chapter',novelId:'visitor-book',title:'新章节',content:'自己的文字'});
 edited.sessions=[{id:'tide-chat',novelId:tideId},{id:'school-chat',novelId:'demo-school-night'},{id:'custom-chat',novelId:'visitor-book'}];
 const merged=mergeDemoLibrary(edited,library);
 assert.equal(merged.chapters.find(chapter=>chapter.id===tideChapter.id).content,tideChapter.content);
 const restored=mergeDemoLibrary(merged,library,{resetNovelId:'demo-school-night'});
 assert.equal(restored.chapters.find(chapter=>chapter.id===tideChapter.id).content,tideChapter.content);
 assert.equal(restored.chapters.find(chapter=>chapter.id==='visitor-chapter').content,'自己的文字');
 assert.deepEqual(restored.sessions.map(session=>session.id),['tide-chat','custom-chat']);
 const restoredTide=mergeDemoLibrary(restored,library,{resetNovelId:tideId});
 assert.equal(restoredTide.chapters.find(chapter=>chapter.id===tideChapter.id).content,library.chapters.find(chapter=>chapter.id===tideChapter.id).content);
 assert.equal(restoredTide.chapters.find(chapter=>chapter.id==='visitor-chapter').content,'自己的文字');
});
test('historical Tide replacement guard protects edits and visitor books',()=>{
 const edited=structuredClone(legacy);edited.chapters[0].content+='\n我的修改';
 assert.equal(shouldInitializeTideDemo(edited),false);
 const custom=structuredClone(legacy);custom.novels.push({...custom.novels[0],id:'my-book',title:'自己的作品'});
 assert.equal(shouldInitializeTideDemo(custom),false);
 assert.equal(shouldInitializeTideDemo(custom,true),true);
 assert.equal(shouldInitializeTideDemo({...legacy,sessions:[{id:'visitor-chat'}]}),false);
 assert.equal(shouldInitializeTideDemo(legacy,false,true),false);
 const manual=structuredClone(legacy);manual.plotCards[0].statusMode='manual';assert.equal(shouldInitializeTideDemo(manual),false);
 const tide=structuredClone(legacy);tide.novels[0].id='demo-tide-novel';
 assert.equal(shouldInitializeTideDemo(tide),false);
});
