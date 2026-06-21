(function(){

if (!window.SUPABASE_URL || window.SUPABASE_URL.includes('YOUR_')) {
  document.getElementById('libContent').innerHTML =
    '<div class="lib-empty"><div class="big">⚠</div><p>Chưa cấu hình Supabase.<br>Mở file <b>config.js</b> và điền URL + API key.</p></div>';
  return;
}

const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
let currentUser = null;
let currentNovel = null;       // truyện cá nhân đang mở (thư viện riêng)
let viewingCommunityNovel = null; // truyện cộng đồng đang xem ở trang chi tiết
let saveTimer = null;
let progressTimer = null;

function esc(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function timeAgo(iso){
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'vừa xong';
  if (diff < 3600) return Math.floor(diff/60) + ' phút trước';
  if (diff < 86400) return Math.floor(diff/3600) + ' giờ trước';
  if (diff < 2592000) return Math.floor(diff/86400) + ' ngày trước';
  return new Date(iso).toLocaleDateString('vi-VN');
}

/* ===== AUTH GUARD ===== */
sb.auth.getSession().then(({ data }) => {
  if (!data.session) { window.location.href = 'index.html'; return; }
  currentUser = data.session.user;
  document.getElementById('libUserEmail').textContent = currentUser.email;
  loadLibrary();
});
sb.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') window.location.href = 'index.html';
});
document.getElementById('logoutBtn').addEventListener('click', async () => {
  await sb.auth.signOut();
  window.location.href = 'index.html';
});

/* ===== SYNC BADGE ===== */
function setSyncStatus(state){
  [['syncBadge','syncText'],['syncBadge2','syncText2']].forEach(([bId,tId])=>{
    const b=document.getElementById(bId), t=document.getElementById(tId);
    if(!b)return;
    b.className='sync-badge '+(state==='saving'?'saving':state==='saved'?'saved':'');
    t.textContent = state==='saving' ? 'Đang lưu...' : state==='error' ? 'Lỗi đồng bộ' : 'Đã đồng bộ';
  });
}

/* ============================================
   COVER IMAGE UPLOAD (Supabase Storage)
============================================ */
async function uploadCoverFile(file){
  if (!file) return null;
  if (!file.type.startsWith('image/')) { alert('Vui lòng chọn file ảnh.'); return null; }
  if (file.size > 5 * 1024 * 1024) { alert('Ảnh tối đa 5MB.'); return null; }
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${currentUser.id}/${Date.now()}_${Math.random().toString(36).slice(2,8)}.${ext}`;
  const { error } = await sb.storage.from('covers').upload(path, file, { upsert: false });
  if (error) { alert('Lỗi upload ảnh: ' + error.message + '\n\nNếu lỗi nhắc tới "bucket", hãy chắc chắn đã chạy schema_upgrade_v2.sql trong Supabase.'); return null; }
  const { data } = sb.storage.from('covers').getPublicUrl(path);
  return data.publicUrl;
}

/* Generic cover-upload-box wiring */
function wireCoverBox(boxId, inputId){
  const box = document.getElementById(boxId);
  const input = document.getElementById(inputId);
  let pickedFile = null;
  let existingUrl = null;

  box.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    const f = input.files[0];
    if (!f) return;
    pickedFile = f;
    const reader = new FileReader();
    reader.onload = e => {
      box.classList.add('has-image');
      let img = box.querySelector('img');
      if (!img) { img = document.createElement('img'); box.prepend(img); }
      img.src = e.target.result;
    };
    reader.readAsDataURL(f);
  });

  return {
    reset(){
      pickedFile = null; existingUrl = null;
      box.classList.remove('has-image');
      const img = box.querySelector('img'); if (img) img.remove();
      input.value = '';
    },
    setExisting(url){
      existingUrl = url || null;
      if (url) {
        box.classList.add('has-image');
        let img = box.querySelector('img');
        if (!img) { img = document.createElement('img'); box.prepend(img); }
        img.src = url;
      } else {
        box.classList.remove('has-image');
        const img = box.querySelector('img'); if (img) img.remove();
      }
    },
    getFile(){ return pickedFile; },
    getExistingUrl(){ return existingUrl; },
    async resolveUrl(){
      if (pickedFile) return await uploadCoverFile(pickedFile);
      return existingUrl;
    }
  };
}

function coverHtml(url, fallbackEmoji){
  if (url) return `<img src="${esc(url)}" alt="" loading="lazy">`;
  return `<div class="cover-fallback">${fallbackEmoji||'📖'}</div>`;
}

/* ============================================
   NAV: Của tôi / Cộng đồng / Yêu thích / Lịch sử
============================================ */
const navMyLib = document.getElementById('navMyLib');
const navCommunity = document.getElementById('navCommunity');
const navFavorites = document.getElementById('navFavorites');
const navHistory = document.getElementById('navHistory');
const myLibBody = document.getElementById('myLibBody');
const communityBody = document.getElementById('communityBody');
const favoritesBody = document.getElementById('favoritesBody');
const historyBody = document.getElementById('historyBody');
const libScreenTitle = document.getElementById('libScreenTitle');
const allBodies = [
  [navMyLib, myLibBody, '📚 Thư viện truyện', null],
  [navCommunity, communityBody, '🌐 Cộng đồng', () => loadCommunity()],
  [navFavorites, favoritesBody, '⭐ Truyện yêu thích', () => loadFavorites()],
  [navHistory, historyBody, '🕐 Lịch sử đọc', () => loadHistory()],
];
function switchNav(activeTab){
  allBodies.forEach(([tab, body, title, loader]) => {
    const isActive = tab === activeTab;
    tab.classList.toggle('active', isActive);
    body.style.display = isActive ? '' : 'none';
    if (isActive) { libScreenTitle.textContent = title; if (loader) loader(); }
  });
}
navMyLib.addEventListener('click', () => switchNav(navMyLib));
navCommunity.addEventListener('click', () => switchNav(navCommunity));
navFavorites.addEventListener('click', () => switchNav(navFavorites));
navHistory.addEventListener('click', () => switchNav(navHistory));

/* ============================================
   MY LIBRARY (thư viện cá nhân)
============================================ */
async function loadLibrary(){
  const libContent = document.getElementById('libContent');
  libContent.innerHTML = '<div class="lib-loading">Đang tải thư viện...</div>';

  const { data: novels, error } = await sb
    .from('novels')
    .select('id,title,cover_image_url,total_lines,total_chapters,updated_at')
    .order('updated_at', { ascending: false });

  if (error) {
    libContent.innerHTML = '<div class="lib-empty"><div class="big">⚠</div><p>Lỗi tải thư viện: '+esc(error.message)+'</p></div>';
    return;
  }
  if (!novels.length) {
    libContent.innerHTML = '<div class="lib-empty"><div class="big">📭</div><p>Chưa có truyện nào.<br>Bấm "➕ Dịch truyện mới" để bắt đầu.</p></div>';
    return;
  }

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
      <div class="lib-cover">${coverHtml(n.cover_image_url, '📖')}</div>
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
    card.querySelector('.lc-info').addEventListener('click', e => { e.stopPropagation(); openEditInfoModal(n, 'personal'); });
    card.querySelector('.lc-del').addEventListener('click', e => { e.stopPropagation(); deleteNovel(n.id, n.title); });
    card.addEventListener('click', () => openNovel(n.id, 'read'));
    grid.appendChild(card);
  });
  libContent.innerHTML = '';
  libContent.appendChild(grid);
}

async function deleteNovel(id, title){
  if (!confirm(`Xoá truyện "${title}"? Không thể hoàn tác.`)) return;
  const { error } = await sb.from('novels').delete().eq('id', id);
  if (error) { alert('Lỗi xoá: ' + error.message); return; }
  loadLibrary();
}

/* ----- New novel modal ----- */
const nnOverlay = document.getElementById('nnOverlay');
const nnCover = wireCoverBox('nnCoverBox', 'nnCoverInput');
document.getElementById('newNovelBtn').addEventListener('click', () => {
  document.getElementById('nnTitle').value = '';
  nnCover.reset();
  nnOverlay.classList.add('open');
  document.getElementById('nnTitle').focus();
});
document.getElementById('nnCancel').addEventListener('click', () => nnOverlay.classList.remove('open'));
nnOverlay.addEventListener('click', e => { if (e.target === nnOverlay) nnOverlay.classList.remove('open'); });

document.getElementById('nnCreate').addEventListener('click', async () => {
  const title = document.getElementById('nnTitle').value.trim();
  if (!title) { alert('Nhập tên truyện trước.'); return; }
  const btn = document.getElementById('nnCreate');
  btn.disabled = true; btn.textContent = 'Đang tạo...';
  const coverUrl = await nnCover.resolveUrl();
  const { data, error } = await sb.from('novels').insert({
    user_id: currentUser.id,
    title,
    cover_image_url: coverUrl,
    content: '',
    total_lines: 0,
    total_chapters: 0
  }).select().single();
  btn.disabled = false; btn.textContent = 'Tạo & bắt đầu dịch';
  if (error) { alert('Lỗi tạo truyện: ' + error.message); return; }
  nnOverlay.classList.remove('open');
  openNovel(data.id, 'translate');
});

/* ============================================
   MỞ TRUYỆN CÁ NHÂN VÀO APP DỊCH/ĐỌC
============================================ */
async function openNovel(novelId, mode){
  const { data: novel, error } = await sb.from('novels').select('*').eq('id', novelId).single();
  if (error) { alert('Lỗi mở truyện: ' + error.message); return; }
  currentNovel = novel;
  viewingCommunityNovel = null;

  document.getElementById('libraryScreen').classList.remove('active');
  document.getElementById('novelDetailScreen').classList.remove('active');
  document.querySelector('header').classList.add('show');
  document.querySelector('.app-body').classList.add('show');
  document.querySelector('.app-title').textContent = '📖 ' + novel.title;

  await loadUserSettings();

  if (novel.content) {
    transLines = novel.content.split('\n');
    srcLines = transLines.slice();
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
  if (viewingCommunityNovel) await saveCommunityHistory(true);
  document.querySelector('header').classList.remove('show');
  document.querySelector('.app-body').classList.remove('show');
  document.getElementById('libraryScreen').classList.add('active');
  currentNovel = null;
  const activeTab = allBodies.find(([tab]) => tab.classList.contains('active'));
  if (activeTab && activeTab[3]) activeTab[3]();
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

/* ===== READING PROGRESS (thư viện cá nhân) ===== */
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
  await sb.from('reading_progress').upsert({
    user_id: currentUser.id,
    novel_id: currentNovel.id,
    chapter_index: rCurCh || 0,
    scroll_percent: pct,
    updated_at: new Date().toISOString()
  }, { onConflict: 'user_id,novel_id' });
}
function scheduleSaveProgress(){
  if (!currentNovel && !viewingCommunityNovel) return;
  clearTimeout(progressTimer);
  progressTimer = setTimeout(() => {
    if (currentNovel) saveCurrentProgress(false);
    if (viewingCommunityNovel) saveCommunityHistory(false);
  }, 2000);
}
document.addEventListener('scroll', e => {
  if (e.target && e.target.id === 'rScroll') scheduleSaveProgress();
}, true);
window.addEventListener('beforeunload', () => {
  if (currentNovel) saveCurrentProgress(true);
  if (viewingCommunityNovel) saveCommunityHistory(true);
});

/* ===== USER SETTINGS ===== */
async function loadUserSettings(){
  const { data } = await sb.from('user_settings').select('*').eq('user_id', currentUser.id).maybeSingle();
  if (!data) { await sb.from('user_settings').insert({ user_id: currentUser.id }); return; }
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
      user_id: currentUser.id, theme: document.body.className, updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });
  }, 1000);
}
document.querySelectorAll('.theme-btn').forEach(b => b.addEventListener('click', scheduleSaveSettings));

/* ============================================
   SỬA THÔNG TIN TRUYỆN (cá nhân + cộng đồng)
============================================ */
const editInfoOverlay = document.getElementById('editInfoOverlay');
const eiTitle = document.getElementById('eiTitle');
const eiAuthor = document.getElementById('eiAuthor'), eiAuthorLabel = document.getElementById('eiAuthorLabel');
const eiDesc = document.getElementById('eiDesc'), eiDescLabel = document.getElementById('eiDescLabel');
const eiGenre = document.getElementById('eiGenre'), eiGenreLabel = document.getElementById('eiGenreLabel');
const eiNsfwBlock = document.getElementById('eiNsfwBlock');
const eiIsNsfw = document.getElementById('eiIsNsfw');
const eiPassRow = document.getElementById('eiPassRow');
const eiPassword = document.getElementById('eiPassword');
const eiMsg = document.getElementById('eiMsg');
const eiCover = wireCoverBox('eiCoverBox', 'eiCoverInput');
let editInfoTarget = null;

function openEditInfoModal(novel, type){
  type = type || 'personal';
  editInfoTarget = { type, novel };
  eiMsg.textContent = '';
  eiTitle.value = novel.title || '';
  eiCover.reset();
  eiCover.setExisting(novel.cover_image_url || null);

  if (type === 'personal') {
    eiAuthorLabel.style.display = 'none'; eiAuthor.style.display = 'none';
    eiDescLabel.style.display = 'none'; eiDesc.style.display = 'none';
    eiGenreLabel.style.display = 'none'; eiGenre.style.display = 'none';
    eiNsfwBlock.style.display = 'none';
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
  const coverUrl = await eiCover.resolveUrl();

  let error;
  if (editInfoTarget.type === 'personal') {
    ({ error } = await sb.from('novels').update({
      title, cover_image_url: coverUrl, updated_at: new Date().toISOString()
    }).eq('id', editInfoTarget.novel.id));
  } else {
    ({ error } = await sb.from('community_novels').update({
      title,
      author_name: eiAuthor.value.trim() || 'Ẩn danh',
      description: eiDesc.value.trim(),
      genre: eiGenre.value,
      cover_image_url: coverUrl,
      is_nsfw: eiIsNsfw.checked,
      nsfw_password: eiIsNsfw.checked ? (eiPassword.value.trim() || null) : null,
      updated_at: new Date().toISOString()
    }).eq('id', editInfoTarget.novel.id));
  }

  btn.disabled = false; btn.textContent = '💾 Lưu thay đổi';
  if (error) { eiMsg.style.color='var(--red)'; eiMsg.textContent = 'Lỗi: ' + error.message; return; }

  editInfoOverlay.classList.remove('open');
  if (currentNovel && editInfoTarget.novel.id === currentNovel.id) {
    currentNovel.title = title;
    document.querySelector('.app-title').textContent = '📖 ' + title;
  }
  if (editInfoTarget.type === 'personal') loadLibrary();
  else { loadCommunity(); if (currentDetailNovel && currentDetailNovel.id === editInfoTarget.novel.id) openNovelDetail(editInfoTarget.novel.id); }
  editInfoTarget = null;
});

/* ============================================
   CỘNG ĐỒNG — thể loại, đăng truyện
============================================ */
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
function genreLabel(id){ const g = GENRES.find(x=>x.id===id); return g ? g.label : '📚 Khác'; }

let commSection = 'normal';
let commGenreFilter = null;

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

async function getRatingSummaries(novelIds){
  if (!novelIds.length) return {};
  const { data } = await sb.from('ratings').select('novel_id,stars').in('novel_id', novelIds);
  const map = {};
  (data||[]).forEach(r => {
    if (!map[r.novel_id]) map[r.novel_id] = { sum:0, count:0 };
    map[r.novel_id].sum += r.stars; map[r.novel_id].count++;
  });
  Object.keys(map).forEach(k => map[k].avg = (map[k].sum / map[k].count).toFixed(1));
  return map;
}

async function loadCommunity(){
  const el = document.getElementById('commContent');
  el.innerHTML = '<div class="lib-loading">Đang tải...</div>';

  let query = sb.from('community_novels')
    .select('id,user_id,title,author_name,description,genre,cover_image_url,total_lines,total_chapters,is_nsfw,nsfw_password,views,created_at')
    .eq('is_nsfw', commSection === 'nsfw')
    .order('created_at', { ascending: false });
  if (commGenreFilter) query = query.eq('genre', commGenreFilter);

  const { data: novels, error } = await query;
  if (error) { el.innerHTML = '<div class="lib-empty"><div class="big">⚠</div><p>Lỗi tải: '+esc(error.message)+'</p></div>'; return; }
  if (!novels.length) {
    el.innerHTML = `<div class="lib-empty"><div class="big">${commSection==='nsfw'?'🔞':'📭'}</div><p>Chưa có truyện nào ở mục này.</p></div>`;
    return;
  }

  const ratingMap = await getRatingSummaries(novels.map(n=>n.id));
  el.innerHTML = '';
  el.appendChild(renderNovelGrid(novels, ratingMap, true));
}

function renderNovelGrid(novels, ratingMap, showOwnerActions){
  const grid = document.createElement('div');
  grid.className = 'lib-grid';
  novels.forEach(n => {
    const isOwner = showOwnerActions && currentUser && n.user_id === currentUser.id;
    const rating = ratingMap[n.id];
    const card = document.createElement('div');
    card.className = 'lib-card';
    card.innerHTML = `
      <div class="lib-cover">
        ${coverHtml(n.cover_image_url, '📖')}
        <span class="cover-ribbon ${n.is_nsfw?'cover-nsfw-ribbon':''}">${genreLabel(n.genre).replace(/^\S+\s/,'')}</span>
      </div>
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
          ${rating ? `<span class="comm-rating-mini">★ ${rating.avg}</span>` : ''}
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
    card.addEventListener('click', () => tryOpenNovelDetail(n));
    grid.appendChild(card);
  });
  return grid;
}

async function deleteCommunityNovel(id, title){
  if (!confirm(`Xoá truyện "${title}" khỏi Cộng đồng? Không thể hoàn tác.`)) return;
  const { error } = await sb.from('community_novels').delete().eq('id', id);
  if (error) { alert('Lỗi xoá: ' + error.message); return; }
  loadCommunity();
}

/* ----- Publish modal ----- */
const pubOverlay = document.getElementById('pubOverlay');
const pubGenreSel = document.getElementById('pubGenre');
const pubIsNsfw = document.getElementById('pubIsNsfw');
const pubPassRow = document.getElementById('pubPassRow');
const pubCover = wireCoverBox('pubCoverBox', 'pubCoverInput');

GENRES.forEach(g => {
  const o = document.createElement('option'); o.value = g.id; o.textContent = g.label;
  pubGenreSel.appendChild(o);
});
pubIsNsfw.addEventListener('change', () => { pubPassRow.style.display = pubIsNsfw.checked ? '' : 'none'; });

document.getElementById('publishBtn').addEventListener('click', () => {
  if (!currentNovel || !transLines.length) { alert('Chưa có nội dung để đăng.'); return; }
  document.getElementById('pubAuthor').value = '';
  document.getElementById('pubDesc').value = '';
  document.getElementById('pubPassword').value = '';
  pubIsNsfw.checked = false;
  pubPassRow.style.display = 'none';
  pubCover.reset();
  pubCover.setExisting(currentNovel.cover_image_url || null);
  pubOverlay.classList.add('open');
});
document.getElementById('pubCancel').addEventListener('click', () => pubOverlay.classList.remove('open'));
pubOverlay.addEventListener('click', e => { if (e.target===pubOverlay) pubOverlay.classList.remove('open'); });

document.getElementById('pubConfirm').addEventListener('click', async () => {
  if (!currentNovel) return;
  const content = transLines.join('\n');
  const isNsfw = pubIsNsfw.checked;
  const btn = document.getElementById('pubConfirm');
  btn.disabled = true; btn.textContent = 'Đang đăng...';
  const coverUrl = await pubCover.resolveUrl();

  const payload = {
    user_id: currentUser.id,
    author_name: document.getElementById('pubAuthor').value.trim() || 'Ẩn danh',
    title: currentNovel.title,
    description: document.getElementById('pubDesc').value.trim(),
    genre: pubGenreSel.value,
    cover_image_url: coverUrl,
    content,
    total_lines: content.split('\n').length,
    total_chapters: (typeof rChapters !== 'undefined' && rChapters.length) ? rChapters.length : (currentNovel.total_chapters||0),
    is_nsfw: isNsfw,
    nsfw_password: isNsfw ? (document.getElementById('pubPassword').value.trim() || null) : null,
  };
  const { error } = await sb.from('community_novels').insert(payload);
  btn.disabled = false; btn.textContent = '✅ Đăng truyện';
  if (error) { alert('Lỗi đăng truyện: ' + error.message); return; }
  pubOverlay.classList.remove('open');
  alert('Đã đăng truyện lên Cộng đồng! Vào tab 🌐 Cộng đồng để xem.');
});

/* ============================================
   NSFW PASSWORD GATE
============================================ */
const nsfwGateOverlay = document.getElementById('nsfwGateOverlay');
const nsfwGatePass = document.getElementById('nsfwGatePass');
const nsfwGateMsg = document.getElementById('nsfwGateMsg');
let pendingNsfwNovel = null;

function tryOpenNovelDetail(novel){
  if (novel.is_nsfw && novel.nsfw_password) {
    pendingNsfwNovel = novel;
    nsfwGatePass.value = ''; nsfwGateMsg.textContent = '';
    nsfwGateOverlay.classList.add('open');
    setTimeout(()=>nsfwGatePass.focus(), 60);
    return;
  }
  openNovelDetail(novel.id);
}
document.getElementById('nsfwGateCancel').addEventListener('click', () => {
  nsfwGateOverlay.classList.remove('open'); pendingNsfwNovel = null;
});
nsfwGateOverlay.addEventListener('click', e => { if (e.target===nsfwGateOverlay){ nsfwGateOverlay.classList.remove('open'); pendingNsfwNovel=null; } });
document.getElementById('nsfwGateConfirm').addEventListener('click', () => {
  if (!pendingNsfwNovel) return;
  if (nsfwGatePass.value === pendingNsfwNovel.nsfw_password) {
    nsfwGateOverlay.classList.remove('open');
    openNovelDetail(pendingNsfwNovel.id);
    pendingNsfwNovel = null;
  } else {
    nsfwGateMsg.textContent = 'Sai mật khẩu.';
  }
});
nsfwGatePass.addEventListener('keydown', e => { if (e.key==='Enter') document.getElementById('nsfwGateConfirm').click(); });

/* ============================================
   TRANG CHI TIẾT TRUYỆN (kiểu web đọc truyện)
============================================ */
const novelDetailScreen = document.getElementById('novelDetailScreen');
let currentDetailNovel = null;
let currentDetailChapters = null;

async function openNovelDetail(novelId){
  const { data: novel, error } = await sb.from('community_novels').select('*').eq('id', novelId).single();
  if (error || !novel) { alert('Không tải được truyện.'); return; }
  currentDetailNovel = novel;

  document.getElementById('libraryScreen').classList.remove('active');
  novelDetailScreen.classList.add('active');
  novelDetailScreen.scrollTop = 0;

  document.getElementById('ndCover').innerHTML = coverHtml(novel.cover_image_url, '📖');
  document.getElementById('ndTitle').textContent = novel.title;
  document.getElementById('ndAuthor').textContent = novel.author_name || 'Ẩn danh';
  document.getElementById('ndGenreBadge').textContent = genreLabel(novel.genre);
  document.getElementById('ndNsfwBadge').style.display = novel.is_nsfw ? '' : 'none';
  document.getElementById('ndViews').textContent = novel.views || 0;
  document.getElementById('ndChapCount').textContent = novel.total_chapters || 0;
  document.getElementById('ndDesc').textContent = novel.description || 'Chưa có mô tả.';

  currentDetailChapters = parseChaptersForDetail(novel.content || '');
  renderDetailChapterGrid();

  await renderRatingSummary(novel.id);
  await renderUserRatingStars(novel.id);
  await renderFavoriteButton(novel.id);
  await loadComments(novel.id);

  sb.rpc('increment_novel_views', { novel_id: novel.id }).then(()=>{});
}

function parseChaptersForDetail(content){
  const lines = content.split('\n');
  const CH_RE_LOCAL = (typeof CH_RE !== 'undefined') ? CH_RE :
    /^(第[零一二三四五六七八九十百千万億\d]+[章节回卷集篇部]|Chapter\s*\d+|Chương\s*\d+|CHƯƠNG\s*\d+)/i;
  const chs = [];
  for (let i=0;i<lines.length;i++){
    const l = lines[i].trim();
    if (l && CH_RE_LOCAL.test(l)) chs.push({ idx: i, title: l });
  }
  if (!chs.length) chs.push({ idx:0, title: 'Toàn bộ truyện' });
  return chs;
}

function renderDetailChapterGrid(){
  const grid = document.getElementById('ndChapterGrid');
  grid.innerHTML = '';
  currentDetailChapters.forEach((ch, i) => {
    const item = document.createElement('div');
    item.className = 'nd-chapter-item';
    item.textContent = `${i+1}. ${ch.title}`;
    item.addEventListener('click', () => openCommunityReaderAt(i));
    grid.appendChild(item);
  });
}

document.getElementById('ndReadBtn').addEventListener('click', () => openCommunityReaderAt(0));
document.getElementById('ndBack').addEventListener('click', () => {
  novelDetailScreen.classList.remove('active');
  document.getElementById('libraryScreen').classList.add('active');
});

async function openCommunityReaderAt(chapterIdx){
  if (!currentDetailNovel) return;
  let startChapter = chapterIdx;
  if (chapterIdx === 0) {
    const { data: hist } = await sb.from('reading_history')
      .select('last_chapter_index').eq('novel_id', currentDetailNovel.id).eq('user_id', currentUser.id).maybeSingle();
    if (hist) startChapter = hist.last_chapter_index || 0;
  }

  viewingCommunityNovel = currentDetailNovel;
  currentNovel = null;
  document.getElementById('publishBtn').disabled = true;

  novelDetailScreen.classList.remove('active');
  document.querySelector('header').classList.add('show');
  document.querySelector('.app-body').classList.add('show');
  document.querySelector('.app-title').textContent = '🌐 ' + currentDetailNovel.title;

  gotoReader(currentDetailNovel.content);
  if (typeof rChapters !== 'undefined' && rChapters.length && startChapter < rChapters.length) {
    renderChapter(startChapter);
  }
  saveCommunityHistory(true);
}

async function saveCommunityHistory(immediate){
  if (!viewingCommunityNovel || typeof rCurCh === 'undefined') return;
  await sb.from('reading_history').upsert({
    user_id: currentUser.id,
    novel_id: viewingCommunityNovel.id,
    last_chapter_index: rCurCh || 0,
    viewed_at: new Date().toISOString()
  }, { onConflict: 'novel_id,user_id' });
}

/* ----- Rating (1-5 sao) ----- */
function starsHtml(avg){
  let html = '';
  for (let i=1;i<=5;i++) html += `<span class="${i<=Math.round(avg)?'':'star-empty'}">★</span>`;
  return html;
}
async function renderRatingSummary(novelId){
  const { data } = await sb.rpc('get_novel_rating_summary', { p_novel_id: novelId });
  const row = (data && data[0]) || { avg_stars: 0, total_ratings: 0 };
  document.getElementById('ndStarsDisplay').innerHTML = starsHtml(row.avg_stars);
  document.getElementById('ndRatingLbl').textContent = row.total_ratings > 0
    ? `${row.avg_stars} sao (${row.total_ratings} đánh giá)` : 'Chưa có đánh giá';
}
async function renderUserRatingStars(novelId){
  const { data: mine } = await sb.from('ratings').select('stars').eq('novel_id', novelId).eq('user_id', currentUser.id).maybeSingle();
  const myStars = mine ? mine.stars : 0;
  const wrap = document.getElementById('ndRateStars');
  wrap.innerHTML = '';
  for (let i=1;i<=5;i++){
    const s = document.createElement('span');
    s.className = 'nd-rate-star' + (i<=myStars?' filled':'');
    s.textContent = '★';
    s.dataset.val = i;
    s.addEventListener('mouseenter', () => {
      wrap.querySelectorAll('.nd-rate-star').forEach((el,idx)=>el.classList.toggle('hovered', idx<i));
    });
    s.addEventListener('mouseleave', () => {
      wrap.querySelectorAll('.nd-rate-star').forEach(el=>el.classList.remove('hovered'));
    });
    s.addEventListener('click', async () => {
      await sb.from('ratings').upsert({ novel_id: novelId, user_id: currentUser.id, stars: i }, { onConflict: 'novel_id,user_id' });
      await renderRatingSummary(novelId);
      await renderUserRatingStars(novelId);
    });
    wrap.appendChild(s);
  }
}

/* ----- Favorites ----- */
async function renderFavoriteButton(novelId){
  const btn = document.getElementById('ndFavBtn');
  const { data: fav } = await sb.from('favorites').select('id').eq('novel_id', novelId).eq('user_id', currentUser.id).maybeSingle();
  btn.classList.toggle('faved', !!fav);
  btn.textContent = fav ? '★ Đã yêu thích' : '☆ Thêm vào yêu thích';
  btn.onclick = async () => {
    if (fav) {
      await sb.from('favorites').delete().eq('novel_id', novelId).eq('user_id', currentUser.id);
    } else {
      await sb.from('favorites').insert({ novel_id: novelId, user_id: currentUser.id });
    }
    renderFavoriteButton(novelId);
  };
}

async function loadFavorites(){
  const el = document.getElementById('favContent');
  el.innerHTML = '<div class="lib-loading">Đang tải...</div>';
  const { data: favs, error } = await sb.from('favorites')
    .select('novel_id, community_novels(id,user_id,title,author_name,genre,cover_image_url,total_lines,total_chapters,is_nsfw,nsfw_password,views,created_at)')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false });
  if (error) { el.innerHTML = '<div class="lib-empty"><div class="big">⚠</div><p>Lỗi tải: '+esc(error.message)+'</p></div>'; return; }
  const novels = (favs||[]).map(f => f.community_novels).filter(Boolean);
  if (!novels.length) { el.innerHTML = '<div class="lib-empty"><div class="big">⭐</div><p>Chưa có truyện yêu thích nào.<br>Vào Cộng đồng và bấm ☆ ở trang truyện để lưu.</p></div>'; return; }
  const ratingMap = await getRatingSummaries(novels.map(n=>n.id));
  el.innerHTML = '';
  el.appendChild(renderNovelGrid(novels, ratingMap, false));
}

/* ----- Reading history ----- */
async function loadHistory(){
  const el = document.getElementById('histContent');
  el.innerHTML = '<div class="lib-loading">Đang tải...</div>';
  const { data: hist, error } = await sb.from('reading_history')
    .select('last_chapter_index, viewed_at, community_novels(id,user_id,title,author_name,genre,cover_image_url,total_lines,total_chapters,is_nsfw,nsfw_password,views,created_at)')
    .eq('user_id', currentUser.id)
    .order('viewed_at', { ascending: false })
    .limit(40);
  if (error) { el.innerHTML = '<div class="lib-empty"><div class="big">⚠</div><p>Lỗi tải: '+esc(error.message)+'</p></div>'; return; }
  const rows = (hist||[]).filter(h => h.community_novels);
  if (!rows.length) { el.innerHTML = '<div class="lib-empty"><div class="big">🕐</div><p>Chưa có lịch sử đọc nào.</p></div>'; return; }

  const grid = document.createElement('div');
  grid.className = 'lib-grid';
  rows.forEach(h => {
    const n = h.community_novels;
    const card = document.createElement('div');
    card.className = 'lib-card';
    card.innerHTML = `
      <div class="lib-cover">${coverHtml(n.cover_image_url, '📖')}</div>
      <div class="lib-info">
        <div class="lib-title">${esc(n.title)}</div>
        <div class="lib-meta">Chương ${(h.last_chapter_index||0)+1} / ${n.total_chapters||0}</div>
        <div class="history-item-row">🕐 ${timeAgo(h.viewed_at)}</div>
      </div>`;
    card.addEventListener('click', () => tryOpenNovelDetail(n));
    grid.appendChild(card);
  });
  el.innerHTML = '';
  el.appendChild(grid);
}

/* ----- Comments ----- */
async function loadComments(novelId){
  const list = document.getElementById('ndCommentList');
  const countEl = document.getElementById('ndCommentCount');
  list.innerHTML = '<div class="lib-loading">Đang tải bình luận...</div>';

  const avatar = document.getElementById('ndCommentAvatar');
  avatar.textContent = (currentUser.email||'?').charAt(0).toUpperCase();

  const { data: comments, error } = await sb.from('comments')
    .select('id,user_id,author_name,content,created_at')
    .eq('novel_id', novelId)
    .order('created_at', { ascending: false });

  if (error) { list.innerHTML = '<p class="nd-comment-empty">Lỗi tải bình luận.</p>'; return; }
  countEl.textContent = comments.length;
  if (!comments.length) { list.innerHTML = '<p class="nd-comment-empty">Chưa có bình luận nào. Hãy là người đầu tiên!</p>'; return; }

  list.innerHTML = '';
  comments.forEach(c => {
    const item = document.createElement('div');
    item.className = 'nd-comment-item';
    const isMine = c.user_id === currentUser.id;
    item.innerHTML = `
      <div class="nd-comment-avatar">${esc((c.author_name||'?').charAt(0).toUpperCase())}</div>
      <div class="nd-comment-body">
        <div class="nd-comment-head">
          <span class="nd-comment-author">${esc(c.author_name||'Ẩn danh')}</span>
          <span class="nd-comment-time">${timeAgo(c.created_at)}</span>
        </div>
        <div class="nd-comment-text">${esc(c.content)}</div>
        ${isMine ? '<button class="nd-comment-del">🗑 Xoá</button>' : ''}
      </div>`;
    if (isMine) item.querySelector('.nd-comment-del').addEventListener('click', async () => {
      if (!confirm('Xoá bình luận này?')) return;
      await sb.from('comments').delete().eq('id', c.id);
      loadComments(novelId);
    });
    list.appendChild(item);
  });
}

document.getElementById('ndCommentSubmit').addEventListener('click', async () => {
  if (!currentDetailNovel) return;
  const input = document.getElementById('ndCommentInput');
  const content = input.value.trim();
  if (!content) return;
  const btn = document.getElementById('ndCommentSubmit');
  btn.disabled = true;
  const authorName = (currentUser.email||'Ẩn danh').split('@')[0];
  const { error } = await sb.from('comments').insert({
    novel_id: currentDetailNovel.id, user_id: currentUser.id, author_name: authorName, content
  });
  btn.disabled = false;
  if (error) { alert('Lỗi gửi bình luận: ' + error.message); return; }
  input.value = '';
  loadComments(currentDetailNovel.id);
});

})();
