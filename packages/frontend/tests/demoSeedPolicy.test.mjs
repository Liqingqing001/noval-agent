import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { demoFixtureFingerprint, shouldInitializeTideDemo } from '../src/demo/seedPolicy.ts';
const legacy=JSON.parse(readFileSync(new URL('../src/demo/lingShiOrigin.json',import.meta.url),'utf8'));
const empty={novels:[],chapters:[],characters:[],worldSettings:[],plotCards:[],foreshadowings:[]};

test('first visit and pristine legacy visitors receive the new single-book snapshot',()=>{
 assert.equal(shouldInitializeTideDemo(empty),true);
 assert.equal(demoFixtureFingerprint(legacy),'1ff88ccd');
 assert.equal(shouldInitializeTideDemo(legacy),true);
 const progressed=structuredClone(legacy);
 for(const card of progressed.plotCards){card.status='completed';card.statusMode='auto';card.chapterId=progressed.chapters[0].id;}
 progressed.novels[0].lastOpenedChapterId=progressed.chapters.at(-1).id;
 progressed.novels[0].wordCount=1;
 assert.equal(shouldInitializeTideDemo(progressed),true);
});
test('edits and visitor books survive automatic upgrade; only explicit reset replaces them',()=>{
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
