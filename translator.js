/* STV translator/reader engine */


/* THEMES */
document.querySelectorAll('.theme-btn').forEach(b=>{
  b.addEventListener('click',()=>{
    document.body.className=b.dataset.t;
    document.querySelectorAll('.theme-btn').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
  });
});

/* MODE SWITCH */
const tPane=document.getElementById('translatePane');
const rPane=document.getElementById('readerPane');
function gotoReader(text){
  tPane.style.display='none'; rPane.classList.add('active');
  document.getElementById('mTranslate').classList.remove('active');
  document.getElementById('mRead').classList.add('active');
  if(text) loadReaderText(text);
}
function gotoTranslate(){
  tPane.style.display=''; rPane.classList.remove('active');
  document.getElementById('mRead').classList.remove('active');
  document.getElementById('mTranslate').classList.add('active');
}
document.getElementById('mTranslate').addEventListener('click',gotoTranslate);
document.getElementById('mRead').addEventListener('click',()=>gotoReader(null));

/* TRANSLATE FONT */
let tFsz=15;
const resultArea=document.getElementById('resultArea');
const sourceArea=document.getElementById('sourceArea');
function applyTFont(){
  const ff=document.getElementById('tFont').value;
  document.getElementById('tFontSz').textContent=tFsz+'px';
  [resultArea,sourceArea].forEach(ta=>{ta.style.fontFamily=ff;ta.style.fontSize=tFsz+'px';});
}
document.getElementById('tFont').addEventListener('change',applyTFont);
document.getElementById('tFontP').addEventListener('click',()=>{if(tFsz<32){tFsz++;applyTFont();}});
document.getElementById('tFontM').addEventListener('click',()=>{if(tFsz>10){tFsz--;applyTFont();}});

/* TABS */
document.querySelectorAll('.tab').forEach(tab=>{
  tab.addEventListener('click',()=>{
    document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('panel-'+tab.dataset.tab).classList.add('active');
  });
});

/* TRANSLATE LOGIC */
let srcLines=[],transLines=[],running=false,stopFlag=false;
const dz=document.getElementById('dropZone'),fi=document.getElementById('fileInput');
const fileInfo=document.getElementById('fileInfo'),fName=document.getElementById('fileName'),fMeta=document.getElementById('fileMeta');
const startBtn=document.getElementById('startBtn'),stopBtn=document.getElementById('stopBtn');
const prgWrap=document.getElementById('prgWrap'),prgFill=document.getElementById('prgFill'),prgTxt=document.getElementById('prgTxt');
const emptyR=document.getElementById('emptyR'),emptyS=document.getElementById('emptyS');
const resultWrap=document.getElementById('resultWrap'),sourceWrap=document.getElementById('sourceWrap');
const logBox=document.getElementById('logBox');
const stDot=document.getElementById('stDot'),stTxt=document.getElementById('stTxt');
const dlBtn=document.getElementById('dlBtn'),cpBtn=document.getElementById('cpBtn'),readBtn=document.getElementById('readBtn');
const editBtn=document.getElementById('editBtn'),editBanner=document.getElementById('editBanner');
const lineCnt=document.getElementById('lineCnt');

dz.addEventListener('click',()=>fi.click());
dz.addEventListener('dragover',e=>{e.preventDefault();dz.classList.add('over');});
dz.addEventListener('dragleave',()=>dz.classList.remove('over'));
dz.addEventListener('drop',e=>{e.preventDefault();dz.classList.remove('over');if(e.dataTransfer.files[0])loadFile(e.dataTransfer.files[0]);});
fi.addEventListener('change',()=>{if(fi.files[0])loadFile(fi.files[0]);});

function loadFile(file){
  if(!file.name.endsWith('.txt')){addLog('er','Chỉ hỗ trợ .txt');return;}
  const fr=new FileReader();
  fr.onload=e=>{
    const text=e.target.result;
    srcLines=text.split('\n');
    transLines=new Array(srcLines.length).fill('');
    fName.textContent=file.name;
    fMeta.textContent=`${srcLines.length} dòng · ${(file.size/1024).toFixed(1)} KB`;
    fileInfo.style.display='block';
    sourceArea.value=text;
    emptyS.style.display='none';sourceWrap.style.display='block';
    emptyR.style.display='flex';resultWrap.style.display='none';
    resultArea.value='';
    lineCnt.textContent=`${srcLines.length} dòng`;
    startBtn.disabled=false;dlBtn.disabled=true;cpBtn.disabled=true;readBtn.disabled=true;editBtn.disabled=true;
    if(document.getElementById('publishBtn'))document.getElementById('publishBtn').disabled=true;
    exitEditMode(true);
    setSt('idle','Sẵn sàng');
    addLog('inf',`Đã tải: ${file.name} — ${srcLines.length} dòng`);
    applyTFont();
  };
  fr.readAsText(file,'utf-8');
}

const SEP='=|==|=',CN=/[\u3400-\u9FBF]/;
async function transBatch(lines){
  const sv=document.getElementById('server').value;
  const res=await fetch('https://'+sv+'/',{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:'sajax=trans&content='+encodeURIComponent(lines.join(SEP))
  });
  if(!res.ok)throw new Error('HTTP '+res.status);
  return(await res.text()).split(SEP);
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function startTrans(){
  if(running)return;running=true;stopFlag=false;
  const bs=parseInt(document.getElementById('batchSize').value)||30;
  const dl=parseInt(document.getElementById('delay').value)||300;
  startBtn.disabled=true;stopBtn.disabled=false;
  dlBtn.disabled=true;cpBtn.disabled=true;readBtn.disabled=true;editBtn.disabled=true;exitEditMode(true);
  prgWrap.style.display='flex';
  emptyR.style.display='none';resultWrap.style.display='block';
  setSt('run','Đang dịch...');
  addLog('inf',`Bắt đầu dịch ${srcLines.length} dòng, batch=${bs}`);
  const todo=[];
  for(let i=0;i<srcLines.length;i++){
    if(CN.test(srcLines[i]))todo.push(i);
    else transLines[i]=srcLines[i];
  }
  let done=0;const total=todo.length;
  for(let b=0;b<todo.length;b+=bs){
    if(stopFlag){addLog('er','Đã dừng.');break;}
    const batch=todo.slice(b,b+bs),texts=batch.map(i=>srcLines[i]);
    try{
      const res=await transBatch(texts);
      for(let k=0;k<batch.length;k++)transLines[batch[k]]=res[k]!==undefined?res[k]:texts[k];
      done+=batch.length;
      const pct=total>0?Math.round(done/total*100):100;
      prgFill.style.width=pct+'%';prgTxt.textContent=`${done}/${total} dòng (${pct}%)`;
      resultArea.value=transLines.join('\n');
      addLog('ok',`Batch ${Math.ceil(b/bs)+1}: dòng ${batch[0]+1}–${batch[batch.length-1]+1}`);
    }catch(e){
      addLog('er',`Lỗi batch dòng ${batch[0]+1}: ${e.message}`);
      for(const i of batch)transLines[i]=srcLines[i];done+=batch.length;
    }
    if(b+bs<todo.length)await sleep(dl);
  }
  resultArea.value=transLines.join('\n');
  running=false;startBtn.disabled=false;stopBtn.disabled=true;
  dlBtn.disabled=false;cpBtn.disabled=false;readBtn.disabled=false;editBtn.disabled=false;
  if(!stopFlag){setSt('done','Hoàn tất');addLog('inf','✓ Dịch xong!');}
  else setSt('idle','Đã dừng');
}
startBtn.addEventListener('click',startTrans);
stopBtn.addEventListener('click',()=>{stopFlag=true;});

/* EDIT MODE */
function enterEditMode(){
  resultArea.value=transLines.join('\n');
  resultArea.removeAttribute('readonly');
  editBanner.classList.add('show');
  editBtn.textContent='💾 Lưu';
  resultArea.focus();
}
function exitEditMode(skipSync){
  if(!skipSync) transLines=resultArea.value.split('\n');
  resultArea.setAttribute('readonly','');
  editBanner.classList.remove('show');
  editBtn.textContent='✏ Sửa';
  resultArea.value=transLines.join('\n');
}
editBtn.addEventListener('click',()=>{
  if(resultArea.hasAttribute('readonly')){enterEditMode();}
  else{exitEditMode();addLog('ok','Đã lưu nội dung đã sửa.');}
});

dlBtn.addEventListener('click',()=>{
  if(!resultArea.hasAttribute('readonly')) exitEditMode();
  const base=(fName.textContent||'ban_dich').replace(/\.txt$/i,'');
  let name=prompt('Đặt tên file tải xuống:',base+'_dich.txt');
  if(name===null)return;
  name=name.trim();if(!name)name=base+'_dich.txt';
  if(!/\.txt$/i.test(name))name+='.txt';
  const b=new Blob([transLines.join('\n')],{type:'text/plain;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name;a.click();
  addLog('ok',`Đã tải file: ${name}`);
});
cpBtn.addEventListener('click',()=>{
  if(!resultArea.hasAttribute('readonly')) exitEditMode();
  navigator.clipboard.writeText(transLines.join('\n'))
    .then(()=>addLog('ok','Đã sao chép.'))
    .catch(()=>addLog('er','Lỗi sao chép.'));
});
readBtn.addEventListener('click',()=>{
  if(!resultArea.hasAttribute('readonly')) exitEditMode();
  gotoReader(transLines.join('\n'));
});

function setSt(t,m){
  stDot.className='dot'+(t==='run'?' run':t==='done'?' done':t==='err'?' err':'');
  stTxt.textContent=m;
}
function addLog(type,msg){
  const d=document.createElement('div');d.className=type;
  const n=new Date(),ts=`${n.getHours().toString().padStart(2,'0')}:${n.getMinutes().toString().padStart(2,'0')}:${n.getSeconds().toString().padStart(2,'0')}`;
  d.textContent=`[${ts}] ${msg}`;logBox.appendChild(d);logBox.scrollTop=logBox.scrollHeight;
}
addLog('inf','Công cụ sẵn sàng.');applyTFont();

/* ===== READER ===== */
let rLines=[],rChapters=[],rCurCh=0,rFsz=18,srchMatches=[],srchIdx=0,rFileName='';

const CH_RE=/^(第[零一二三四五六七八九十百千万億\d]+[章节回卷集篇部]|Chapter\s*\d+|Chương\s*\d+|CHƯƠNG\s*\d+|第\d+话|番外|序章|终章|后记|后記|尾声|后语|楔子|前言|自序|Lời\s*(?:mở\s*đầu|kết|tựa)|Phần\s*\d+|Hồi\s*\d+)/i;

function parseChapters(lines){
  const chs=[];
  for(let i=0;i<lines.length;i++){
    const l=lines[i];
    if(l&&CH_RE.test(l))chs.push({title:l,lineStart:i});
  }
  if(chs.length===0)chs.push({title:rFileName||'Toàn bộ văn bản',lineStart:0});
  for(let i=0;i<chs.length-1;i++)chs[i].lineEnd=chs[i+1].lineStart-1;
  chs[chs.length-1].lineEnd=lines.length-1;
  return chs;
}

function loadReaderText(text){
  rLines=text.split('\n').map(l=>l.trim());
  rChapters=parseChapters(rLines);
  rCurCh=0;
  buildChapterList();
  renderChapter(0);
  document.getElementById('rDrop').style.display='none';
  document.getElementById('rLayout').style.display='flex';
  document.getElementById('chCount').textContent=`${rChapters.length} chương`;
  document.getElementById('rStats').textContent=`${rLines.length} dòng · ${rChapters.length} chương`;
}

function buildChapterList(){
  const list=document.getElementById('chList');
  list.innerHTML='';
  rChapters.forEach((ch,i)=>{
    const d=document.createElement('div');d.className='ch-item';d.dataset.i=i;
    const num=document.createElement('span');num.className='ch-num';num.textContent='Chương '+(i+1);
    d.appendChild(num);
    d.appendChild(document.createTextNode(ch.title));
    d.addEventListener('click',()=>{renderChapter(i);});
    list.appendChild(d);
  });
}

function renderChapter(idx){
  if(idx<0||idx>=rChapters.length)return;
  if(typeof ttsRunning!=='undefined'&&ttsRunning)ttsEnd();
  rCurCh=idx;
  const ch=rChapters[idx];
  document.getElementById('rTitle').textContent=ch.title;
  const rc=document.getElementById('rContent');
  rc.innerHTML='';
  for(let li=ch.lineStart;li<=ch.lineEnd;li++){
    const line=rLines[li];
    const p=document.createElement('p');
    p.dataset.line=li;
    if(li===ch.lineStart&&CH_RE.test(line))p.classList.add('ch-heading');
    if(line){p.textContent=line;}
    rc.appendChild(p);
  }
  if(!rc.children.length){
    const p=document.createElement('p');p.style.color='var(--muted)';p.style.fontStyle='italic';p.textContent='Chương này trống.';rc.appendChild(p);
  }
  document.getElementById('rScroll').scrollTop=0;
  applyRStyle();
  document.querySelectorAll('.ch-item').forEach(el=>el.classList.toggle('active',+el.dataset.i===idx));
  const active=document.querySelector('.ch-item.active');
  if(active)active.scrollIntoView({block:'nearest'});
  document.getElementById('prevCh').disabled=idx===0;
  document.getElementById('nextCh').disabled=idx===rChapters.length-1;
  updatePct();
  clearSearch();
}

function applyRStyle(){
  const rc=document.getElementById('rContent');
  const ff=document.getElementById('rFont').value;
  const lh=document.getElementById('rLH').value;
  const mw=document.getElementById('rWidth').value;
  rc.style.fontFamily=ff;rc.style.lineHeight=lh;
  rc.style.maxWidth=mw;rc.style.fontSize=rFsz+'px';
  document.getElementById('rFontSz').textContent=rFsz+'px';
}
document.getElementById('rFont').addEventListener('change',applyRStyle);
document.getElementById('rLH').addEventListener('change',applyRStyle);
document.getElementById('rWidth').addEventListener('change',applyRStyle);
document.getElementById('rFontP').addEventListener('click',()=>{if(rFsz<36){rFsz++;applyRStyle();}});
document.getElementById('rFontM').addEventListener('click',()=>{if(rFsz>11){rFsz--;applyRStyle();}});

document.getElementById('prevCh').addEventListener('click',()=>{if(rCurCh>0)renderChapter(rCurCh-1);});
document.getElementById('nextCh').addEventListener('click',()=>{if(rCurCh<rChapters.length-1)renderChapter(rCurCh+1);});

document.getElementById('toggleCh').addEventListener('click',()=>{
  document.getElementById('chPanel').classList.toggle('collapsed');
});

const rScroll=document.getElementById('rScroll');
rScroll.addEventListener('scroll',()=>updatePct());
function updatePct(){
  const el=rScroll;
  const pct=el.scrollHeight<=el.clientHeight?100:Math.round(el.scrollTop/(el.scrollHeight-el.clientHeight)*100);
  document.getElementById('rProgFill').style.width=pct+'%';
  document.getElementById('rPct').textContent=pct+'%';
}
document.getElementById('rProg').addEventListener('click',e=>{
  const r=e.currentTarget.getBoundingClientRect();
  const pct=(e.clientX-r.left)/r.width;
  const el=rScroll;el.scrollTop=pct*(el.scrollHeight-el.clientHeight);
});

document.getElementById('chSearch').addEventListener('input',function(){
  const q=this.value.toLowerCase();
  document.querySelectorAll('.ch-item').forEach(el=>{
    el.style.display=el.textContent.toLowerCase().includes(q)?'':'none';
  });
});

/* SEARCH */
function openSearch(){document.getElementById('srchBar').classList.add('open');document.getElementById('srchInput').focus();}
function closeSearch(){document.getElementById('srchBar').classList.remove('open');clearSearch();}
function clearSearch(){
  srchMatches=[];srchIdx=0;
  document.getElementById('srchCnt').textContent='—';
  document.querySelectorAll('#rContent mark').forEach(m=>{m.replaceWith(document.createTextNode(m.textContent));});
  document.getElementById('rContent').normalize();
}
function doSearch(q){
  clearSearch();if(!q)return;
  const rc=document.getElementById('rContent');
  const walker=document.createTreeWalker(rc,NodeFilter.SHOW_TEXT);
  const ql=q.toLowerCase();
  const nodes=[];let n;
  while(n=walker.nextNode())if(n.textContent.toLowerCase().includes(ql))nodes.push(n);
  nodes.forEach(node=>{
    const txt=node.textContent,parent=node.parentNode;
    const frag=document.createDocumentFragment();
    let last=0,il=txt.toLowerCase(),pos;
    while((pos=il.indexOf(ql,last))!==-1){
      if(pos>last)frag.appendChild(document.createTextNode(txt.slice(last,pos)));
      const mark=document.createElement('mark');mark.textContent=txt.slice(pos,pos+q.length);
      frag.appendChild(mark);srchMatches.push(mark);last=pos+q.length;
    }
    if(last<txt.length)frag.appendChild(document.createTextNode(txt.slice(last)));
    parent.replaceChild(frag,node);
  });
  document.getElementById('srchCnt').textContent=srchMatches.length?`${srchMatches.length} kết quả`:'Không tìm thấy';
  if(srchMatches.length){srchIdx=0;highlightCurrent();}
}
function highlightCurrent(){
  srchMatches.forEach((m,i)=>m.className=i===srchIdx?'current':'');
  if(srchMatches[srchIdx])srchMatches[srchIdx].scrollIntoView({block:'center'});
  document.getElementById('srchCnt').textContent=`${srchIdx+1}/${srchMatches.length}`;
}
document.getElementById('rSearch').addEventListener('click',openSearch);
document.getElementById('srchClose').addEventListener('click',closeSearch);
let srchTimer;
document.getElementById('srchInput').addEventListener('input',function(){
  clearTimeout(srchTimer);srchTimer=setTimeout(()=>doSearch(this.value.trim()),300);
});
document.getElementById('srchInput').addEventListener('keydown',e=>{
  if(e.key==='Enter'){e.shiftKey?moveSrch(-1):moveSrch(1);}
  if(e.key==='Escape')closeSearch();
});
document.getElementById('srchNext').addEventListener('click',()=>moveSrch(1));
document.getElementById('srchPrev').addEventListener('click',()=>moveSrch(-1));
function moveSrch(d){
  if(!srchMatches.length)return;
  srchIdx=(srchIdx+d+srchMatches.length)%srchMatches.length;
  highlightCurrent();
}

/* READER FILE LOAD */
const rDZ=document.getElementById('rDropZone'),rFI=document.getElementById('rFileInput');
rDZ.addEventListener('click',()=>rFI.click());
rDZ.addEventListener('dragover',e=>{e.preventDefault();rDZ.classList.add('over');});
rDZ.addEventListener('dragleave',()=>rDZ.classList.remove('over'));
rDZ.addEventListener('drop',e=>{e.preventDefault();rDZ.classList.remove('over');if(e.dataTransfer.files[0])loadRFile(e.dataTransfer.files[0]);});
rFI.addEventListener('change',()=>{if(rFI.files[0])loadRFile(rFI.files[0]);});
const rFI2=document.getElementById('rFileInput2');
document.getElementById('rNewFile').addEventListener('click',()=>rFI2.click());
rFI2.addEventListener('change',()=>{if(rFI2.files[0])loadRFile(rFI2.files[0]);});

function loadRFile(file){
  if(!file.name.endsWith('.txt'))return;
  rFileName=file.name.replace(/\.txt$/i,'');
  const fr=new FileReader();
  fr.onload=e=>{loadReaderText(e.target.result);};
  fr.readAsText(file,'utf-8');
}


/* ===== TTS ===== */
const ttsBar=document.getElementById('ttsBar');
const ttsPlay=document.getElementById('ttsPlay');
const ttsStop=document.getElementById('ttsStop');
const ttsPrevBtn=document.getElementById('ttsPrev');
const ttsNextBtn=document.getElementById('ttsNext');
const ttsVoiceSel=document.getElementById('ttsVoice');
const ttsRateSlider=document.getElementById('ttsRate');
const ttsPitchSlider=document.getElementById('ttsPitch');
const ttsVolSlider=document.getElementById('ttsVol');
const ttsRateVal=document.getElementById('ttsRateVal');
const ttsPitchVal=document.getElementById('ttsPitchVal');
const ttsVolVal=document.getElementById('ttsVolVal');
const ttsStatus=document.getElementById('ttsStatus');
const ttsTimer=document.getElementById('ttsTimer');

let ttsUtterances=[],ttsCurIdx=0,ttsPaused=false,ttsRunning=false,ttsStartTime=0,ttsTimerInterval=null,ttsVoices=[];

function loadVoices(){
  ttsVoices=speechSynthesis.getVoices();
  ttsVoiceSel.innerHTML='';
  const vi=ttsVoices.filter(v=>v.lang.startsWith('vi'));
  const zh=ttsVoices.filter(v=>v.lang.startsWith('zh'));
  const others=ttsVoices.filter(v=>!v.lang.startsWith('vi')&&!v.lang.startsWith('zh'));
  const addGroup=(label,voices)=>{
    if(!voices.length)return;
    const og=document.createElement('optgroup');og.label=label;
    voices.forEach(v=>{const o=document.createElement('option');o.value=v.name;o.textContent=`${v.name} (${v.lang})`;og.appendChild(o);});
    ttsVoiceSel.appendChild(og);
  };
  addGroup('🇻🇳 Tiếng Việt',vi);
  addGroup('🇨🇳 Tiếng Trung',zh);
  addGroup('🌐 Khác',others);
  if(!ttsVoiceSel.options.length){const o=document.createElement('option');o.textContent='Giọng mặc định';ttsVoiceSel.appendChild(o);}
}
loadVoices();
if(speechSynthesis.onvoiceschanged!==undefined)speechSynthesis.onvoiceschanged=loadVoices;

function parseToSentences(chapterIdx){
  const ch=rChapters[chapterIdx];if(!ch)return[];
  const sentences=[];
  const ps=document.querySelectorAll('#rContent p');
  ps.forEach(pel=>{
    const txt=pel.textContent.trim();if(!txt)return;
    const parts=txt.split(/(?<=[.!?…。！？\n])\s+|(?<=[.!?…。！？])/g).filter(s=>s.trim().length>1);
    if(parts.length<=1)sentences.push({text:txt,el:pel});
    else parts.forEach(p=>sentences.push({text:p.trim(),el:pel}));
  });
  return sentences;
}

document.getElementById('ttsToggleBar').addEventListener('click',()=>{
  ttsBar.classList.toggle('hidden');
  if(!ttsBar.classList.contains('hidden'))loadVoices();
});

ttsRateSlider.addEventListener('input',function(){
  ttsRateVal.textContent=parseFloat(this.value).toFixed(1)+'×';
  if(ttsRunning&&!ttsPaused)queueFrom(ttsCurIdx);
});
ttsPitchSlider.addEventListener('input',function(){
  ttsPitchVal.textContent=parseFloat(this.value).toFixed(1);
  if(ttsRunning&&!ttsPaused)queueFrom(ttsCurIdx);
});
ttsVolSlider.addEventListener('input',function(){
  ttsVolVal.textContent=Math.round(this.value*100)+'%';
  if(ttsRunning&&!ttsPaused)queueFrom(ttsCurIdx);
});

function getSelectedVoice(){return ttsVoices.find(v=>v.name===ttsVoiceSel.value)||null;}
function ttsHighlight(el){
  document.querySelectorAll('#rContent .tts-reading').forEach(e=>e.classList.remove('tts-reading'));
  if(el){el.classList.add('tts-reading');el.scrollIntoView({block:'center',behavior:'smooth'});}
}

let ttsKeepAlive=null;

/* Build one utterance object for sentence index idx */
function buildUtterance(idx){
  const item=ttsUtterances[idx];
  const utt=new SpeechSynthesisUtterance(item.text);
  const voice=getSelectedVoice();if(voice)utt.voice=voice;
  utt.rate=parseFloat(ttsRateSlider.value);
  utt.pitch=parseFloat(ttsPitchSlider.value);
  utt.volume=parseFloat(ttsVolSlider.value);
  utt.onstart=()=>{
    ttsCurIdx=idx;
    ttsHighlight(item.el);
    ttsStatus.textContent=item.text.length>60?item.text.substring(0,60)+'…':item.text;
  };
  utt.onerror=()=>{};
  if(idx===ttsUtterances.length-1){
    utt.onend=()=>{
      if(!ttsRunning||ttsPaused)return;
      if(rCurCh<rChapters.length-1){
        renderChapter(rCurCh+1);
        ttsRunning=true; // renderChapter() calls ttsEnd(), revive it
        clearInterval(ttsTimerInterval);
        ttsStartTime=Date.now();
        ttsTimerInterval=setInterval(()=>{
          const s=Math.floor((Date.now()-ttsStartTime)/1000);
          ttsTimer.textContent=`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
        },1000);
        setTimeout(()=>{
          ttsUtterances=parseToSentences(rCurCh);
          if(ttsUtterances.length)queueFrom(0);else ttsEnd();
        },400);
      }else ttsEnd();
    };
  }
  return utt;
}

/* Cancel current queue and (re)queue all sentences from idx onward.
   Queuing everything at once (instead of speak-on-onend) removes the
   multi-second gap Edge/Chrome inserts between separate speak() calls. */
function queueFrom(idx){
  speechSynthesis.cancel();
  for(let i=idx;i<ttsUtterances.length;i++)speechSynthesis.speak(buildUtterance(i));
  ttsPaused=false;ttsPlay.textContent='⏸';
  startKeepAlive();
}

function startKeepAlive(){
  clearInterval(ttsKeepAlive);
  // Edge/Chrome stop speaking after ~15s on long queues unless nudged
  ttsKeepAlive=setInterval(()=>{
    if(speechSynthesis.speaking&&!speechSynthesis.paused){
      speechSynthesis.pause();speechSynthesis.resume();
    }
  },9000);
}

function ttsStart(fromIdx){
  ttsRunning=true;ttsPaused=false;
  ttsUtterances=parseToSentences(rCurCh);
  if(!ttsUtterances.length){ttsStatus.textContent='Không có nội dung';ttsRunning=false;return;}
  clearInterval(ttsTimerInterval);
  ttsStartTime=Date.now();
  ttsTimerInterval=setInterval(()=>{
    const s=Math.floor((Date.now()-ttsStartTime)/1000);
    ttsTimer.textContent=`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  },1000);
  queueFrom(fromIdx||0);
}
function ttsPause(){
  if(speechSynthesis.speaking&&!speechSynthesis.paused){
    speechSynthesis.pause();ttsPaused=true;ttsPlay.textContent='▶';ttsStatus.textContent='Tạm dừng';
    clearInterval(ttsKeepAlive);
  }
}
function ttsResume(){
  speechSynthesis.resume();ttsPaused=false;ttsPlay.textContent='⏸';startKeepAlive();
}
function ttsEnd(){
  speechSynthesis.cancel();ttsRunning=false;ttsPaused=false;
  ttsPlay.textContent='▶';ttsStatus.textContent='Hoàn tất';
  clearInterval(ttsTimerInterval);clearInterval(ttsKeepAlive);
  document.querySelectorAll('#rContent .tts-reading').forEach(e=>e.classList.remove('tts-reading'));
}
ttsPlay.addEventListener('click',()=>{
  if(!rChapters.length){ttsStatus.textContent='Chưa có nội dung';return;}
  if(!ttsRunning)ttsStart(0);
  else if(ttsPaused)ttsResume();
  else ttsPause();
});
ttsStop.addEventListener('click',ttsEnd);
ttsPrevBtn.addEventListener('click',()=>{
  if(!ttsRunning){ttsStart(0);return;}
  ttsRunning=true;queueFrom(Math.max(0,ttsCurIdx-1));
});
ttsNextBtn.addEventListener('click',()=>{
  if(!ttsRunning){ttsStart(0);return;}
  ttsRunning=true;queueFrom(Math.min(ttsUtterances.length-1,ttsCurIdx+1));
});

/* KEYBOARD SHORTCUTS */
document.addEventListener('keydown',e=>{
  if(!rPane.classList.contains('active'))return;
  const tag=document.activeElement.tagName;
  const inp=tag==='INPUT'||tag==='TEXTAREA';
  if((e.key==='f'||e.key==='F')&&!e.ctrlKey&&!e.metaKey&&!inp){e.preventDefault();openSearch();}
  if(!inp&&e.key==='ArrowLeft')renderChapter(rCurCh-1);
  if(!inp&&e.key==='ArrowRight')renderChapter(rCurCh+1);
  if(!inp&&(e.key==='t'||e.key==='T')&&!e.ctrlKey){
    ttsBar.classList.toggle('hidden');
    if(!ttsBar.classList.contains('hidden'))loadVoices();
  }
  if(!inp&&e.key===' '&&!ttsBar.classList.contains('hidden')){
    e.preventDefault();ttsPlay.click();
  }
});
