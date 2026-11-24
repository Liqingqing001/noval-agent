const $ = s => document.querySelector(s);
const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let novels = [], selected = null, detail = null, currentChapter = null, tab = 'chapters', register = false, saveDialog = null, timer;
async function api(path, method = 'GET', body) { const r = await fetch('/api' + path, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }); const data = await r.json(); if (!r.ok) {
    if (r.status === 401 && path !== '/login')
        showLogin();
    throw Error(data.error || '操作失败');
} return data; }
function notice(msg) { $('#toast').textContent = msg; $('#toast').hidden = false; clearTimeout(timer); timer = setTimeout(() => $('#toast').hidden = true, 3500); }
function showLogin() { $('#workspace').hidden = true; $('#login-view').hidden = false; }
function act(fn) { return async (...args) => { try {
    await fn(...args);
}
catch (e) {
    notice(e.message);
} }; }
async function enter(user) { $('#login-view').hidden = true; $('#workspace').hidden = false; $('#user-name').textContent = user.nickname; await refresh(); }
$('#toggle-auth').onclick = () => { register = !register; $('#nickname-field').hidden = !register; $('#nickname-field input').required = register; $('#auth-submit').textContent = register ? '注册并进入书房 →' : '进入书房 →'; $('#toggle-auth').textContent = register ? '已有账号？登录' : '还没有账号？注册'; $('#auth-error').textContent = ''; };
$('#login-form').onsubmit = async (e) => { e.preventDefault(); const button = $('#auth-submit'); button.disabled = true; try {
    const data = Object.fromEntries(new FormData(e.target));
    const r = await api(register ? '/register' : '/login', 'POST', data);
    await enter(r.user);
}
catch (e) {
    $('#auth-error').textContent = e.message;
}
finally {
    button.disabled = false;
} };
$('#logout').onclick = act(async () => { await api('/logout', 'POST', {}); showLogin(); });
async function refresh(preferred = selected) { novels = (await api('/novels')).novels; selected = novels.some(n => n.id === preferred) ? preferred : (novels[0]?.id ?? null); renderBooks(); $('#no-novel').hidden = !!selected; for (const id of ['edit-novel', 'delete-novel', 'new-chapter', 'new-character'])
    $('#' + id).disabled = !selected; if (selected)
    await loadNovel();
else {
    detail = null;
    $('#novel-title').textContent = '开始一个新故事';
    $('#novel-summary').textContent = '';
    $('#book-stats').textContent = '';
    $('#chapters-view').hidden = true;
    $('#characters-view').hidden = true;
} }
const statusLabel = { draft: '草稿', writing: '创作中', completed: '已完成' }, roleLabel = { protagonist: '主角', supporting: '配角', minor: '其他人物' };
function renderBooks() { $('#books').innerHTML = novels.map(n => `<button class="book ${selected === n.id ? 'selected' : ''}" data-id="${n.id}" aria-pressed="${selected === n.id}"><div class="cover">${escape(n.title.slice(0, 1))}</div><div><h3>${escape(n.title)}</h3><span class="badge">${statusLabel[n.status]}</span><div class="meta">${n.chapter_count} 章 · ${n.word_count.toLocaleString()} 字</div></div></button>`).join('') || '<p class="empty small">书架空空如也<br>创建你的第一本书吧</p>'; $('#books').querySelectorAll('button').forEach(b => b.onclick = act(async () => { selected = Number(b.dataset.id); currentChapter = null; await refresh(); })); }
async function loadNovel() { detail = await api('/novels/' + selected); $('#novel-title').textContent = detail.novel.title; $('#novel-summary').textContent = detail.novel.summary; $('#book-stats').textContent = `${detail.chapters.length} 章 · ${detail.characters.length} 位人物`; renderChapters(); renderCharacters(); switchTab(tab); }
function switchTab(next) { tab = next; $('#chapters-view').hidden = tab !== 'chapters' || !selected; $('#characters-view').hidden = tab !== 'characters' || !selected; document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab)); }
document.querySelectorAll('.tab').forEach(b => b.onclick = () => switchTab(b.dataset.tab));
function renderChapters() { if (!detail.chapters.some(c => c.id === currentChapter))
    currentChapter = detail.chapters[0]?.id ?? null; $('#chapters').innerHTML = detail.chapters.map((c, i) => `<button class="chapter ${c.id === currentChapter ? 'selected' : ''}" data-id="${c.id}" aria-pressed="${c.id === currentChapter}"><span class="chapter-meta"><span>第 ${i + 1} 章</span><span>${c.word_count.toLocaleString()} 字</span></span><strong>${escape(c.title)}</strong></button>`).join('') || '<p class="small muted empty">还没有章节<br>点击 ＋ 开始创作</p>'; $('#chapters').querySelectorAll('button').forEach(b => b.onclick = () => { if ($('#save-state').textContent === '有未保存的修改' && !confirm('有未保存的修改，确定切换章节吗？'))
    return; currentChapter = Number(b.dataset.id); renderChapters(); }); const c = detail.chapters.find(c => c.id === currentChapter); $('#chapter-form').hidden = !c; $('#chapter-empty').hidden = !!c; if (c) {
    $('#chapter-title').value = c.title;
    $('#chapter-content').value = c.content;
    $('#save-state').textContent = '已载入';
    countWords();
} }
function countWords() { $('#word-count').textContent = Array.from($('#chapter-content').value.replace(/[\r\n]/g, '')).length.toLocaleString() + ' 字'; }
$('#chapter-content').oninput = () => { countWords(); $('#save-state').textContent = '有未保存的修改'; };
$('#chapter-title').oninput = () => $('#save-state').textContent = '有未保存的修改';
$('#chapter-form').onsubmit = act(async (e) => { e.preventDefault(); await api(`/novels/${selected}/chapters/${currentChapter}`, 'PUT', { title: $('#chapter-title').value, content: $('#chapter-content').value }); await refresh(); $('#save-state').textContent = '已保存'; notice('章节已保存'); });
function openDialog(title, fields, onSave) { $('#dialog-title').textContent = title; $('#dialog-fields').innerHTML = fields; saveDialog = onSave; $('#editor-dialog').showModal(); }
const field = (name, label, value = '', max = 100, kind = 'input') => `<label>${label}${kind === 'textarea' ? `<textarea aria-label="${label}" name="${name}" maxlength="${max}">${escape(value)}</textarea>` : `<input aria-label="${label}" name="${name}" value="${escape(value)}" maxlength="${max}" ${name === 'genre' ? '' : 'required'}>`}</label>`;
function novelDialog(edit = false) { const n = edit ? detail.novel : {}; openDialog(edit ? '编辑书籍' : '新建小说', field('title', '书名', n.title) + field('genre', '类型', n.genre, 30) + field('summary', '简介', n.summary, 2000, 'textarea') + `<label>状态<select name="status">${Object.entries(statusLabel).map(([k, v]) => `<option value="${k}" ${n.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>`, async (data) => { const r = await api(edit ? '/novels/' + selected : '/novels', edit ? 'PUT' : 'POST', data); currentChapter = null; await refresh(edit ? selected : r.id); notice(edit ? '书籍已更新' : '小说已创建'); }); }
$('#new-novel').onclick = () => novelDialog();
$('#edit-novel').onclick = () => novelDialog(true);
$('#delete-novel').onclick = act(async () => { if (confirm('确定删除这本小说？其章节和人物也会一起删除。')) {
    await api('/novels/' + selected, 'DELETE');
    currentChapter = null;
    await refresh();
    notice('小说及关联内容已删除');
} });
$('#new-chapter').onclick = () => openDialog('新建章节', field('title', '章节标题'), async (data) => { const r = await api('/novels/' + selected + '/chapters', 'POST', data); currentChapter = r.id; await refresh(); switchTab('chapters'); notice('章节已创建'); });
$('#delete-chapter').onclick = act(async () => { if (confirm('确定删除当前章节？')) {
    await api(`/novels/${selected}/chapters/${currentChapter}`, 'DELETE');
    currentChapter = null;
    await refresh();
    notice('章节已删除');
} });
function renderCharacters() { $('#characters').innerHTML = detail.characters.map(c => `<article class="character-card"><div class="avatar">${escape(c.name.slice(0, 1))}</div><h3>${escape(c.name)} <span class="badge">${roleLabel[c.role]}</span></h3><p>${escape(c.description) || '还没有人物介绍。'}</p><div class="actions"><button class="text-button" data-edit="${c.id}" aria-label="编辑人物 ${escape(c.name)}">编辑</button><button class="danger-link" data-delete="${c.id}" aria-label="删除人物 ${escape(c.name)}">删除</button></div></article>`).join('') || '<p class="empty">故事中的人物，等待你来命名。</p>'; $('#characters').querySelectorAll('[data-edit]').forEach(b => b.onclick = () => characterDialog(detail.characters.find(c => c.id === Number(b.dataset.edit)))); $('#characters').querySelectorAll('[data-delete]').forEach(b => b.onclick = act(async () => { if (confirm('确定删除这个人物？')) {
    await api(`/novels/${selected}/characters/${b.dataset.delete}`, 'DELETE');
    await refresh();
    notice('人物已删除');
} })); }
function characterDialog(c = {}) { openDialog(c.id ? '编辑人物' : '添加人物', field('name', '姓名', c.name, 30) + `<label>人物定位<select name="role">${Object.entries(roleLabel).map(([k, v]) => `<option value="${k}" ${(c.role || 'supporting') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>` + field('description', '人物介绍', c.description, 2000, 'textarea'), async (data) => { await api(`/novels/${selected}/characters${c.id ? '/' + c.id : ''}`, c.id ? 'PUT' : 'POST', data); await refresh(); notice('人物已保存'); }); }
$('#new-character').onclick = () => characterDialog();
for (const id of ['close-dialog', 'cancel-dialog'])
    $('#' + id).onclick = () => $('#editor-dialog').close();
$('#entity-form').onsubmit = act(async (e) => { e.preventDefault(); const button = e.submitter; button.disabled = true; try {
    await saveDialog(Object.fromEntries(new FormData(e.target)));
    $('#editor-dialog').close();
}
finally {
    button.disabled = false;
} });
api('/me').then(r => enter(r.user)).catch(() => showLogin());
