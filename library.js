(function(){

if (!window.SUPABASE_URL || window.SUPABASE_URL.includes('YOUR_')) {
  document.getElementById('libContent').innerHTML =
    '<div class="lib-empty"><div class="big">⚠</div><p>Chưa cấu hình Supabase.<br>Mở file <b>config.js</b> và điền URL + API key.</p></div>';
  return;
}

const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
let currentUser = null;
let currentNovel = null; // {id, title, content, ...}
let saveTimer = null;
let progressTimer = null;

const EMOJIS = ['📖','📚','⚔️','🐉','🏯','🌙','✨','🔥','🌸','👑','🗡️','🎴','🌌','🦋','🌺'];

/* ===== AUTH GUARD ===== */
sb.auth.getSession().then(({ data }) => {
  if (!data.session) { window.location.href = 'index.html'; return; }
  currentUser = data.session.user;
  document.getElementById('libUserEmail').textContent = currentUser.email;
  loadLibrary();
});
sb.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') window.location.href = 'index.html';
});
document.getElementById('logoutBtn').addEventListener('click', async () => {
  await sb.auth.signOut();
  window.location.href = 'index.html';
});

/* ===== SYNC BADGE ===== */
function setSyncStatus(state){ // 'saving' | 'saved' | 'error'
  [['syncBadge','syncText'],['syncBadge2','syncText2']].forEach(([bId,tId])=>{
    const b=document.getElementById(bId), t=document.getElementById(tId);
    if(!b)return;
    b.className='sync-badge '+(state==='saving'?'saving':state==='saved'?'saved':'');
    t.textContent = state==='saving' ? 'Đang lưu...' : state==='error' ? 'Lỗi đồng bộ' : 'Đã đồng bộ';
  });
}

/* ===== LOAD LIBRARY ===== */
async function loadLibrary(){
  const libContent = document.getElementById('libContent');
  libContent.innerHTML = '<div class="lib-loading">Đang tải thư viện...</div>';

  const { data: novels, error } = await sb
    .from('novels')
    .select('id,title,cover_emoji,cover_color,total_lines,total_chapters,updated_at')
    .order('updated_at', { ascending: false });

  if (error) {
    libContent.innerHTML = '<div class="lib-empty"><div class="big">⚠</div><p>Lỗi tải thư viện: '+esc(error.message)+'</p></div>';
    return;
  }
  if (!novels.length) {
    libContent.innerHTML = '<div class="lib-empty"><div class="big">📭</div><p>Chưa có truyện nào.<br>Bấm "➕ Dịch truyện mới" để bắt đầu.</p></div>';
    return;
  }

  // Fetch progress for all novels in one go
  const { data: progresses } = await sb
    .from('reading_progress')
    .select('novel_id,chapter_index,scroll_percent')
    .in('novel_id', novels.map(n=>n.id));
  const progMap = {};
  (progresses||[]).forEach(p => progMap[p.novel_id] = p);

  const grid = document.createElement('div');
  grid.className = 'lib-grid';
  novels.forEach(n => {
    const prog = progMap[n.id];
    const pct = prog && n.total_chapters ? Math.round(((prog.chapter_index+1)/n.total_chapters)*100) : 0;
    const card = document.createElement('div');
    card.className = 'lib-card';
    card.innerHTML = `
      <div class="lib-cover" style="background:${n.cover_color}22;">${n.cover_emoji||'📖'}</div>
      <div class="lib-info">
        <div class="lib-title">${esc(n.title)}</div>
        <div class="lib-meta">${n.total_chapters||0} chương · ${n.total_lines||0} dòng</div>
        ${prog ? `<div class="lib-progress-bar"><div class="lib-progress-fill" style="width:${pct}%"></div></div>` : ''}
      </div>
      <div class="lib-card-actions">
        <button class="lc-open">📖 Đọc</button>
        <button class="lc-edit">✏ Dịch/Sửa</button>
        <button class="lc-del danger">🗑</button>
      </div>`;
    card.querySelector('.lc-open').addEventListener('click', e => { e.stopPropagation(); openNovel(n.id, 'read'); });
    card.querySelector('.lc-edit').addEventListener('click', e => { e.stopPropagation(); openNovel(n.id, 'translate'); });
    card.querySelector('.lc-del').addEventListener('click', e => { e.stopPropagation(); deleteNovel(n.id, n.title); });
    card.addEventListener('click', () => openNovel(n.id, 'read'));
    grid.appendChild(card);
  });
  libContent.innerHTML = '';
  libContent.appendChild(grid);
}

function esc(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

async function deleteNovel(id, title){
  if (!confirm(`Xoá truyện "${title}"? Không thể hoàn tác.`)) return;
  const { error } = await sb.from('novels').delete().eq('id', id);
  if (error) { alert('Lỗi xoá: ' + error.message); return; }
  loadLibrary();
}

/* ===== NEW NOVEL MODAL ===== */
const nnOverlay = document.getElementById('nnOverlay');
const nnEmojiRow = document.getElementById('nnEmojiRow');
let selectedEmoji = EMOJIS[0];
EMOJIS.forEach((em,i) => {
  const b = document.createElement('button');
  b.className = 'nn-emoji' + (i===0?' sel':'');
  b.textContent = em;
  b.addEventListener('click', () => {
    selectedEmoji = em;
    nnEmojiRow.querySelectorAll('.nn-emoji').forEach(x=>x.classList.remove('sel'));
    b.classList.add('sel');
  });
  nnEmojiRow.appendChild(b);
});
document.getElementById('newNovelBtn').addEventListener('click', () => {
  document.getElementById('nnTitle').value = '';
  nnOverlay.classList.add('open');
  document.getElementById('nnTitle').focus();
});
document.getElementById('nnCancel').addEventListener('click', () => nnOverlay.classList.remove('open'));
nnOverlay.addEventListener('click', e => { if (e.target === nnOverlay) nnOverlay.classList.remove('open'); });

document.getElementById('nnCreate').addEventListener('click', async () => {
  const title = document.getElementById('nnTitle').value.trim();
  if (!title) { alert('Nhập tên truyện trước.'); return; }
  const { data, error } = await sb.from('novels').insert({
    user_id: currentUser.id,
    title,
    cover_emoji: selectedEmoji,
    cover_color: '#e8a245',
    content: '',
    total_lines: 0,
    total_chapters: 0
  }).select().single();
  if (error) { alert('Lỗi tạo truyện: ' + error.message); return; }
  nnOverlay.classList.remove('open');
  openNovel(data.id, 'translate');
});

/* ===== OPEN A NOVEL INTO THE APP ===== */
async function openNovel(novelId, mode){
  const { data: novel, error } = await sb.from('novels').select('*').eq('id', novelId).single();
  if (error) { alert('Lỗi mở truyện: ' + error.message); return; }
  currentNovel = novel;

  // Show app, hide library
  document.getElementById('libraryScreen').classList.remove('active');
  document.querySelector('header').classList.add('show');
  document.querySelector('.app-body').classList.add('show');
  document.querySelector('.app-title').textContent = '📖 ' + novel.title;

  // Load name data + settings
  await loadUserSettings();

  if (novel.content) {
    // Populate translate pane state
    transLines = novel.content.split('\n');
    srcLines = transLines.slice(); // best-effort; original source not stored separately
    resultArea.value = novel.content;
    emptyR.style.display = 'none'; resultWrap.style.display = 'block';
    dlBtn.disabled = false; cpBtn.disabled = false; readBtn.disabled = false; editBtn.disabled = false;
    fName.textContent = novel.source_filename || novel.title;
    fileInfo.style.display = 'block';
    lineCnt.textContent = `${transLines.length} dòng`;
  } else {
    emptyR.style.display = 'flex'; resultWrap.style.display = 'none';
  }

  if (mode === 'read' && novel.content) {
    gotoReader(novel.content);
    await restoreReadingProgress();
  } else {
    gotoTranslate();
  }
}

document.getElementById('backToLib').addEventListener('click', async () => {
  if (currentNovel) await saveCurrentProgress(true);
  document.querySelector('header').classList.remove('show');
  document.querySelector('.app-body').classList.remove('show');
  document.getElementById('libraryScreen').classList.add('active');
  currentNovel = null;
  loadLibrary();
});

/* ===== AUTO-SAVE TRANSLATED CONTENT ===== */
function scheduleSaveNovel(){
  if (!currentNovel) return;
  setSyncStatus('saving');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNovelNow, 1500);
}
async function saveNovelNow(){
  if (!currentNovel) return;
  const content = (typeof transLines !== 'undefined' && transLines.length) ? transLines.join('\n') : '';
  const chapterCount = (typeof rChapters !== 'undefined' && rChapters.length) ? rChapters.length : (currentNovel.total_chapters||0);
  const { error } = await sb.from('novels').update({
    content,
    total_lines: content ? content.split('\n').length : 0,
    total_chapters: chapterCount,
    source_filename: fName.textContent || currentNovel.title,
    updated_at: new Date().toISOString()
  }).eq('id', currentNovel.id);
  setSyncStatus(error ? 'error' : 'saved');
  if (!error) currentNovel.content = content;
}

// Hook into existing translation completion + edit-save to trigger sync
const _origAddLog = addLog;
addLog = function(type, msg){
  _origAddLog(type, msg);
  if (type === 'inf' && msg.includes('Dịch xong')) scheduleSaveNovel();
};
const _origExitEditMode = exitEditMode;
exitEditMode = function(skip){
  _origExitEditMode(skip);
  if (!skip) scheduleSaveNovel();
};

/* ===== READING PROGRESS SYNC ===== */
async function restoreReadingProgress(){
  if (!currentNovel) return;
  const { data } = await sb.from('reading_progress')
    .select('chapter_index,scroll_percent')
    .eq('novel_id', currentNovel.id)
    .maybeSingle();
  if (data && typeof rChapters !== 'undefined' && rChapters.length) {
    const idx = Math.min(data.chapter_index || 0, rChapters.length - 1);
    renderChapter(idx);
    if (data.scroll_percent) {
      setTimeout(() => {
        const el = document.getElementById('rScroll');
        if (el) el.scrollTop = (data.scroll_percent/100) * (el.scrollHeight - el.clientHeight);
      }, 150);
    }
  }
}
async function saveCurrentProgress(immediate){
  if (!currentNovel || typeof rCurCh === 'undefined') return;
  const el = document.getElementById('rScroll');
  const pct = el && el.scrollHeight > el.clientHeight
    ? Math.round(el.scrollTop / (el.scrollHeight - el.clientHeight) * 100) : 0;
  const payload = {
    user_id: currentUser.id,
    novel_id: currentNovel.id,
    chapter_index: rCurCh || 0,
    scroll_percent: pct,
    updated_at: new Date().toISOString()
  };
  await sb.from('reading_progress').upsert(payload, { onConflict: 'user_id,novel_id' });
}
function scheduleSaveProgress(){
  if (!currentNovel) return;
  clearTimeout(progressTimer);
  progressTimer = setTimeout(() => saveCurrentProgress(false), 2000);
}
// Hook scroll + chapter change to save progress periodically
document.addEventListener('scroll', e => {
  if (e.target && e.target.id === 'rScroll') scheduleSaveProgress();
}, true);
window.addEventListener('beforeunload', () => { if (currentNovel) saveCurrentProgress(true); });

/* ===== USER SETTINGS (theme, font, name data) ===== */
async function loadUserSettings(){
  const { data } = await sb.from('user_settings').select('*').eq('user_id', currentUser.id).maybeSingle();
  if (!data) {
    await sb.from('user_settings').insert({ user_id: currentUser.id });
    return;
  }
  if (data.theme) {
    document.body.className = data.theme;
    document.querySelectorAll('.theme-btn').forEach(b=>b.classList.toggle('active', b.dataset.t===data.theme));
  }
}
let settingsSaveTimer = null;
function scheduleSaveSettings(){
  if (!currentUser) return;
  clearTimeout(settingsSaveTimer);
  settingsSaveTimer = setTimeout(async () => {
    await sb.from('user_settings').upsert({
      user_id: currentUser.id,
      theme: document.body.className,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });
  }, 1000);
}
document.querySelectorAll('.theme-btn').forEach(b => b.addEventListener('click', scheduleSaveSettings));

})();
