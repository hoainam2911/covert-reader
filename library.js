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
        <button class="lc-info">ℹ Sửa</button>
        <button class="lc-del danger">🗑</button>
      </div>`;
    card.querySelector('.lc-open').addEventListener('click', e => { e.stopPropagation(); openNovel(n.id, 'read'); });
    card.querySelector('.lc-edit').addEventListener('click', e => { e.stopPropagation(); openNovel(n.id, 'translate'); });
    card.querySelector('.lc-info').addEventListener('click', e => { e.stopPropagation(); openEditInfoModal(n); });
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

async function deleteCommunityNovel(id, title){
  if (!confirm(`Xoá truyện "${title}" khỏi Cộng đồng? Không thể hoàn tác.`)) return;
  const { error } = await sb.from('community_novels').delete().eq('id', id);
  if (error) { alert('Lỗi xoá: ' + error.message); return; }
  loadCommunity();
}

/* ===== EDIT NOVEL INFO MODAL (dùng chung: thư viện cá nhân + cộng đồng) ===== */
const editInfoOverlay = document.getElementById('editInfoOverlay');
const eiTitle = document.getElementById('eiTitle');
const eiAuthor = document.getElementById('eiAuthor'), eiAuthorLabel = document.getElementById('eiAuthorLabel');
const eiDesc = document.getElementById('eiDesc'), eiDescLabel = document.getElementById('eiDescLabel');
const eiGenre = document.getElementById('eiGenre'), eiGenreLabel = document.getElementById('eiGenreLabel');
const eiEmojiRow = document.getElementById('eiEmojiRow');
const eiNsfwBlock = document.getElementById('eiNsfwBlock');
const eiIsNsfw = document.getElementById('eiIsNsfw');
const eiPassRow = document.getElementById('eiPassRow');
const eiPassword = document.getElementById('eiPassword');
const eiMsg = document.getElementById('eiMsg');
let editInfoTarget = null; // { type: 'personal'|'community', novel }
let eiSelectedEmoji = '📖';

function buildEiEmojiRow(emojiList){
  eiEmojiRow.innerHTML = '';
  emojiList.forEach(em => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'nn-emoji' + (em===eiSelectedEmoji?' sel':'');
    b.textContent = em;
    b.addEventListener('click', () => {
      eiSelectedEmoji = em;
      eiEmojiRow.querySelectorAll('.nn-emoji').forEach(x=>x.classList.remove('sel'));
      b.classList.add('sel');
    });
    eiEmojiRow.appendChild(b);
  });
}

function openEditInfoModal(novel, type){
  type = type || 'personal';
  editInfoTarget = { type, novel };
  eiMsg.textContent = '';
  eiTitle.value = novel.title || '';
  eiSelectedEmoji = novel.cover_emoji || '📖';

  if (type === 'personal') {
    eiAuthorLabel.style.display = 'none'; eiAuthor.style.display = 'none';
    eiDescLabel.style.display = 'none'; eiDesc.style.display = 'none';
    eiGenreLabel.style.display = 'none'; eiGenre.style.display = 'none';
    eiNsfwBlock.style.display = 'none';
    buildEiEmojiRow(EMOJIS);
  } else {
    eiAuthorLabel.style.display = ''; eiAuthor.style.display = '';
    eiDescLabel.style.display = ''; eiDesc.style.display = '';
    eiGenreLabel.style.display = ''; eiGenre.style.display = '';
    eiNsfwBlock.style.display = '';
    eiAuthor.value = novel.author_name || '';
    eiDesc.value = novel.description || '';
    if (!eiGenre.options.length) GENRES.forEach(g => {
      const o = document.createElement('option'); o.value = g.id; o.textContent = g.label;
      eiGenre.appendChild(o);
    });
    eiGenre.value = novel.genre || 'khac';
    eiIsNsfw.checked = !!novel.is_nsfw;
    eiPassRow.style.display = novel.is_nsfw ? '' : 'none';
    eiPassword.value = novel.nsfw_password || '';
    buildEiEmojiRow(COMM_EMOJIS);
  }
  editInfoOverlay.classList.add('open');
  setTimeout(()=>eiTitle.focus(), 60);
}
eiIsNsfw.addEventListener('change', () => { eiPassRow.style.display = eiIsNsfw.checked ? '' : 'none'; });
document.getElementById('eiCancel').addEventListener('click', () => editInfoOverlay.classList.remove('open'));
editInfoOverlay.addEventListener('click', e => { if (e.target===editInfoOverlay) editInfoOverlay.classList.remove('open'); });

document.getElementById('eiSave').addEventListener('click', async () => {
  if (!editInfoTarget) return;
  const title = eiTitle.value.trim();
  if (!title) { eiMsg.style.color='var(--red)'; eiMsg.textContent='Tên truyện không được để trống.'; return; }

  const btn = document.getElementById('eiSave');
  btn.disabled = true; btn.textContent = 'Đang lưu...';

  let error;
  if (editInfoTarget.type === 'personal') {
    ({ error } = await sb.from('novels').update({
      title, cover_emoji: eiSelectedEmoji, updated_at: new Date().toISOString()
    }).eq('id', editInfoTarget.novel.id));
  } else {
    ({ error } = await sb.from('community_novels').update({
      title,
      author_name: eiAuthor.value.trim() || 'Ẩn danh',
      description: eiDesc.value.trim(),
      genre: eiGenre.value,
      cover_emoji: eiSelectedEmoji,
      is_nsfw: eiIsNsfw.checked,
      nsfw_password: eiIsNsfw.checked ? (eiPassword.value.trim() || null) : null,
      updated_at: new Date().toISOString()
    }).eq('id', editInfoTarget.novel.id));
  }

  btn.disabled = false; btn.textContent = '💾 Lưu thay đổi';
  if (error) { eiMsg.style.color='var(--red)'; eiMsg.textContent = 'Lỗi: ' + error.message; return; }

  editInfoOverlay.classList.remove('open');
  // Reflect title change in app header if this is the currently open novel
  if (currentNovel && editInfoTarget.novel.id === currentNovel.id) {
    currentNovel.title = title;
    document.querySelector('.app-title').textContent = '📖 ' + title;
  }
  if (editInfoTarget.type === 'personal') loadLibrary(); else loadCommunity();
  editInfoTarget = null;
});

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
    document.getElementById('publishBtn').disabled = false;
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
  if (navCommunity.classList.contains('active')) loadCommunity();
  else loadLibrary();
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

/* ============================================
   CỘNG ĐỒNG — đăng truyện công khai, duyệt theo thể loại, khu NSFW
============================================ */

// Thể loại tham khảo từ các web truyện tu tiên/huyền huyễn phổ biến
// (qidian, biquge, sangtacviet, tangthuvien...)
const GENRES = [
  { id: 'tien-hiep',    label: '⚔️ Tiên hiệp' },
  { id: 'huyen-huyen',  label: '🌌 Huyền huyễn' },
  { id: 'kiem-hiep',    label: '🗡️ Kiếm hiệp' },
  { id: 'vo-hiep',      label: '👊 Võ hiệp' },
  { id: 'do-thi',       label: '🏙️ Đô thị' },
  { id: 'huyen-nghi',   label: '🔮 Huyền nghi' },
  { id: 'ky-huyen',     label: '👻 Kỳ huyễn' },
  { id: 'lich-su',      label: '📜 Lịch sử' },
  { id: 'quan-su',      label: '🏯 Quân sự' },
  { id: 'du-hi',        label: '🎮 Du hí' },
  { id: 'the-thao',     label: '⚽ Thể thao' },
  { id: 'khoa-huyen',   label: '🚀 Khoa huyễn' },
  { id: 'di-gioi',      label: '🌍 Dị giới' },
  { id: 'xuyen-khong',  label: '⏳ Xuyên không' },
  { id: 'trung-sinh',   label: '🔄 Trùng sinh' },
  { id: 'he-thong',     label: '🖥️ Hệ thống' },
  { id: 'mat-the',      label: '☄️ Mạt thế' },
  { id: 'ngon-tinh',    label: '💕 Ngôn tình' },
  { id: 'dam-my',       label: '🏳️‍🌈 Đam mỹ' },
  { id: 'di-nang',      label: '✨ Dị năng' },
  { id: 'truyen-ngan',  label: '📝 Truyện ngắn' },
  { id: 'khac',         label: '📚 Khác' },
];
const COMM_EMOJIS = ['📖','📚','⚔️','🐉','🏯','🌙','✨','🔥','🌸','👑','🗡️','🎴','🌌','🦋','🌺','🔮','👻','🚀','💕','☄️'];

let commSection = 'normal'; // 'normal' | 'nsfw'
let commGenreFilter = null; // null = tất cả

/* ----- NAV: Của tôi <-> Cộng đồng ----- */
const navMyLib = document.getElementById('navMyLib');
const navCommunity = document.getElementById('navCommunity');
const myLibBody = document.getElementById('myLibBody');
const communityBody = document.getElementById('communityBody');
const libScreenTitle = document.getElementById('libScreenTitle');

navMyLib.addEventListener('click', () => {
  navMyLib.classList.add('active'); navCommunity.classList.remove('active');
  myLibBody.style.display = ''; communityBody.style.display = 'none';
  libScreenTitle.textContent = '📚 Thư viện truyện';
});
navCommunity.addEventListener('click', () => {
  navCommunity.classList.add('active'); navMyLib.classList.remove('active');
  myLibBody.style.display = 'none'; communityBody.style.display = '';
  libScreenTitle.textContent = '🌐 Cộng đồng';
  loadCommunity();
});

/* ----- Genre filter pills ----- */
const commGenreRow = document.getElementById('commGenreRow');
function renderGenrePills(){
  commGenreRow.innerHTML = '';
  const allPill = document.createElement('button');
  allPill.className = 'comm-genre-pill' + (commGenreFilter===null?' active':'');
  allPill.textContent = 'Tất cả';
  allPill.addEventListener('click', () => { commGenreFilter = null; renderGenrePills(); loadCommunity(); });
  commGenreRow.appendChild(allPill);
  GENRES.forEach(g => {
    const pill = document.createElement('button');
    pill.className = 'comm-genre-pill' + (commGenreFilter===g.id?' active':'');
    pill.textContent = g.label;
    pill.addEventListener('click', () => { commGenreFilter = g.id; renderGenrePills(); loadCommunity(); });
    commGenreRow.appendChild(pill);
  });
}
renderGenrePills();

/* ----- Section tabs: Truyện thường <-> NSFW ----- */
const commSectionNormal = document.getElementById('commSectionNormal');
const commSectionNSFW = document.getElementById('commSectionNSFW');
commSectionNormal.addEventListener('click', () => {
  commSection = 'normal';
  commSectionNormal.classList.add('active'); commSectionNSFW.classList.remove('active');
  loadCommunity();
});
commSectionNSFW.addEventListener('click', () => {
  commSection = 'nsfw';
  commSectionNSFW.classList.add('active'); commSectionNormal.classList.remove('active');
  loadCommunity();
});

function genreLabel(id){ const g = GENRES.find(x=>x.id===id); return g ? g.label : '📚 Khác'; }

/* ----- Load + render community grid ----- */
async function loadCommunity(){
  const el = document.getElementById('commContent');
  el.innerHTML = '<div class="lib-loading">Đang tải...</div>';

  let query = sb.from('community_novels')
    .select('id,user_id,title,author_name,description,genre,cover_emoji,cover_color,total_lines,total_chapters,is_nsfw,nsfw_password,views,created_at')
    .eq('is_nsfw', commSection === 'nsfw')
    .order('created_at', { ascending: false });
  if (commGenreFilter) query = query.eq('genre', commGenreFilter);

  const { data: novels, error } = await query;
  if (error) { el.innerHTML = '<div class="lib-empty"><div class="big">⚠</div><p>Lỗi tải: '+esc(error.message)+'</p></div>'; return; }
  if (!novels.length) {
    el.innerHTML = `<div class="lib-empty"><div class="big">${commSection==='nsfw'?'🔞':'📭'}</div><p>Chưa có truyện nào ở mục này.</p></div>`;
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'lib-grid';
  novels.forEach(n => {
    const isOwner = currentUser && n.user_id === currentUser.id;
    const card = document.createElement('div');
    card.className = 'lib-card';
    card.innerHTML = `
      <div class="lib-cover" style="background:${n.cover_color}22;">${n.cover_emoji||'📖'}</div>
      <div class="lib-info">
        <div class="lib-title">${esc(n.title)}</div>
        <div class="comm-card-meta-row">
          <span class="comm-genre-tag">${genreLabel(n.genre)}</span>
          ${n.is_nsfw ? '<span class="comm-nsfw-badge">18+</span>' : ''}
        </div>
        <div class="lib-meta">${n.total_chapters||0} chương · ${n.total_lines||0} dòng</div>
        <div class="comm-card-meta-row">
          <span class="comm-author">✍ ${esc(n.author_name||'Ẩn danh')}</span>
          <span class="comm-views">👁 ${n.views||0}</span>
        </div>
      </div>
      ${isOwner ? `<div class="lib-card-actions">
        <button class="cc-info">ℹ Sửa</button>
        <button class="cc-del danger">🗑</button>
      </div>` : ''}`;
    if (isOwner) {
      card.querySelector('.cc-info').addEventListener('click', e => { e.stopPropagation(); openEditInfoModal(n, 'community'); });
      card.querySelector('.cc-del').addEventListener('click', e => { e.stopPropagation(); deleteCommunityNovel(n.id, n.title); });
    }
    card.addEventListener('click', () => openCommunityNovel(n));
    grid.appendChild(card);
  });
  el.innerHTML = '';
  el.appendChild(grid);
}

/* ----- NSFW password gate ----- */
const nsfwGateOverlay = document.getElementById('nsfwGateOverlay');
const nsfwGatePass = document.getElementById('nsfwGatePass');
const nsfwGateMsg = document.getElementById('nsfwGateMsg');
let pendingNsfwNovel = null;

function openCommunityNovel(novel){
  if (novel.is_nsfw && novel.nsfw_password) {
    pendingNsfwNovel = novel;
    nsfwGatePass.value = ''; nsfwGateMsg.textContent = '';
    nsfwGateOverlay.classList.add('open');
    setTimeout(()=>nsfwGatePass.focus(), 60);
    return;
  }
  loadCommunityNovelIntoReader(novel);
}
document.getElementById('nsfwGateCancel').addEventListener('click', () => {
  nsfwGateOverlay.classList.remove('open'); pendingNsfwNovel = null;
});
nsfwGateOverlay.addEventListener('click', e => { if (e.target===nsfwGateOverlay){ nsfwGateOverlay.classList.remove('open'); pendingNsfwNovel=null; } });
document.getElementById('nsfwGateConfirm').addEventListener('click', () => {
  if (!pendingNsfwNovel) return;
  if (nsfwGatePass.value === pendingNsfwNovel.nsfw_password) {
    nsfwGateOverlay.classList.remove('open');
    loadCommunityNovelIntoReader(pendingNsfwNovel);
    pendingNsfwNovel = null;
  } else {
    nsfwGateMsg.textContent = 'Sai mật khẩu.';
  }
});
nsfwGatePass.addEventListener('keydown', e => { if (e.key==='Enter') document.getElementById('nsfwGateConfirm').click(); });

async function loadCommunityNovelIntoReader(novelMeta){
  // Fetch full content + bump view count
  const { data: full, error } = await sb.from('community_novels').select('content').eq('id', novelMeta.id).single();
  if (error || !full.content) { alert('Không tải được nội dung truyện.'); return; }
  sb.rpc('increment_novel_views', { novel_id: novelMeta.id }).then(()=>{});

  currentNovel = null; // community novels are read-only, not tied to "my library" sync
  document.getElementById('libraryScreen').classList.remove('active');
  document.querySelector('header').classList.add('show');
  document.querySelector('.app-body').classList.add('show');
  document.querySelector('.app-title').textContent = '🌐 ' + novelMeta.title;
  document.getElementById('publishBtn').disabled = true; // can't republish someone else's novel

  gotoReader(full.content);
}

/* ----- Publish modal ----- */
const pubOverlay = document.getElementById('pubOverlay');
const pubGenreSel = document.getElementById('pubGenre');
const pubEmojiRow = document.getElementById('pubEmojiRow');
const pubIsNsfw = document.getElementById('pubIsNsfw');
const pubPassRow = document.getElementById('pubPassRow');
let pubSelectedEmoji = COMM_EMOJIS[0];

GENRES.forEach(g => {
  const o = document.createElement('option'); o.value = g.id; o.textContent = g.label;
  pubGenreSel.appendChild(o);
});
COMM_EMOJIS.forEach((em,i) => {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'nn-emoji' + (i===0?' sel':'');
  b.textContent = em;
  b.addEventListener('click', () => {
    pubSelectedEmoji = em;
    pubEmojiRow.querySelectorAll('.nn-emoji').forEach(x=>x.classList.remove('sel'));
    b.classList.add('sel');
  });
  pubEmojiRow.appendChild(b);
});
pubIsNsfw.addEventListener('change', () => {
  pubPassRow.style.display = pubIsNsfw.checked ? '' : 'none';
});

document.getElementById('publishBtn').addEventListener('click', () => {
  if (!currentNovel || !transLines.length) { alert('Chưa có nội dung để đăng.'); return; }
  document.getElementById('pubAuthor').value = '';
  document.getElementById('pubDesc').value = '';
  document.getElementById('pubPassword').value = '';
  pubIsNsfw.checked = false;
  pubPassRow.style.display = 'none';
  pubOverlay.classList.add('open');
});
document.getElementById('pubCancel').addEventListener('click', () => pubOverlay.classList.remove('open'));
pubOverlay.addEventListener('click', e => { if (e.target===pubOverlay) pubOverlay.classList.remove('open'); });

document.getElementById('pubConfirm').addEventListener('click', async () => {
  if (!currentNovel) return;
  const content = transLines.join('\n');
  const isNsfw = pubIsNsfw.checked;
  const payload = {
    user_id: currentUser.id,
    author_name: document.getElementById('pubAuthor').value.trim() || 'Ẩn danh',
    title: currentNovel.title,
    description: document.getElementById('pubDesc').value.trim(),
    genre: pubGenreSel.value,
    cover_emoji: pubSelectedEmoji,
    cover_color: '#e8a245',
    content,
    total_lines: content.split('\n').length,
    total_chapters: (typeof rChapters !== 'undefined' && rChapters.length) ? rChapters.length : (currentNovel.total_chapters||0),
    is_nsfw: isNsfw,
    nsfw_password: isNsfw ? (document.getElementById('pubPassword').value.trim() || null) : null,
  };
  const btn = document.getElementById('pubConfirm');
  btn.disabled = true; btn.textContent = 'Đang đăng...';
  const { error } = await sb.from('community_novels').insert(payload);
  btn.disabled = false; btn.textContent = '✅ Đăng truyện';
  if (error) { alert('Lỗi đăng truyện: ' + error.message); return; }
  pubOverlay.classList.remove('open');
  alert('Đã đăng truyện lên Cộng đồng! Vào tab 🌐 Cộng đồng để xem.');
});

})();
