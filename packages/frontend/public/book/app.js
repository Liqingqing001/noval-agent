'use strict';
const $ = id => document.getElementById(id);
const key = 'tide-book-reading-v1';
const safeRead = () => {try{return JSON.parse(localStorage.getItem(key)||'{}');}catch{return {};}};
let memory = safeRead();
const save = () => {try{localStorage.setItem(key,JSON.stringify(memory));}catch{/* Reading also works when storage is disabled. */}};
const el = (tag, text, className) => {const n=document.createElement(tag); if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
let manifest, setting, currentId, sequence=0, loading=false;
const cache = new Map();
const formatter = new Intl.NumberFormat('zh-CN');
function resumeLink(){if(manifest?.chapters.some(x=>x.id===memory.id)){$('resume').hidden=false;$('resume').href='#read/'+memory.id;$('resume').textContent='继续阅读 · 第'+Number(memory.id)+'章';}}
function renderLanding(){
  $('stat-han').textContent=formatter.format(manifest.hanCount);
  $('word-count').textContent=`正文 ${formatter.format(manifest.hanCount)} 汉字（不含标题、标点、大纲与设定），共五卷四十章。每章字数按正文单独统计。`;
  $('credit').textContent=setting.credit;
  for(const act of setting.acts){const section=el('div',undefined,'act');section.append(el('h3',act.title));const grid=el('div',undefined,'chapters');for(const c of manifest.chapters.filter(x=>+x.id>=act.range[0]&&+x.id<=act.range[1])){const a=el('a',undefined,'chapter-link');a.href='#read/'+c.id;a.append(el('span',c.id,'num'),el('span',c.title.replace(/^第.+?章\s*/,'')),el('span',formatter.format(c.hanCount)+' 字','count'));grid.append(a);}section.append(grid);$('chapter-list').append(section);}
  for(const c of setting.characters.slice(0,4)){const card=el('article',undefined,'character-card');card.style.setProperty('--accent',c.color);card.append(el('h3',c.name),el('span',c.role,'role'),el('p',c.desire),el('p',c.detail));$('character-cards').append(card);}
  for(const c of setting.characters){const card=el('article');card.append(el('h3',c.name+' · '+c.role),el('p','欲望：'+c.desire),el('p','局限：'+c.flaw),el('p','弧线：'+c.arc));$('all-character-arcs').append(card);}
  setting.world.forEach((w,i)=>{const card=el('article',undefined,'world-card');card.append(el('span','0'+(i+1)),el('h3',w.title),el('p',w.text));$('world-cards').append(card);});
  for(const t of setting.timeline){const row=el('div');row.append(el('h4',t.time),el('p',t.event));$('timeline').append(row);}
  for(const act of setting.acts){const group=el('div');group.append(el('h3',act.title),el('p',act.description));const list=el('ol');list.start=act.range[0];for(const c of manifest.chapters.filter(x=>+x.id>=act.range[0]&&+x.id<=act.range[1])){const item=el('li');item.append(el('strong',c.title+'：'),el('span',c.summary));list.append(item);}group.append(list);$('outline-content').append(group);}
  for(const c of manifest.chapters){const option=el('option',c.title);option.value=c.id;$('chapter-select').append(option);}
  resumeLink();
}
function appearance(){const n=Number(memory.font);const size=Number.isFinite(n)?Math.min(28,Math.max(16,n)):20;document.documentElement.style.setProperty('--reader-size',size+'px');document.body.classList.toggle('night',memory.night===true);$('theme').setAttribute('aria-pressed',String(memory.night===true));$('theme').textContent=memory.night?'日读':'夜读';}
async function route(){
  const token=++sequence;
  const match=location.hash.match(/^#read\/(\d{2})$/);
  const chapter=match&&manifest.chapters.find(x=>x.id===match[1]);
  if(!chapter){currentId=null;loading=false;$('reader').hidden=true;$('landing').hidden=false;document.title=setting.title+' · 原创完本小说';resumeLink();if(location.hash.startsWith('#read'))location.hash='#contents';requestAnimationFrame(()=>{const target=document.getElementById(location.hash.slice(1)||'home');target?.scrollIntoView({behavior:'instant'});});return;}
  currentId=chapter.id;loading=true;$('landing').hidden=true;$('reader').hidden=false;$('reading-error').hidden=true;$('chapter-body').setAttribute('aria-busy','true');$('chapter-body').replaceChildren(el('p','正在载入章节……'));$('chapter-title').textContent=chapter.title;$('chapter-select').value=chapter.id;
  const act=setting.acts.find(x=>+chapter.id>=x.range[0]&&+chapter.id<=x.range[1]);$('reader-act').textContent=act.title;
  $('chapter-meta').textContent=`第 ${Number(chapter.id)} / 40 章 · ${formatter.format(chapter.hanCount)} 汉字 · 约 ${Math.max(3,Math.round(chapter.hanCount/350))} 分钟`;
  document.title=chapter.title+' · '+setting.title;
  const index=manifest.chapters.indexOf(chapter);
  for(const [id,position] of [['previous',index-1],['next',index+1]]){const a=$(id);const valid=!!manifest.chapters[position];a.setAttribute('aria-disabled',String(!valid));a.tabIndex=valid?0:-1;a.href=valid?'#read/'+manifest.chapters[position].id:'#contents';}
  $('reader-end').hidden=index!==manifest.chapters.length-1;
  window.scrollTo({top:0,behavior:'instant'});
  try{
    let content=cache.get(chapter.id);if(!content){const response=await fetch(`./chapters/${chapter.id}.md`);if(!response.ok)throw Error('HTTP '+response.status);content=await response.text();if(!content.startsWith('# '))throw Error('Invalid chapter');cache.set(chapter.id,content);}
    if(token!==sequence)return;
    const body=content.replace(/^# .*\r?\n/,'').trim();const fragment=document.createDocumentFragment();for(const paragraph of body.split(/\r?\n\s*\r?\n/)){fragment.append(el('p',paragraph));}$('chapter-body').replaceChildren(fragment);$('chapter-body').setAttribute('aria-busy','false');loading=false;
    const restore=memory.id===chapter.id?Math.max(0,Number(memory.scroll)||0):0;memory={...memory,id:chapter.id,scroll:restore};save();
    requestAnimationFrame(()=>{if(token!==sequence)return;window.scrollTo({top:Math.min(restore,Math.max(0,document.documentElement.scrollHeight-innerHeight)),behavior:'instant'});if(restore===0)$('chapter-title').focus({preventScroll:true});});
  }catch{if(token!==sequence)return;loading=false;$('chapter-body').replaceChildren();$('chapter-body').setAttribute('aria-busy','false');$('reading-error').hidden=false;}
}
let scrollTimer;
window.addEventListener('scroll',()=>{if(!currentId||loading||!$('reading-error').hidden)return;clearTimeout(scrollTimer);const id=currentId;scrollTimer=setTimeout(()=>{if(id===currentId){memory={...memory,id,scroll:window.scrollY};save();}},180);},{passive:true});
window.addEventListener('pagehide',()=>{if(currentId&&!loading&&$('reading-error').hidden){memory={...memory,id:currentId,scroll:window.scrollY};save();}});
$('theme').addEventListener('click',()=>{memory.night=!memory.night;save();appearance();});
for(const [id,delta] of [['font-up',1],['font-down',-1]])$(id).addEventListener('click',()=>{memory.font=Math.min(28,Math.max(16,(Number(memory.font)||20)+delta));save();appearance();});
$('chapter-select').addEventListener('change',e=>{location.hash='#read/'+e.target.value;});$('retry').addEventListener('click',()=>void route());
window.addEventListener('keydown',e=>{if(!currentId||/INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target.tagName)||e.altKey||e.ctrlKey||e.metaKey)return;if(e.key==='ArrowLeft'&&$('previous').getAttribute('aria-disabled')==='false')location.hash=$('previous').hash;if(e.key==='ArrowRight'&&$('next').getAttribute('aria-disabled')==='false')location.hash=$('next').hash;});
appearance();
(async()=>{try{const responses=await Promise.all([fetch('./manifest.json'),fetch('./setting.json')]);if(responses.some(x=>!x.ok))throw Error('Metadata unavailable');[manifest,setting]=await Promise.all(responses.map(x=>x.json()));renderLanding();window.addEventListener('hashchange',()=>void route());await route();}catch{$('load-error').hidden=false;}})();
