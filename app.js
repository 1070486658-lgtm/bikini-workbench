/* ============================================================
   我的工作台 - app.js
============================================================ */
const STORAGE_KEY = 'workbench_data_v2';
let DATA = {};

/* ---------- Data Layer ---------- */
/* 清理历史测试残留（仅限已知的占位数据，避免被某端缓存反复写回服务端） */
function stripTestResidue(){
  const pf=DATA&&DATA.fund&&DATA.fund.portfolio;
  if(Array.isArray(pf)){
    DATA.fund.portfolio=pf.filter(x=>!(x&&(x.id==='merge_test_a'||String(x.code)==='000001'||String(x.name||'').includes('验证基金'))));
  }
}
function getDefaultData(){
  return {
    settings:{ styleTags:['人像','胶片','街拍'] },
    todayTasks:{ lastDate:'', tasks:[] },
    photo:{ hot:[], samples:[], reviews:[], inspirations:[], lastHotDate:'', dailyHot:[], discover:{ items:[], lastFetchDate:'', trendWeek:'', trendReport:null } },
    fund:{ portfolio:[], guesses:[], trades:[], monthly:[] },
    learn:{ wishlist:[], skills:[] },
    incubator:{ ideas:[], projects:[], needs:[] }
  };
}
function loadData(){
  try{
    const raw=localStorage.getItem(STORAGE_KEY);
    if(raw){ DATA=JSON.parse(raw); const def=getDefaultData();
      for(const k in def){ if(DATA[k]===undefined) DATA[k]=def[k]; }
      if(!DATA.settings) DATA.settings=getDefaultData().settings;
      if(!DATA.settings.styleTags) DATA.settings.styleTags=['人像','胶片','街拍'];
      if(!DATA.photo.discover) DATA.photo.discover={ items:[], lastFetchDate:'', trendWeek:'', trendReport:null };
    } else { DATA=getDefaultData(); }
  }catch(e){ DATA=getDefaultData(); }
  stripTestResidue();
}
function saveData(){
  DATA._updatedAt=Date.now();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(DATA));
  _pending=true;
  schedulePushState();
}

/* ---------- 服务器同步（手机/电脑共用同一份数据） ---------- */
let _pushTimer=null, _pending=false;
function schedulePushState(){ clearTimeout(_pushTimer); _pushTimer=setTimeout(pushState,800); }
function flushPush(){ clearTimeout(_pushTimer); pushState(); }   // 切后台/刷新前立即推送
/* 给所有后端请求附加访问令牌头（云端部署时由设置页填入 ACCESS_TOKEN）；本地无令牌则不带，行为不变 */
function apiHeaders(extra){
  const h=Object.assign({'Content-Type':'application/json'}, extra||{});
  const t=DATA&&DATA.settings&&DATA.settings.accessToken;
  if(t) h['X-Access-Token']=t;
  return h;
}
let _tokenPrompted=false;
function promptTokenOnce(){
  if(_tokenPrompted) return; _tokenPrompted=true;
  const t=prompt('后端开启了访问令牌保护。请输入部署时设置的 ACCESS_TOKEN 才能同步/使用 AI：');
  if(t){ DATA.settings.accessToken=t.trim(); saveData(); syncFromServer(true); }
}
async function pushState(){
  try{
    const ts=DATA._updatedAt||Date.now();
    const r=await fetch('/api/state',{method:'POST',headers:apiHeaders(),
      body:JSON.stringify({updatedAt:ts,data:DATA})});
    const j=await r.json().catch(()=>({}));
    // 服务端有更新的版本（另一台设备刚写过）→ 拉下来合并
    if(j && j.stale){ await syncFromServer(true); }
  }catch(e){ /* 离线：本地缓存已在 saveData 写入 */ }
}
function mergeDefaults(){
  const def=getDefaultData();
  for(const k in def){ if(DATA[k]===undefined) DATA[k]=def[k]; }
  if(!DATA.settings) DATA.settings=getDefaultData().settings;
  if(!DATA.settings.styleTags) DATA.settings.styleTags=['人像','胶片','街拍'];
  if(!DATA.photo.discover) DATA.photo.discover={ items:[], lastFetchDate:'', trendWeek:'', trendReport:null };
}
/* 前端合并：任一方新增的条目（按 id）都不会被覆盖 */
function isIdArray(a){ return Array.isArray(a) && (a.length? (a[0]&&a[0].id!==undefined) : true); }
function mergeState(base, incoming){
  const out=JSON.parse(JSON.stringify(base||{}));
  for(const k in (incoming||{})){
    const iv=incoming[k], bv=out[k];
    if(Array.isArray(iv) && Array.isArray(bv)){
      if(isIdArray(iv) && isIdArray(bv)){
        const map={}; bv.forEach(x=>{ if(x&&x.id!==undefined) map[x.id]=x; });
        iv.forEach(x=>{ if(x&&x.id!==undefined) map[x.id]=x; });
        out[k]=Object.values(map);
      }else{ out[k]=iv; }
    }else if(iv && typeof iv==='object' && !Array.isArray(iv) && bv && typeof bv==='object' && !Array.isArray(bv)){
      out[k]=mergeState(bv, iv);
    }else{ out[k]=iv; }
  }
  return out;
}
/* 从服务端拉取权威数据并渲染（服务端为单一数据源，保证网页版与主屏幕版一致） */
async function syncFromServer(rerender){
  try{
    const r=await fetch('/api/state?'+Date.now(),{headers:apiHeaders()});
    if(r.status===401){ promptTokenOnce(); return; }
    const j=await r.json();
    if(j && j.data){
      const serverTs=j.updatedAt||0;
      // 服务端为权威：以服务端为准做并集合并，本地尚未推送的条目也保留
      DATA=mergeState(DATA, j.data);
      DATA._updatedAt=Math.max(serverTs, DATA._updatedAt||0);
      mergeDefaults();
      localStorage.setItem(STORAGE_KEY,JSON.stringify(DATA));
      if(rerender!==false && !document.querySelector('.modal-overlay.show')){
        const act=document.querySelector('.page.active');
        if(act) renderPage(act.id.replace('page-',''));
      }
    } else if(DATA._updatedAt){
      pushState(); // 服务端为空，把本地推上去
    }
  }catch(e){ /* 离线：使用本地缓存 */ }
}

/* ---------- Utils ---------- */
function todayStr(){ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
function esc(s){ return (s==null?'':String(s)).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function formatDate(s){ if(!s)return''; const d=new Date(s); return (d.getMonth()+1)+'月'+d.getDate()+'日'; }
function weekStr(){ const d=new Date(); const y=d.getFullYear(); const oneJan=new Date(y,0,1); const w=Math.ceil(((d-oneJan)/86400000+oneJan.getDay()+1)/7); return y+'-W'+String(w).padStart(2,'0'); }
function monthStr(){ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }

/* ---------- Navigation ---------- */
const PAGE_ACCENTS={ overview:'var(--c-overview)',today:'var(--c-today)',photo:'var(--c-photo)',fund:'var(--c-fund)',learn:'var(--c-learn)',incubator:'var(--c-incubator)',settings:'var(--c-settings)' };
function switchPage(p){
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.page===p));
  document.querySelectorAll('.page').forEach(s=>s.classList.toggle('active',s.id==='page-'+p));
  document.querySelector('.content').scrollTop=0;
  document.documentElement.style.setProperty('--accent',PAGE_ACCENTS[p]);
  renderPage(p);
}
function renderPage(p){
  if(p==='overview')renderOverview();
  else if(p==='today')renderToday();
  else if(p==='photo')renderPhoto();
  else if(p==='fund')renderFund();
  else if(p==='learn')renderLearn();
  else if(p==='incubator')renderIncubator();
  else if(p==='settings')renderSettings();
}
document.querySelectorAll('.nav-item').forEach(n=>n.addEventListener('click',()=>switchPage(n.dataset.page)));

/* Tabs */
function initTabs(){
  ['photo-tabs','fund-tabs'].forEach(id=>{
    const tabs=document.getElementById(id);
    tabs.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>{
      tabs.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
      t.classList.add('active');
      const prefix=id==='photo-tabs'?'panel-':'panel-';
      const page=tabs.closest('.page');
      page.querySelectorAll('.tab-panel').forEach(pn=>pn.classList.remove('active'));
      page.querySelector('#panel-'+t.dataset.tab).classList.add('active');
    }));
  });
}

/* ---------- Auto-roll tasks ---------- */
function autoRollTasks(){
  const t=DATA.todayTasks, today=todayStr();
  if(t.lastDate!==today){
    t.tasks.forEach(task=>{ if(!task.done && task.date!==today){ task.date=today; task.rolled=true; } });
    t.tasks=t.tasks.filter(task=>task.done?task.date===today:true);
    t.lastDate=today; saveData();
  }
}

/* ---------- Modal ---------- */
function openModal(html){ document.getElementById('modal-content').innerHTML=html; document.getElementById('modal-overlay').classList.add('show'); }
function closeModal(){ document.getElementById('modal-overlay').classList.remove('show'); }
document.getElementById('modal-overlay').addEventListener('click',e=>{ if(e.target===e.currentTarget)closeModal(); });
function modalHeader(t){ return `<div class="modal-header"><h3>${t}</h3><button class="modal-close" onclick="closeModal()">✕</button></div>`; }
function emptyHTML(mood,txt){
  return `<div class="empty-state"><p>${txt}</p></div>`;
}
function selectPill(el){ el.parentElement.querySelectorAll('.pill').forEach(p=>p.classList.remove('selected')); el.classList.add('selected'); }
function getPillValue(cid){ const s=document.querySelector('#'+cid+' .pill.selected'); return s?s.dataset.val:null; }

/* ============================================================
   总览看板
============================================================ */
function renderOverview(){
  document.getElementById('overview-date').textContent=new Date().toLocaleDateString('zh-CN',{year:'numeric',month:'long',day:'numeric',weekday:'long'});
  renderDigestCard();

  // 今日任务（始终显示）
  const tasks=DATA.todayTasks.tasks.filter(t=>t.date===todayStr());

  // 数据卡片
  const statsEl=document.getElementById('overview-stats');
  if(statsEl){
    const doneN=tasks.filter(t=>t.done).length;
    const taskVal=tasks.length? `${doneN}/${tasks.length}` : '—';
    const sampleN=DATA.photo.samples.length;
    let fundProfit=0; DATA.fund.portfolio.forEach(f=>{ fundProfit+=(f.currentPrice-f.costPrice)*f.shares; });
    const fundVal=DATA.fund.portfolio.length? `${fundProfit>=0?'+':''}${fundProfit.toFixed(0)}` : '—';
    const fundCls=fundProfit>0?'profit-up':fundProfit<0?'profit-down':'';
    let learnVal='—';
    if(DATA.learn.skills.length){
      const avg=DATA.learn.skills.reduce((a,sk)=>a+(sk.completedSteps.length/sk.steps.length)*100,0)/DATA.learn.skills.length;
      learnVal=avg.toFixed(0)+'%';
    }
    statsEl.innerHTML=`
      <div class="stat-card" style="--accent:var(--c-today)"><div class="stat-icon">☀️</div><div class="stat-value">${taskVal}</div><div class="stat-label">今日任务</div><div class="stat-bar"></div></div>
      <div class="stat-card" style="--accent:var(--c-photo)"><div class="stat-icon">🐚</div><div class="stat-value">${sampleN}</div><div class="stat-label">样片库</div><div class="stat-bar"></div></div>
      <div class="stat-card" style="--accent:var(--c-fund)"><div class="stat-icon">🦪</div><div class="stat-value ${fundCls}">${fundVal}</div><div class="stat-label">基金收益(元)</div><div class="stat-bar"></div></div>
      <div class="stat-card" style="--accent:var(--c-learn)"><div class="stat-icon">📖</div><div class="stat-value">${learnVal}</div><div class="stat-label">学习进度</div><div class="stat-bar"></div></div>`;
  }
  if(tasks.length){
    document.getElementById('overview-tasks').innerHTML=tasks.map(t=>`
      <div class="task-item ${t.done?'done':''}" style="margin-bottom:6px;box-shadow:none">
        <div class="task-checkbox ${t.done?'checked':''}" onclick="toggleTask('${t.id}')"></div>
        <div class="task-content"><div class="task-text">${esc(t.text)}</div><div class="task-meta"><span class="task-tag tag-${t.category}">${catName(t.category)}</span></div></div>
      </div>`).join('');
  } else {
    document.getElementById('overview-tasks').innerHTML=emptyHTML('lazy','今天还没安排呢，漂浮一会儿~');
  }

  // 有数据的模块才显示
  let mod='';
  if(DATA.fund.portfolio.length){
    mod+='<div class="card"><div class="card-title"><span class="accent-bar" style="background:var(--c-fund)"></span>💰 基金持仓</div><div id="overview-fund"></div></div>';
  }
  if(DATA.learn.skills.length){
    mod+='<div class="card"><div class="card-title"><span class="accent-bar" style="background:var(--c-learn)"></span>📚 学习进度</div><div id="overview-learn"></div></div>';
  }
  document.getElementById('overview-modules').innerHTML=mod;

  if(DATA.fund.portfolio.length){
    document.getElementById('overview-fund').innerHTML=DATA.fund.portfolio.map(f=>{
      const profit=(f.currentPrice-f.costPrice)*f.shares, pct=((f.currentPrice-f.costPrice)/f.costPrice*100);
      const cls=profit>0?'profit-up':profit<0?'profit-down':'profit-flat';
      return `<div class="flex-between" style="margin-bottom:8px"><div><b>${esc(f.name)}</b> <span class="fund-code">${esc(f.code)}</span></div><div class="${cls}"><b>${profit>=0?'+':''}${profit.toFixed(2)}</b> <span class="text-sm">(${pct>=0?'+':''}${pct.toFixed(2)}%)</span></div></div>`;
    }).join('');
  }
  if(DATA.learn.skills.length){
    document.getElementById('overview-learn').innerHTML=DATA.learn.skills.map(sk=>{
      const pct=(sk.completedSteps.length/sk.steps.length)*100;
      return `<div style="margin-bottom:10px"><div class="flex-between"><span style="font-weight:600">${esc(sk.name)}</span><span class="skill-pct">${pct.toFixed(0)}%</span></div><div class="progress-bar"><div class="progress-bar-fill" style="width:${pct}%;background:var(--c-learn)"></div></div></div>`;
    }).join('');
  }

  // 空出来的位置：最近想法 / 本周数据趋势 / 留白
  const ideas=DATA.incubator.ideas.slice(-3).reverse();
  if(ideas.length){
    document.getElementById('overview-freed').innerHTML='<div class="card"><div class="card-title"><span class="accent-bar"></span>💡 最近想法</div><div id="overview-ideas"></div></div>';
    document.getElementById('overview-ideas').innerHTML=ideas.map(i=>`<div class="idea-item" style="box-shadow:none"><div class="idea-text">${esc(i.text)}</div><div class="idea-date">${formatDate(i.date)}</div></div>`).join('');
  } else if(DATA.photo.reviews.length){
    const wk=weeklyReviewTrend();
    if(wk){ document.getElementById('overview-freed').innerHTML='<div class="card"><div class="card-title"><span class="accent-bar" style="background:var(--c-photo)"></span>📈 本周摄影数据</div>'+wk+'</div>'; }
    else { document.getElementById('overview-freed').innerHTML=''; }
  } else {
    document.getElementById('overview-freed').innerHTML='';
  }
}

/* ============================================================
   今天干啥
============================================================ */
function catName(c){ return ({photo:'摄影任务',learn:'学习任务',fund:'基金操作',other:'其他'})[c]||'其他'; }

function renderToday(){
  document.getElementById('today-date').textContent=new Date().toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'long'});
  const tasks=DATA.todayTasks.tasks.filter(t=>t.date===todayStr());
  const cats=['photo','learn','fund','other'];
  let html='';
  cats.forEach(cat=>{
    const ct=tasks.filter(t=>t.category===cat);
    if(ct.length){
      html+=`<div class="section-label">${catName(cat)}</div>`;
      html+=ct.map(t=>`
        <div class="task-item ${t.done?'done':''}">
          <div class="task-checkbox ${t.done?'checked':''}" onclick="toggleTask('${t.id}')"></div>
          <div class="task-content"><div class="task-text">${esc(t.text)}${t.rolled?' <span class="text-sm text-muted">⏰滚过来的</span>':''}</div><div class="task-meta"><span class="task-tag tag-${cat}">${catName(cat)}</span></div></div>
          <button class="task-delete" onclick="deleteTask('${t.id}')">✕</button>
        </div>`).join('');
    }
  });
  if(!html) html=emptyHTML('lazy','今天还没安排，漂浮一会儿~');
  const doneCount=tasks.filter(t=>t.done).length;
  if(tasks.length){
    html=`<div class="card" style="text-align:center;padding:10px"><span style="font-size:14px;color:var(--text-secondary)">今日进度</span><div style="font-size:28px;font-weight:800;color:var(--c-today)">${doneCount} / ${tasks.length}</div><div class="progress-bar" style="margin-top:4px"><div class="progress-bar-fill" style="width:${doneCount/tasks.length*100}%;background:var(--c-today)"></div></div></div>`+html;
  }
  document.getElementById('today-tasks').innerHTML=html;
}
function toggleTask(id){ const t=DATA.todayTasks.tasks.find(x=>x.id===id); if(t){ t.done=!t.done; saveData(); renderToday(); } }
function deleteTask(id){ DATA.todayTasks.tasks=DATA.todayTasks.tasks.filter(t=>t.id!==id); saveData(); renderToday(); }
function openTaskModal(){
  openModal(`${modalHeader('添加今日任务')}
    <div class="form-group"><label>任务内容</label><textarea class="form-textarea" id="task-text" placeholder="今天必须完成的事..."></textarea></div>
    <div class="form-group"><label>类型</label><div class="pill-select" id="task-cat-select">
      <div class="pill selected" data-val="photo" onclick="selectPill(this)">📷 摄影</div>
      <div class="pill" data-val="learn" onclick="selectPill(this)">📚 学习</div>
      <div class="pill" data-val="fund" onclick="selectPill(this)">💰 基金</div>
      <div class="pill" data-val="other" onclick="selectPill(this)">📌 其他</div></div></div>
    <button class="btn btn-primary btn-block" onclick="addTask()">添加任务</button>`);
  setTimeout(()=>document.getElementById('task-text').focus(),50);
}
function addTask(){
  const text=document.getElementById('task-text').value.trim(); if(!text)return;
  DATA.todayTasks.tasks.push({ id:uid(),text,category:getPillValue('task-cat-select')||'photo',done:false,date:todayStr(),rolled:false });
  saveData(); closeModal(); renderToday();
}
function generateTodayTemplate(){
  const today=todayStr();
  if(DATA.todayTasks.tasks.some(t=>t.date===today)){ if(!confirm('今天已有任务，要再追加一组模板吗？'))return; }
  const tpl=[
    {text:'📷 拍一组照片 / 发一条笔记',category:'photo'},
    {text:'📚 学一点新东西（哪怕15分钟）',category:'learn'},
    {text:'💰 看一眼基金，记一笔操作',category:'fund'},
    {text:'🚀 推进一个孵化项目的小步骤',category:'other'}
  ];
  tpl.forEach(t=>DATA.todayTasks.tasks.push({ id:uid(),text:t.text,category:t.category,done:false,date:today,rolled:false }));
  saveData(); renderToday();
}

/* ============================================================
   摄影搞钱
============================================================ */
const HOT_POOL=[
  {t:'治愈系晨光人像',p:'xhs',tags:['人像','胶片'],n:'柔光+逆光发丝光，情绪感强'},
  {t:'城市夜景赛博朋克',p:'douyin',tags:['夜景','街拍'],n:'霓虹+慢门车流，科技感拉满'},
  {t:'胶片色调美食特写',p:'xhs',tags:['美食','胶片'],n:'暖黄调+浅景深，食欲感'},
  {t:'极简白底产品图',p:'douyin',tags:['产品'],n:'干净留白，电商爆款逻辑'},
  {t:'日系逆光少女人像',p:'xhs',tags:['人像','胶片','街拍'],n:'过曝柔焦，清新自然'},
  {t:'废墟风暗调人像',p:'douyin',tags:['人像','夜景'],n:'硬光+浓阴影，电影感'},
  {t:'宠物搞笑抓拍',p:'douyin',tags:['宠物'],n:'连拍+低机位，萌点放大'},
  {t:'旅行vlog转场',p:'douyin',tags:['旅行','街拍'],n:'卡点转场，节奏感强'},
  {t:'婚礼逆光剪影',p:'xhs',tags:['人像','婚礼'],n:'轮廓光+剪影，高级感'},
  {t:'街头黑白纪实',p:'douyin',tags:['街拍','黑白'],n:'高对比黑白，故事感'},
  {t:'ins风家居静物',p:'xhs',tags:['产品','美食'],n:'自然光+绿植，生活感'},
  {t:'星空银河延时',p:'douyin',tags:['风光','夜景'],n:'广角+堆栈，震撼大片'},
  {t:'国风汉服人像',p:'xhs',tags:['人像'],n:'古典构图+柔光，氛围感'},
  {t:'微距花卉露珠',p:'douyin',tags:['风光','微距'],n:'大光圈特写，质感细腻'},
  {t:'复古港风写真',p:'xhs',tags:['人像','胶片'],n:'高饱和暖调，年代感'},
  {t:'美食制作过程短片',p:'douyin',tags:['美食','视频'],n:'俯拍+快剪，下饭神器'},
  {t:'闺蜜合照pose合集',p:'xhs',tags:['人像'],n:'互动感pose，收藏率高'},
  {t:'城市天台俯拍',p:'douyin',tags:['街拍','风光'],n:'上帝视角，构图新奇'},
  {t:'老爷爷老奶奶肖像',p:'xhs',tags:['人像','纪实'],n:'皱纹特写+眼神光，动人'},
  {t:'雨天人像氛围感',p:'douyin',tags:['人像','夜景'],n:'玻璃水珠+霓虹倒影'},
  {t:'极光风光大片',p:'douyin',tags:['风光','夜景'],n:'冷调+广角，稀缺内容'},
  {t:'咖啡拉花特写',p:'xhs',tags:['美食','产品'],n:'俯拍微距，质感治愈'},
  {t:'复古胶片旅行照',p:'xhs',tags:['旅行','胶片','街拍'],n:'漏光+颗粒，文艺感'},
  {t:'宠物+主人合影',p:'douyin',tags:['宠物','人像'],n:'情感向，互动高'},
  {t:'极简建筑几何',p:'douyin',tags:['风光','街拍'],n:'线条+对称，高级冷感'},
  {t:'新娘晨袍光影',p:'xhs',tags:['人像','婚礼'],n:'窗光+纱质，温柔'},
  {t:'街头美食探店',p:'douyin',tags:['美食','街拍'],n:'第一视角+试吃，真实'},
  {t:'逆光发丝婴儿照',p:'xhs',tags:['人像'],n:'柔光+纯色背景，温馨'},
  {t:'城市霓虹人像',p:'douyin',tags:['人像','夜景','街拍'],n:'冷暖对比，潮酷'},
  {t:'秋天落叶人像',p:'xhs',tags:['人像','风光'],n:'金黄调+飘叶，氛围'}
];
function hashStr(s){ let h=0; for(let i=0;i<s.length;i++){ h=(h*31+s.charCodeAt(i))>>>0; } return h; }
function generateDailyHot(){
  const d=todayStr(); const seed=hashStr(d);
  const count=7; const start=seed%HOT_POOL.length;
  const picks=[];
  for(let i=0;i<count;i++){ picks.push(HOT_POOL[(start+i*3)%HOT_POOL.length]); }
  DATA.photo.dailyHot=picks.map(x=>({ id:uid(),date:d,platform:x.p,title:x.t,tags:x.tags.join(','),notes:x.n,auto:true }));
  DATA.photo.lastHotDate=d; saveData();
}
async function checkDailyHot(){
  const now=new Date();
  if(now.getHours()<9){ return; } // 9点前不更新
  if(DATA.photo.lastHotDate!==todayStr()){
    const got=await fetchBackendHot();
    if(!got) generateDailyHot();
  }
}
async function fetchBackendHot(){
  try{
    const res=await fetch(hotApiBase()+'/today',{cache:'no-store',headers:apiHeaders()});
    if(!res.ok) return false;
    const data=await res.json();
    const items=(data&&data.items)||[];
    if(!items.length) return false;
    DATA.photo.dailyHot=items.map(x=>({ id:uid(),date:todayStr(),platform:x.platform==='douyin'?'douyin':'xhs',title:x.title,tags:Array.isArray(x.tags)?x.tags.join(','):(x.tags||''),notes:x.notes||'',auto:true,source:'api' }));
    DATA.photo.lastHotDate=todayStr(); saveData();
    return true;
  }catch(e){ return false; }
}
async function refreshBackendHot(){
  try{
    const res=await fetch(hotApiBase()+'/refresh',{method:'POST',headers:apiHeaders()});
    const data=await res.json().catch(()=>({}));
    const items=(data&&data.items)||[];
    DATA.photo.dailyHot=items.map(x=>({ id:uid(),date:todayStr(),platform:x.platform==='douyin'?'douyin':'xhs',title:x.title,tags:Array.isArray(x.tags)?x.tags.join(','):(x.tags||''),notes:x.notes||'',auto:true,source:'api' }));
    DATA.photo.lastHotDate=todayStr(); saveData();
    renderPhotoHot();
  }catch(e){ alert('抓取失败：后端未运行或未配置 API key。'); }
}
function styleMatch(tagsStr){
  const tags=(tagsStr||'').split(',').map(t=>t.trim());
  return tags.some(t=>DATA.settings.styleTags.includes(t));
}
function renderStylePills(){
  const all=['人像','胶片','街拍','风光','夜景','美食','产品','宠物','婚礼','旅行','黑白','微距','视频','纪实'];
  document.getElementById('style-pills').innerHTML=all.map(s=>`<div class="pill ${DATA.settings.styleTags.includes(s)?'selected':''}" data-val="${s}" onclick="toggleStyle('${s}')">${s}</div>`).join('');
}
function toggleStyle(s){
  const arr=DATA.settings.styleTags;
  if(arr.includes(s)){ DATA.settings.styleTags=arr.filter(x=>x!==s); }
  else { arr.push(s); }
  saveData(); renderStylePills(); renderPhotoHot();
}

function renderPhoto(){
  renderStylePills(); renderPhotoHot(); renderPhotoSamples(); renderPhotoReviews(); renderPhotoInspirations(); renderDiscover();
  pullDiscoverInbox(); // 收取每日自动化推送的爆款（有就合并进发现流）
  pullMypostsInbox(); // 收取创作者中心同步来的我的帖子真实数据
}
function renderPhotoHot(){
  const now=new Date();
  const timeEl=document.getElementById('hot-refresh-time');
  const list=document.getElementById('photo-hot-list');
  if(now.getHours()<9){
    timeEl.textContent='🌅 今日热点 09:00 自动更新';
    if(DATA.photo.dailyHot.length){ list.innerHTML=renderHotItems(DATA.photo.dailyHot); }
    else { list.innerHTML='<p class="text-sm text-muted" style="margin:8px 0">⏳ 今天的热点还在准备中，9点自动更新。</p>'; }
    return;
  }
  timeEl.textContent=DATA.photo.dailyHot.some(h=>h.source==='api')?'🔌 实时API已接入':'✅ 今日已更新';
  const items=DATA.photo.dailyHot.concat(DATA.photo.hot);
  if(!items.length){ list.innerHTML=emptyHTML('lazy','还没有热点，发现爆款就丢进海里~'); return; }
  list.innerHTML=renderHotItems(items);
}
function renderHotItems(items){
  return items.slice(-14).reverse().map(h=>{
    const isStyle=styleMatch(h.tags);
    const pf=h.platform==='douyin'?'抖音':'小红书';
    return `<div class="hot-item">
      <div class="flex-between">
        <span class="chip ${h.platform==='douyin'?'chip-active':''}" style="font-size:11px">${pf}</span>
        ${isStyle?'<span class="hot-style-badge">✨你的风格</span>':'<span class="text-sm text-muted">'+formatDate(h.date)+'</span>'}
      </div>
      <div style="font-weight:600;margin-top:4px">${esc(h.title)}</div>
      ${h.tags?`<div style="margin-top:4px">${h.tags.split(',').map(t=>`<span class="sample-tag">${esc(t.trim())}</span>`).join('')}</div>`:''}
      ${h.notes?`<div class="text-sm text-muted mt-8">💡 ${esc(h.notes)}</div>`:''}
    </div>`;
  }).join('');
}
function openHotModal(){
  openModal(`${modalHeader('记录热点')}
    <div class="form-group"><label>平台</label><div class="pill-select" id="hot-platform">
      <div class="pill selected" data-val="douyin" onclick="selectPill(this)">抖音</div>
      <div class="pill" data-val="xhs" onclick="selectPill(this)">小红书</div></div></div>
    <div class="form-group"><label>标题/描述</label><input class="form-input" id="hot-title" placeholder="爆款内容标题..."></div>
    <div class="form-group"><label>标签（逗号分隔）</label><input class="form-input" id="hot-tags" placeholder="人像,逆光,胶片..."></div>
    <div class="form-group"><label>我能借鉴啥</label><textarea class="form-textarea" id="hot-notes" placeholder="构图？色调？姿势？光线？"></textarea></div>
    <button class="btn btn-primary btn-block" onclick="addHot()">记录</button>`);
}
function addHot(){
  DATA.photo.hot.push({ id:uid(),date:todayStr(),platform:getPillValue('hot-platform'),title:document.getElementById('hot-title').value.trim(),tags:document.getElementById('hot-tags').value.trim(),notes:document.getElementById('hot-notes').value.trim(),auto:false });
  saveData(); closeModal(); renderPhotoHot();
}
function renderPhotoSamples(){
  const list=DATA.photo.samples, el=document.getElementById('photo-samples');
  if(!list.length){ el.innerHTML=emptyHTML('sad','样片池里一条鱼都没有…'); return; }
  el.innerHTML=list.slice(-20).reverse().map(s=>`
    <div class="sample-card">
      ${s.url?`<img class="sample-img" src="${esc(s.url)}" alt="" onerror="this.style.display='none'">`:''}
      <div class="sample-body">
        <div class="sample-title">${esc(s.title)}</div>
        ${(s.likes||s.saves||s.followers||s.income)?`<div class="sample-notes">❤️${s.likes||0} 🔖${s.saves||0} ➕${s.followers||0}${s.income?` 💰${s.income}`:''}</div>`:''}
        ${s.borrow?`<div class="sample-notes">💡 借鉴：${esc(s.borrow)}</div>`:''}
        ${s.tags?`<div class="sample-tags">${s.tags.split(',').map(t=>`<span class="sample-tag">${esc(t.trim())}</span>`).join('')}</div>`:''}
        <div class="sample-actions"><span class="text-sm text-muted">${formatDate(s.date)}</span><button class="btn btn-ghost btn-sm" style="margin-left:auto" onclick="deleteSample('${s.id}')">删除</button></div>
      </div>
    </div>`).join('');
}
function openSampleModal(){
  openModal(`${modalHeader('存一张样片')}
    <div class="form-group"><label>图片链接</label><input class="form-input" id="sample-url" placeholder="粘贴图片URL..."></div>
    <div class="form-group"><label>标题</label><input class="form-input" id="sample-title" placeholder="这张照片叫啥..."></div>
    <div class="form-group"><label>平台</label><div class="pill-select" id="sample-platform">
      <div class="pill selected" data-val="xhs" onclick="selectPill(this)">小红书</div>
      <div class="pill" data-val="douyin" onclick="selectPill(this)">抖音</div>
      <div class="pill" data-val="other" onclick="selectPill(this)">其他</div></div></div>
    <div class="form-row">
      <div class="form-group"><label>点赞</label><input class="form-input" id="sample-likes" type="number" value="0"></div>
      <div class="form-group"><label>收藏</label><input class="form-input" id="sample-saves" type="number" value="0"></div>
      <div class="form-group"><label>涨粉</label><input class="form-input" id="sample-followers" type="number" value="0"></div>
    </div>
    <div class="form-group"><label>这条客片带来收入(元，可选)</label><input class="form-input" id="sample-income" type="number" step="0.01" value="0"></div>
    <div class="form-group"><label>我能借鉴啥</label><textarea class="form-textarea" id="sample-borrow" placeholder="构图？色调？姿势？光线？后期？"></textarea></div>
    <div class="form-group"><label>标签（逗号分隔）</label><input class="form-input" id="sample-tags" placeholder="人像,逆光,胶片..."></div>
    <button class="btn btn-primary btn-block" onclick="addSample()">存进来</button>`);
}
function addSample(){
  DATA.photo.samples.push({ id:uid(),date:todayStr(),
    url:document.getElementById('sample-url').value.trim(),
    title:document.getElementById('sample-title').value.trim(),
    platform:getPillValue('sample-platform'),
    likes:parseInt(document.getElementById('sample-likes').value)||0,
    saves:parseInt(document.getElementById('sample-saves').value)||0,
    followers:parseInt(document.getElementById('sample-followers').value)||0,
    income:parseFloat(document.getElementById('sample-income').value)||0,
    borrow:document.getElementById('sample-borrow').value.trim(),
    tags:document.getElementById('sample-tags').value.trim() });
  saveData(); closeModal(); renderPhotoSamples();
}
function deleteSample(id){ DATA.photo.samples=DATA.photo.samples.filter(s=>s.id!==id); saveData(); renderPhotoSamples(); }

function renderPhotoReviews(){
  const list=DATA.photo.reviews, el=document.getElementById('photo-reviews');
  if(!list.length){ el.innerHTML=emptyHTML('sad','还没复盘记录，丧鱼想吃点数据~'); return; }
  el.innerHTML=list.slice(-20).reverse().map(r=>`
    <div class="review-card">
      <div class="review-head">
        <div class="review-platform">
          <span class="platform-badge ${r.platform==='douyin'?'badge-douyin':r.platform==='xhs'?'badge-xhs':'badge-other'}">${r.platform==='douyin'?'抖音':r.platform==='xhs'?'小红书':'其他'}</span>
          ${r.source==='auto'?'<span class="sync-tag">🔄 自动同步</span>':''}
        </div>
        ${r.aiScore?`<span class="review-score">${r.aiScore}<i>分</i></span>`:''}
      </div>
      <div class="review-date text-sm text-muted">${formatDate(r.date)}${r.syncedAt?' · 同步于'+formatDate(r.syncedAt):''}</div>
      ${r.title?`<div style="font-weight:700;margin:4px 0 2px">${esc(r.title)}${r.link?` <a href="${esc(r.link)}" target="_blank" rel="noopener" style="color:var(--c-photo);font-size:12px">原帖↗</a>`:''}</div>`:''}
      <div class="review-stats">
        ${r.views?`<div class="review-stat"><div class="num">${r.views}</div><div class="lbl">观看</div></div>`:''}
        <div class="review-stat"><div class="num profit-up">${r.likes||0}</div><div class="lbl">点赞</div></div>
        <div class="review-stat"><div class="num profit-up">${r.saves||0}</div><div class="lbl">收藏</div></div>
        ${r.comments?`<div class="review-stat"><div class="num">${r.comments}</div><div class="lbl">评论</div></div>`:''}
        <div class="review-stat"><div class="num profit-up">+${(r.followers||0)}</div><div class="lbl">涨粉</div></div>
        ${r.conv?`<div class="review-stat"><div class="num">${r.conv}</div><div class="lbl">转化</div></div>`:''}
      </div>
      ${r.aiSummary?`<div class="review-notes"><b>🤖 ${esc(r.aiSummary)}</b></div>`:''}
      ${r.aiWorked&&r.aiWorked.length?`<div class="review-notes text-sm">✅ ${r.aiWorked.map(x=>esc(x)).join('；')}</div>`:''}
      ${r.aiImprove&&r.aiImprove.length?`<div class="review-notes text-sm">🔧 ${r.aiImprove.map(x=>esc(x)).join('；')}</div>`:''}
      ${r.aiNext?`<div class="review-notes text-sm" style="color:var(--c-photo);font-weight:600">➡️ 下条：${esc(r.aiNext)}</div>`:''}
      ${r.notes?`<div class="review-notes">📝 ${esc(r.notes)}</div>`:''}
      <button class="btn btn-ghost btn-sm mt-12" onclick="deleteReview('${r.id}')">删除</button>
    </div>`).join('');
}
function openReviewModal(){
  openModal(`${modalHeader('新增复盘')}
    <div class="form-group"><label>平台</label><div class="pill-select" id="review-platform">
      <div class="pill selected" data-val="xhs" onclick="selectPill(this)">小红书</div>
      <div class="pill" data-val="douyin" onclick="selectPill(this)">抖音</div>
      <div class="pill" data-val="other" onclick="selectPill(this)">其他</div></div></div>
    <div class="form-row">
      <div class="form-group"><label>点赞</label><input class="form-input" id="review-likes" type="number" value="0"></div>
      <div class="form-group"><label>收藏</label><input class="form-input" id="review-saves" type="number" value="0"></div>
      <div class="form-group"><label>涨粉</label><input class="form-input" id="review-followers" type="number" value="0"></div>
    </div>
    <div class="form-group"><label>下次怎么优化</label><textarea class="form-textarea" id="review-notes" placeholder="封面改一下？标题更吸引人？发布时间调整？"></textarea></div>
    <button class="btn btn-primary btn-block" onclick="addReview()">保存复盘</button>`);
}
function addReview(){
  DATA.photo.reviews.push({ id:uid(),date:todayStr(),platform:getPillValue('review-platform'),likes:parseInt(document.getElementById('review-likes').value)||0,saves:parseInt(document.getElementById('review-saves').value)||0,followers:parseInt(document.getElementById('review-followers').value)||0,notes:document.getElementById('review-notes').value.trim() });
  saveData(); closeModal(); renderPhotoReviews();
}
function deleteReview(id){ DATA.photo.reviews=DATA.photo.reviews.filter(r=>r.id!==id); saveData(); renderPhotoReviews(); }

function renderPhotoInspirations(){
  const list=DATA.photo.inspirations;
  const weeklyEl=document.getElementById('weekly-inspiration');
  if(list.length){
    const seed=list.reduce((s,i)=>s+i.id.charCodeAt(0),0);
    const pick=list[seed%list.length];
    weeklyEl.innerHTML=`<div class="card-title"><span class="accent-bar"></span>🎯 本周拍这个</div><div style="font-weight:700;font-size:16px">${esc(pick.title)}</div><div class="text-sm text-muted mt-8">${esc(pick.desc||'')}</div><div class="text-sm mt-8">类型：${pick.type}</div>`;
  } else { weeklyEl.innerHTML=`<div class="card-title"><span class="accent-bar"></span>🎯 本周拍这个</div><p class="text-sm text-muted">先存几条灵感，每周给你推一个拍摄方向！</p>`; }
  const el=document.getElementById('photo-inspirations');
  if(!list.length){ el.innerHTML=emptyHTML('happy','灵感银行空空的，快丢点新想法喂鱼！'); return; }
  el.innerHTML=list.slice(-20).reverse().map(i=>`
    <div class="insp-card"><div class="insp-type">${i.type}</div><div class="insp-title">${esc(i.title)}</div>${i.desc?`<div class="insp-desc">${esc(i.desc)}</div>`:''}<div class="insp-date">${formatDate(i.date)}</div><button class="btn btn-ghost btn-sm mt-12" onclick="deleteInspiration('${i.id}')">删除</button></div>`).join('');
}
function openInspirationModal(){
  openModal(`${modalHeader('存一条灵感')}
    <div class="form-group"><label>类型</label><div class="pill-select" id="insp-type">
      <div class="pill selected" data-val="电影" onclick="selectPill(this)">🎬 电影</div>
      <div class="pill" data-val="画册" onclick="selectPill(this)">📖 画册</div>
      <div class="pill" data-val="街拍" onclick="selectPill(this)">🏙️ 街拍</div>
      <div class="pill" data-val="其他" onclick="selectPill(this)">✨ 其他</div></div></div>
    <div class="form-group"><label>标题</label><input class="form-input" id="insp-title" placeholder="电影名/画册名/场景描述..."></div>
    <div class="form-group"><label>描述（为什么打动你）</label><textarea class="form-textarea" id="insp-desc" placeholder="光影？色彩？情绪？故事感？"></textarea></div>
    <button class="btn btn-primary btn-block" onclick="addInspiration()">存进来</button>`);
}
function addInspiration(){
  DATA.photo.inspirations.push({ id:uid(),date:todayStr(),type:getPillValue('insp-type'),title:document.getElementById('insp-title').value.trim(),desc:document.getElementById('insp-desc').value.trim() });
  saveData(); closeModal(); renderPhotoInspirations();
}
function deleteInspiration(id){ DATA.photo.inspirations=DATA.photo.inspirations.filter(i=>i.id!==id); saveData(); renderPhotoInspirations(); }

/* ============================================================
   基金理财
============================================================ */
function renderFund(){ renderFundPortfolio(); renderFundGuesses(); renderFundTrades(); renderFundMonthly(); }
function renderFundPortfolio(){
  const list=DATA.fund.portfolio, el=document.getElementById('fund-portfolio');
  if(!list.length){ el.innerHTML=emptyHTML('normal','还没添加基金，先去水里捞一只？'); return; }
  const totalProfit=list.reduce((s,f)=>s+(f.currentPrice-f.costPrice)*f.shares,0);
  const totalCost=list.reduce((s,f)=>s+f.costPrice*f.shares,0);
  const totalPct=totalCost?totalProfit/totalCost*100:0;
  let html=`<div class="flex-between" style="margin-bottom:10px"><span class="text-sm text-muted">${lastFundRefresh?('行情更新于 '+lastFundRefresh):'行情：手动模式'}</span><button class="btn btn-ghost btn-sm" onclick="refreshAllFundQuotes()">🔄 刷新行情</button></div>`;
  html+=`<div class="card" style="text-align:center"><div class="text-sm text-muted">总盈亏</div><div style="font-size:32px;font-weight:800" class="${totalProfit>=0?'profit-up':'profit-down'}">${totalProfit>=0?'+':''}${totalProfit.toFixed(2)}</div><div class="text-sm ${totalProfit>=0?'profit-up':'profit-down'}">${totalPct>=0?'+':''}${totalPct.toFixed(2)}%</div></div>`;
  html+=`<button class="btn btn-primary btn-block mt-12" onclick="aiFundReview()">🤖 AI 基金复盘</button>`;
  html+=list.map(f=>{
    const profit=(f.currentPrice-f.costPrice)*f.shares, pct=f.costPrice?(f.currentPrice-f.costPrice)/f.costPrice*100:0;
    const cls=profit>0?'profit-up':profit<0?'profit-down':'profit-flat';
    return `<div class="fund-item">
      <div class="fund-header"><div><span class="fund-name">${esc(f.name)}</span><span class="fund-code">${esc(f.code)}</span></div>
        <div class="fund-profit"><div class="amount ${cls}">${profit>=0?'+':''}${profit.toFixed(2)}</div><div class="pct ${cls}">${pct>=0?'+':''}${pct.toFixed(2)}%</div></div></div>
      <div class="fund-detail"><span>持有 <b>${f.shares}</b> 份</span><span>成本 <b>${f.costPrice.toFixed(4)}</b></span><span>现价 <b>${f.currentPrice.toFixed(4)}</b>${f.liveUpdated?' <span class="sample-tag">实时</span>':''}</span><span>市值 <b>${(f.currentPrice*f.shares).toFixed(2)}</b></span></div>
      <div class="flex-between mt-12"><button class="btn btn-ghost btn-sm" onclick="updateFundPrice('${f.id}')">更新现价</button><button class="btn btn-ghost btn-sm" onclick="deleteFund('${f.id}')">删除</button></div>
    </div>`;
  }).join('');
  el.innerHTML=html;
}
function openFundModal(){
  openModal(`${modalHeader('添加基金')}
    <div class="form-row"><div class="form-group"><label>基金名称</label><input class="form-input" id="fund-name" placeholder="如：易方达蓝筹"></div><div class="form-group"><label>基金代码</label><input class="form-input" id="fund-code" placeholder="如：005827"></div></div>
    <div class="form-row"><div class="form-group"><label>持有份额</label><input class="form-input" id="fund-shares" type="number" step="0.01" placeholder="1000"></div><div class="form-group"><label>成本单价</label><input class="form-input" id="fund-cost" type="number" step="0.0001" placeholder="1.5000"></div></div>
    <div class="form-group"><label>当前单价</label><input class="form-input" id="fund-current" type="number" step="0.0001" placeholder="1.6000"></div>
    <button class="btn btn-primary btn-block" onclick="addFund()">添加</button>`);
}
function addFund(){
  DATA.fund.portfolio.push({ id:uid(),name:document.getElementById('fund-name').value.trim(),code:document.getElementById('fund-code').value.trim(),shares:parseFloat(document.getElementById('fund-shares').value)||0,costPrice:parseFloat(document.getElementById('fund-cost').value)||0,currentPrice:parseFloat(document.getElementById('fund-current').value)||0 });
  saveData(); closeModal(); renderFundPortfolio();
}
function updateFundPrice(id){ const f=DATA.fund.portfolio.find(x=>x.id===id); if(!f)return;
  openModal(`${modalHeader('更新现价 - '+f.name)}<div class="form-group"><label>当前单价（成本：${f.costPrice.toFixed(4)}）</label><input class="form-input" id="upd-price" type="number" step="0.0001" value="${f.currentPrice}"></div><button class="btn btn-primary btn-block" onclick="saveFundPrice('${id}')">更新</button>`);
}
function saveFundPrice(id){ const f=DATA.fund.portfolio.find(x=>x.id===id); if(f){ f.currentPrice=parseFloat(document.getElementById('upd-price').value)||0; saveData(); } closeModal(); renderFundPortfolio(); }
function deleteFund(id){ DATA.fund.portfolio=DATA.fund.portfolio.filter(f=>f.id!==id); saveData(); renderFundPortfolio(); }

/* ===== 基金真实行情（东方财富/天天基金 公开JSONP接口，免费无需key） ===== */
let lastFundRefresh=null;
let _fundRefreshing=false;
function jsonpFetch(url){
  return new Promise((resolve,reject)=>{
    const cb='__jp'+Date.now()+Math.floor(Math.random()*1e6);
    const sep=url.indexOf('?')>=0?'&':'?';
    const s=document.createElement('script');
    s.src=url+sep+'callback='+cb+'&_='+Date.now();
    let done=false;
    function cleanup(){ try{document.body.removeChild(s);}catch(e){} try{delete window[cb];}catch(e){} }
    window[cb]=(data)=>{ if(done)return; done=true; cleanup(); resolve(data); };
    s.onerror=()=>{ if(done)return; done=true; cleanup(); reject(new Error('net')); };
    setTimeout(()=>{ if(done)return; done=true; cleanup(); reject(new Error('timeout')); }, 8000);
    document.body.appendChild(s);
  });
}
async function fetchFundQuote(code){
  // 1) 实时估值（东方财富 fundgz 接口，浏览器跨域可用）
  try{
    const d=await jsonpFetch('https://fundgz.1234567.com.cn/js/'+code+'.js');
    if(d&&d.gsz&&d.gsz>0){ return { gsz:parseFloat(d.gsz), gszzl:parseFloat(d.gszzl)||0, name:d.name, time:d.gztime }; }
  }catch(e){}
  // 2) 兜底：用历史净值最新一条当现价（fundf10 pingzhongdata）
  try{
    await loadScriptRaw('https://fundf10.eastmoney.com/pingzhongdata/'+code+'.js');
    const arr=window.Data_netWorthTrend;
    if(arr&&arr.length){ const last=arr[arr.length-1]; const nav=parseFloat(last[1]); if(nav>0){ return { gsz:nav, gszzl:parseFloat(last[3])||0, name:window.fundName||'', time:'' }; } }
  }catch(e){}
  return null;
}
function loadScriptRaw(url){
  return new Promise((resolve,reject)=>{
    const s=document.createElement('script'); s.src=url+'?v='+Date.now();
    let done=false;
    function cleanup(){ try{document.body.removeChild(s);}catch(e){} }
    s.onload=()=>{ if(done)return; done=true; cleanup(); resolve(true); };
    s.onerror=()=>{ if(done)return; done=true; cleanup(); reject(new Error('net')); };
    setTimeout(()=>{ if(done)return; done=true; cleanup(); reject(new Error('timeout')); }, 8000);
    document.body.appendChild(s);
  });
}
function nowStamp(){ const d=new Date(); const p=n=>String(n).padStart(2,'0'); return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes()); }
async function refreshAllFundQuotes(){
  if(_fundRefreshing) return;
  const list=DATA.fund.portfolio;
  if(!list.length){ lastFundRefresh='无持仓'; renderFundPortfolio(); return; }
  _fundRefreshing=true;
  for(const f of list){
    if(!f.code) continue;
    const q=await fetchFundQuote(f.code);
    if(q && q.gsz>0){
      f.currentPrice=q.gsz; f.liveUpdated=nowStamp();
      if(q.name && !f.name) f.name=q.name;
      saveData();
    }
  }
  _fundRefreshing=false;
  lastFundRefresh=nowStamp();
  renderFundPortfolio();
  if(document.getElementById('page-overview').classList.contains('active')) renderOverview();
}

function renderFundGuesses(){
  const list=DATA.fund.guesses, el=document.getElementById('fund-guesses');
  if(!list.length){ el.innerHTML=emptyHTML('happy','还没猜过市场，本周来赌一把泡泡！'); return; }
  const dir={up:'📈 涨',down:'📉 跌',flat:'➡️ 平'};
  el.innerHTML=list.slice(-20).reverse().map(g=>`
    <div class="guess-card">
      <div class="guess-header"><span class="guess-week">${g.week}</span><span class="guess-direction ${g.actual?(g.direction===g.actual?'profit-up':'profit-down'):''}">${dir[g.direction]}</span></div>
      ${g.notes?`<div class="text-sm text-muted mt-8">${esc(g.notes)}</div>`:''}
      <div class="guess-actual"><span>实际：${g.actual?dir[g.actual]:'待验证 ⏳'}</span>${g.actual?(g.direction===g.actual?'<span class="profit-up" style="font-weight:700">✅ 猜对了！</span>':'<span class="profit-down" style="font-weight:700">❌ 猜错了</span>'):`<button class="btn btn-ghost btn-sm" onclick="setGuessActual('${g.id}')">填实际</button>`}</div>
    </div>`).join('');
}
function openGuessModal(){
  openModal(`${modalHeader('本周猜一把')}
    <div class="form-group"><label>我觉得这周市场会...</label><div class="pill-select" id="guess-dir">
      <div class="pill selected" data-val="up" onclick="selectPill(this)">📈 涨</div>
      <div class="pill" data-val="down" onclick="selectPill(this)">📉 跌</div>
      <div class="pill" data-val="flat" onclick="selectPill(this)">➡️ 平</div></div></div>
    <div class="form-group"><label>理由（可选）</label><textarea class="form-textarea" id="guess-notes" placeholder="为啥这么猜..."></textarea></div>
    <button class="btn btn-primary btn-block" onclick="addGuess()">猜！</button>`);
}
function addGuess(){ DATA.fund.guesses.push({ id:uid(),week:weekStr(),direction:getPillValue('guess-dir'),actual:'',notes:document.getElementById('guess-notes').value.trim() }); saveData(); closeModal(); renderFundGuesses(); }
function setGuessActual(id){ const g=DATA.fund.guesses.find(x=>x.id===id); if(!g)return;
  openModal(`${modalHeader('填写实际结果 - '+g.week)}<div class="form-group"><label>实际市场是...</label><div class="pill-select" id="guess-actual">
    <div class="pill selected" data-val="up" onclick="selectPill(this)">📈 涨</div><div class="pill" data-val="down" onclick="selectPill(this)">📉 跌</div><div class="pill" data-val="flat" onclick="selectPill(this)">➡️ 平</div></div></div><button class="btn btn-primary btn-block" onclick="saveGuessActual('${id}')">保存</button>`);
}
function saveGuessActual(id){ const g=DATA.fund.guesses.find(x=>x.id===id); if(g){ g.actual=getPillValue('guess-actual'); saveData(); } closeModal(); renderFundGuesses(); }

function renderFundTrades(){
  const list=DATA.fund.trades, el=document.getElementById('fund-trades');
  if(!list.length){ el.innerHTML=emptyHTML('normal','还没有交易记录，记一笔吧~'); return; }
  const mood={confident:'😎 自信',excited:'🤩 兴奋',scared:'😨 害怕',rational:'🧐 理性',greedy:'🤑 贪心',panic:'😱 恐慌'};
  el.innerHTML=list.slice(-20).reverse().map(t=>`
    <div class="trade-record trade-${t.type}">
      <div class="trade-header"><span class="trade-type">${t.type==='buy'?'🔴 买入':'🟢 卖出'} ${esc(t.fundName)}</span><span class="trade-amount">${t.type==='buy'?'-':'+'}${t.amount.toFixed(2)}元</span></div>
      <div class="trade-info">理由：${esc(t.reason||'没写')}</div>
      <div class="trade-info">当时心情：${mood[t.mood]||t.mood}</div>
      ${t.result?`<div class="trade-info" style="color:var(--c-fund)">事后看：${esc(t.result)}</div>`:`<button class="btn btn-ghost btn-sm mt-8" onclick="addTradeResult('${t.id}')">补写事后复盘</button>`}
      <div class="trade-info text-muted" style="margin-top:4px">${formatDate(t.date)}</div>
    </div>`).join('');
}
function openTradeModal(){
  openModal(`${modalHeader('记一笔操作')}
    <div class="form-group"><label>操作类型</label><div class="pill-select" id="trade-type">
      <div class="pill selected" data-val="buy" onclick="selectPill(this)">🔴 买入</div><div class="pill" data-val="sell" onclick="selectPill(this)">🟢 卖出</div></div></div>
    <div class="form-group"><label>基金名称</label><input class="form-input" id="trade-fund" placeholder="基金名称或代码"></div>
    <div class="form-group"><label>金额（元）</label><input class="form-input" id="trade-amount" type="number" step="0.01" placeholder="1000"></div>
    <div class="form-group"><label>为啥操作</label><textarea class="form-textarea" id="trade-reason" placeholder="为什么买/卖..."></textarea></div>
    <div class="form-group"><label>当时心情</label><div class="pill-select" id="trade-mood">
      <div class="pill selected" data-val="confident" onclick="selectPill(this)">😎 自信</div><div class="pill" data-val="excited" onclick="selectPill(this)">🤩 兴奋</div><div class="pill" data-val="scared" onclick="selectPill(this)">😨 害怕</div><div class="pill" data-val="rational" onclick="selectPill(this)">🧐 理性</div><div class="pill" data-val="greedy" onclick="selectPill(this)">🤑 贪心</div><div class="pill" data-val="panic" onclick="selectPill(this)">😱 恐慌</div></div></div>
    <button class="btn btn-primary btn-block" onclick="addTrade()">记录</button>`);
}
function addTrade(){ DATA.fund.trades.push({ id:uid(),date:todayStr(),type:getPillValue('trade-type'),fundName:document.getElementById('trade-fund').value.trim(),amount:parseFloat(document.getElementById('trade-amount').value)||0,reason:document.getElementById('trade-reason').value.trim(),mood:getPillValue('trade-mood'),result:'' }); saveData(); closeModal(); renderFundTrades(); }
function addTradeResult(id){ const t=DATA.fund.trades.find(x=>x.id===id); if(!t)return;
  openModal(`${modalHeader('事后复盘')}<div class="form-group"><label>现在看这笔操作对不对？</label><textarea class="form-textarea" id="trade-result" placeholder="事后看，这笔操作是赚了还是亏了？当时判断哪里对哪里错？"></textarea></div><button class="btn btn-primary btn-block" onclick="saveTradeResult('${id}')">保存</button>`);
}
function saveTradeResult(id){ const t=DATA.fund.trades.find(x=>x.id===id); if(t){ t.result=document.getElementById('trade-result').value.trim(); saveData(); } closeModal(); renderFundTrades(); }

function renderFundMonthly(){
  const list=DATA.fund.monthly, el=document.getElementById('fund-monthly');
  if(!list.length){ el.innerHTML=emptyHTML('normal','还没有月度账单，新建一个开始~'); return; }
  el.innerHTML=list.slice(-12).reverse().map(m=>`
    <div class="monthly-card">
      <div class="monthly-header"><span class="monthly-month">${m.month}</span><span class="${m.profit>=0?'profit-up':'profit-down'}" style="font-weight:700">${m.profit>=0?'+':''}${m.profit.toFixed(2)}</span></div>
      <div class="monthly-numbers"><div class="monthly-num"><div class="v">${m.income.toFixed(0)}</div><div class="l">收入</div></div><div class="monthly-num"><div class="v">${m.expense.toFixed(0)}</div><div class="l">支出</div></div><div class="monthly-num"><div class="v ${m.profit>=0?'profit-up':'profit-down'}">${m.profit.toFixed(0)}</div><div class="l">盈亏</div></div></div>
      ${m.lessons?`<div class="text-sm text-muted mt-12">📝 ${esc(m.lessons)}</div>`:''}
      <button class="btn btn-ghost btn-sm mt-12" onclick="editMonthly('${m.id}')">编辑</button>
    </div>`).join('');
}
function openMonthlyModal(){
  openModal(`${modalHeader('新建月度账单')}
    <div class="form-group"><label>月份</label><input class="form-input" id="monthly-month" value="${monthStr()}" placeholder="2026-07"></div>
    <div class="form-row"><div class="form-group"><label>收入</label><input class="form-input" id="monthly-income" type="number" step="0.01" value="0" oninput="calcMonthly()"></div><div class="form-group"><label>支出</label><input class="form-input" id="monthly-expense" type="number" step="0.01" value="0" oninput="calcMonthly()"></div></div>
    <div class="form-group"><label>盈亏（自动算）</label><input class="form-input" id="monthly-profit" type="number" step="0.01" value="0" readonly></div>
    <div class="form-group"><label>教训/心得</label><textarea class="form-textarea" id="monthly-lessons" placeholder="这个月赚了还是亏了？学到了啥？"></textarea></div>
    <button class="btn btn-primary btn-block" onclick="addMonthly()">创建</button>`);
}
function calcMonthly(){ const inc=parseFloat(document.getElementById('monthly-income').value)||0, exp=parseFloat(document.getElementById('monthly-expense').value)||0; document.getElementById('monthly-profit').value=(inc-exp).toFixed(2); }
function addMonthly(){ const m={ id:uid(),month:document.getElementById('monthly-month').value.trim()||monthStr(),income:parseFloat(document.getElementById('monthly-income').value)||0,expense:parseFloat(document.getElementById('monthly-expense').value)||0,profit:parseFloat(document.getElementById('monthly-profit').value)||0,lessons:document.getElementById('monthly-lessons').value.trim() }; DATA.fund.monthly.push(m); saveData(); closeModal(); renderFundMonthly(); }
function editMonthly(id){ const m=DATA.fund.monthly.find(x=>x.id===id); if(!m)return;
  DATA.fund.monthly=DATA.fund.monthly.filter(x=>x.id!==id); saveData();
  openModal(`${modalHeader('编辑月度账单 - '+m.month)}
    <div class="form-group"><label>月份</label><input class="form-input" id="monthly-month" value="${m.month}"></div>
    <div class="form-row"><div class="form-group"><label>收入</label><input class="form-input" id="monthly-income" type="number" step="0.01" value="${m.income}" oninput="calcMonthly()"></div><div class="form-group"><label>支出</label><input class="form-input" id="monthly-expense" type="number" step="0.01" value="${m.expense}" oninput="calcMonthly()"></div></div>
    <div class="form-group"><label>盈亏（自动算）</label><input class="form-input" id="monthly-profit" type="number" step="0.01" value="${m.profit}" readonly></div>
    <div class="form-group"><label>教训/心得</label><textarea class="form-textarea" id="monthly-lessons">${esc(m.lessons)}</textarea></div>
    <button class="btn btn-primary btn-block" onclick="addMonthly()">保存</button>`);
}

/* ============================================================
   学点本事
============================================================ */
function renderLearn(){ renderWishlist(); renderSkills(); }
function renderWishlist(){
  const list=DATA.learn.wishlist, el=document.getElementById('learn-wishlist');
  if(!list.length){ el.innerHTML='<p class="text-sm text-muted mb-8">还没想好学啥？闪光灯、视频剪辑、胶片调色、竖笛、钢琴... 丢进来！</p>'; return; }
  el.innerHTML=list.slice(-20).reverse().map(w=>`
    <div class="task-item" style="margin-bottom:6px">
      <div class="task-content"><div class="task-text">📌 ${esc(w.text)}</div><div class="task-meta"><span class="text-sm text-muted">${formatDate(w.date)}加的</span></div></div>
      <button class="btn btn-ghost btn-sm" onclick="promoteWish('${w.id}')">变计划</button>
      <button class="task-delete" onclick="deleteWish('${w.id}')">✕</button>
    </div>`).join('');
}
function openWishlistModal(){
  openModal(`${modalHeader('加一个想学的')}<div class="form-group"><label>想学啥</label><input class="form-input" id="wish-text" placeholder="如：闪光灯 / 视频剪辑 / 胶片调色"></div><button class="btn btn-primary btn-block" onclick="addWish()">加进来</button>`);
}
function addWish(){ const t=document.getElementById('wish-text').value.trim(); if(!t)return; DATA.learn.wishlist.push({id:uid(),text:t,date:todayStr()}); saveData(); closeModal(); renderWishlist(); }
function deleteWish(id){ DATA.learn.wishlist=DATA.learn.wishlist.filter(w=>w.id!==id); saveData(); renderWishlist(); }
function promoteWish(id){ const w=DATA.learn.wishlist.find(x=>x.id===id); if(!w)return;
  openModal(`${modalHeader('变成学习计划')}<p class="text-sm text-muted mb-8">把「${esc(w.text)}」拆成几个小步骤，用逗号分隔：</p><div class="form-group"><label>步骤</label><textarea class="form-textarea" id="skill-steps" placeholder="比如：基础布光, 人像布光, 创意用光">${esc(w.text)}入门, ${esc(w.text)}进阶, ${esc(w.text)}实战</textarea></div><button class="btn btn-primary btn-block" onclick="createSkillFromWish('${id}')">创建计划</button>`);
}
function createSkillFromWish(wid){ const w=DATA.learn.wishlist.find(x=>x.id===wid); if(!w)return; const steps=document.getElementById('skill-steps').value.split(',').map(s=>s.trim()).filter(Boolean); if(!steps.length)return; DATA.learn.skills.push({id:uid(),name:w.text,steps,completedSteps:[],used:false}); DATA.learn.wishlist=DATA.learn.wishlist.filter(x=>x.id!==wid); saveData(); closeModal(); renderLearn(); switchPage('learn'); }

function renderSkills(){
  const list=DATA.learn.skills, el=document.getElementById('learn-skills');
  if(!list.length){ el.innerHTML=emptyHTML('normal','还没有学习计划，想学点啥？'); return; }
  el.innerHTML=list.map(sk=>{
    const pct=(sk.completedSteps.length/sk.steps.length)*100;
    const steps=sk.steps.map((s,i)=>`<div class="skill-step ${sk.completedSteps.includes(i)?'done':''}"><div class="skill-step-dot ${sk.completedSteps.includes(i)?'done':''}" onclick="toggleStep('${sk.id}',${i})">${sk.completedSteps.includes(i)?'✓':''}</div><span class="step-text">${esc(s)}</span></div>`).join('');
    return `<div class="skill-card">
      <div class="skill-header"><span class="skill-name">${esc(sk.name)}</span><span class="skill-pct">${pct.toFixed(0)}%</span></div>
      <div class="progress-bar"><div class="progress-bar-fill" style="width:${pct}%;background:var(--c-learn)"></div></div>
      <div class="skill-steps">${steps}</div>
      <div class="skill-footer">
        <span class="skill-badge ${sk.used?'badge-used':'badge-unused'}">${sk.used?'✅ 已用过':'⏰ 记得去用'}</span>
        <button class="btn btn-ghost btn-sm" style="margin-left:auto" onclick="toggleUsed('${sk.id}')">${sk.used?'标记没用':'标记用过'}</button>
        <button class="task-delete" onclick="deleteSkill('${sk.id}')">✕</button>
      </div>
    </div>`;
  }).join('');
}
function openSkillModal(){
  openModal(`${modalHeader('新建学习计划')}<div class="form-group"><label>技能名称</label><input class="form-input" id="skill-name" placeholder="如：闪光灯"></div><div class="form-group"><label>拆成小步骤（逗号分隔）</label><textarea class="form-textarea" id="skill-steps-new" placeholder="基础布光, 人像布光, 创意用光"></textarea></div><button class="btn btn-primary btn-block" onclick="addSkill()">创建</button>`);
}
function addSkill(){ const name=document.getElementById('skill-name').value.trim(); if(!name)return; const steps=document.getElementById('skill-steps-new').value.split(',').map(s=>s.trim()).filter(Boolean); if(!steps.length)return; DATA.learn.skills.push({id:uid(),name,steps,completedSteps:[],used:false}); saveData(); closeModal(); renderSkills(); }
function toggleStep(id,i){ const sk=DATA.learn.skills.find(x=>x.id===id); if(!sk)return; if(sk.completedSteps.includes(i)){ sk.completedSteps=sk.completedSteps.filter(x=>x!==i); }else{ sk.completedSteps.push(i); } saveData(); renderSkills(); }
function toggleUsed(id){ const sk=DATA.learn.skills.find(x=>x.id===id); if(sk){ sk.used=!sk.used; saveData(); renderSkills(); } }
function deleteSkill(id){ DATA.learn.skills=DATA.learn.skills.filter(s=>s.id!==id); saveData(); renderSkills(); }

/* ============================================================
   孵化池
============================================================ */
const STAGES=['想想而已','调研一下','试试水','正式开干'];
function renderIncubator(){ renderIdeas(); renderProjects(); renderNeeds(); }
function addQuickIdea(){ const inp=document.getElementById('quick-idea-input'); const t=inp.value.trim(); if(!t)return; DATA.incubator.ideas.push({id:uid(),text:t,date:todayStr()}); inp.value=''; saveData(); renderIdeas(); }
function renderIdeas(){
  const list=DATA.incubator.ideas, el=document.getElementById('incubator-ideas');
  if(!list.length){ el.innerHTML='<p class="text-sm text-muted mb-8">想法垃圾桶空着，随时丢进来。</p>'; return; }
  el.innerHTML=list.slice(-20).reverse().map(i=>`<div class="idea-item"><div class="idea-text">${esc(i.text)}</div><div style="display:flex;flex-direction:column;gap:4px;margin-left:4px;flex-shrink:0"><button class="btn btn-primary btn-sm" style="padding:4px 10px;font-size:12px" onclick="aiRefineIdea('${i.id}')">✨ AI细化</button><button class="task-delete" onclick="deleteIdea('${i.id}')">✕</button></div></div>`).join('');
}
function deleteIdea(id){ DATA.incubator.ideas=DATA.incubator.ideas.filter(i=>i.id!==id); saveData(); renderIdeas(); }

function renderProjects(){
  const list=DATA.incubator.projects, el=document.getElementById('incubator-projects');
  if(!list.length){ el.innerHTML=emptyHTML('happy','还没有项目，把想法孵成小鱼！'); return; }
  el.innerHTML=list.map(p=>{
    const pipeline=STAGES.map((s,i)=>`<div class="pipeline-stage ${i<p.stage?'completed':''} ${i===p.stage?'current':''}" onclick="setStage('${p.id}',${i})">${s}</div>`).join('');
    return `<div class="card" style="margin-bottom:10px">
      <div class="flex-between"><span style="font-weight:700;font-size:16px">${esc(p.name)}</span><button class="task-delete" onclick="deleteProject('${p.id}')">✕</button></div>
      ${p.desc?`<div class="text-sm text-muted mt-8">${esc(p.desc)}</div>`:''}
      <div class="pipeline">${pipeline}</div>
      <div class="text-sm text-center" style="color:var(--text-secondary)">当前阶段：${STAGES[p.stage]}</div>
      <button class="btn btn-ghost btn-sm btn-block mt-8" onclick="promoteProject('${p.id}')">➡️ 推进一步</button>
    </div>`;
  }).join('');
}
function openProjectModal(){
  openModal(`${modalHeader('新建项目')}<div class="form-group"><label>项目名称</label><input class="form-input" id="proj-name" placeholder="项目叫啥..."></div><div class="form-group"><label>一句话描述（可选）</label><textarea class="form-textarea" id="proj-desc" placeholder="这项目是干啥的..."></textarea></div><div class="form-group"><label>起始阶段</label><div class="pill-select" id="proj-stage">
    <div class="pill selected" data-val="0" onclick="selectPill(this)">想想而已</div><div class="pill" data-val="1" onclick="selectPill(this)">调研一下</div><div class="pill" data-val="2" onclick="selectPill(this)">试试水</div><div class="pill" data-val="3" onclick="selectPill(this)">正式开干</div></div></div><button class="btn btn-primary btn-block" onclick="addProject()">创建</button>`);
}
function addProject(){ const name=document.getElementById('proj-name').value.trim(); if(!name)return; DATA.incubator.projects.push({id:uid(),name,desc:document.getElementById('proj-desc').value.trim(),stage:parseInt(getPillValue('proj-stage'))||0,date:todayStr()}); saveData(); closeModal(); renderProjects(); }
function setStage(id,i){ const p=DATA.incubator.projects.find(x=>x.id===id); if(p){ p.stage=i; saveData(); renderProjects(); } }
function promoteProject(id){ const p=DATA.incubator.projects.find(x=>x.id===id); if(p){ p.stage=Math.min(3,p.stage+1); saveData(); renderProjects(); } }
function deleteProject(id){ DATA.incubator.projects=DATA.incubator.projects.filter(p=>p.id!==id); saveData(); renderProjects(); }

function renderNeeds(){
  const list=DATA.incubator.needs, el=document.getElementById('incubator-needs');
  if(!list.length){ el.innerHTML=emptyHTML('normal','还没列缺啥，钱？人？技能？'); return; }
  const typeMap={money:['need-money','💰 钱'],people:['need-people','🤝 人'],skill:['need-skill','🎯 技能']};
  el.innerHTML=list.map(n=>{ const t=typeMap[n.type]||typeMap.skill; return `<div class="need-item ${n.met?'met':''}"><div class="need-checkbox ${n.met?'checked':''}" onclick="toggleNeed('${n.id}')">${n.met?'✓':''}</div><span class="need-type ${t[0]}">${t[1]}</span><span class="need-text" style="flex:1">${esc(n.text)}</span><button class="task-delete" onclick="deleteNeed('${n.id}')">✕</button></div>`; }).join('');
}
function openNeedModal(){
  openModal(`${modalHeader('添加缺失资源')}<div class="form-group"><label>类型</label><div class="pill-select" id="need-type">
    <div class="pill selected" data-val="money" onclick="selectPill(this)">💰 钱</div><div class="pill" data-val="people" onclick="selectPill(this)">🤝 人</div><div class="pill" data-val="skill" onclick="selectPill(this)">🎯 技能</div></div></div><div class="form-group"><label>缺啥</label><textarea class="form-textarea" id="need-text" placeholder="比如：还差5000启动资金 / 缺一个会剪辑的搭档..."></textarea></div><button class="btn btn-primary btn-block" onclick="addNeed()">添加</button>`);
}
function addNeed(){ const t=document.getElementById('need-text').value.trim(); if(!t)return; DATA.incubator.needs.push({id:uid(),type:getPillValue('need-type')||'skill',text:t,met:false}); saveData(); closeModal(); renderNeeds(); }
function toggleNeed(id){ const n=DATA.incubator.needs.find(x=>x.id===id); if(n){ n.met=!n.met; saveData(); renderNeeds(); } }
function deleteNeed(id){ DATA.incubator.needs=DATA.incubator.needs.filter(n=>n.id!==id); saveData(); renderNeeds(); }

/* ============================================================
   数据可携带：导出 / 导入 / 后端地址（换电脑用）
============================================================ */
function exportData(){
  const blob=new Blob([JSON.stringify(DATA,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download='workbench-backup-'+todayStr()+'.json';
  document.body.appendChild(a); a.click();
  setTimeout(()=>{ try{document.body.removeChild(a);}catch(e){} URL.revokeObjectURL(url); },100);
  alert('已导出备份文件到「下载」目录。到新电脑打开工作台，点「导入数据」选这个文件即可恢复全部内容。');
}
function importData(file){
  if(!file) return;
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      const p=JSON.parse(reader.result);
      if(typeof p!=='object'||!p) throw new Error('bad');
      const def=getDefaultData();
      for(const k in def){ if(p[k]===undefined) p[k]=def[k]; }
      if(!p.settings) p.settings=def.settings;
      if(!p.settings.styleTags) p.settings.styleTags=def.settings.styleTags;
      DATA=p; saveData();
      alert('导入成功！数据已恢复。');
      const active=document.querySelector('.nav-item.active');
      renderOverview();
      if(active) renderPage(active.dataset.page);
    }catch(e){ alert('导入失败：文件不是有效的工作台备份。'); }
  };
  reader.readAsText(file);
}
function saveBackendUrl(){
  const v=document.getElementById('backend-url-input').value.trim().replace(/\/+$/,'');
  DATA.settings.backendUrl=v; saveData();
  if(v) alert('热点后端地址已设为：'+v+'\n热点将从这个云端地址拉取，不再依赖本机。');
  else alert('已清空，热点将使用内置内容池（每天9点自动更新）。');
}
function saveAccessToken(){
  const v=document.getElementById('access-token-input').value.trim();
  DATA.settings.accessToken=v; saveData();
  if(v) alert('访问令牌已保存，之后所有请求都会自动带它。');
  else alert('已清空，后续请求不再带令牌（仅当后端未开启 ACCESS_TOKEN 时才可用）。');
}
function hotApiBase(){
  const b=(DATA.settings&&DATA.settings.backendUrl||'').replace(/\/+$/,'');
  return b? b+'/api/hot' : '/api/hot';
}

/* ============================================================
   AI 副驾（DeepSeek 代理 /api/ai/chat）
============================================================ */
async function aiChat(system, user, opts={}){
  const silent=!!opts.silent;
  const aiBase=(DATA.settings&&DATA.settings.backendUrl||'').replace(/\/+$/,'')||'';
  const endpoint=aiBase? aiBase+'/api/ai/chat' : '/api/ai/chat';
  const body={ system, user, temperature: opts.temperature==null?0.7:opts.temperature };
  if(opts.json) body.json=true;
  if(!silent) openModal(`<div style="text-align:center;padding:34px 10px"><div style="font-size:34px">🤖</div><div style="margin-top:10px;font-weight:800;font-size:16px">${opts.loading||'AI 思考中'}…</div><div class="text-sm text-muted mt-8">稍等几秒，别关掉</div></div>`);
  try{
    const res=await fetch(endpoint,{method:'POST',headers:apiHeaders(),body:JSON.stringify(body)});
    const data=await res.json().catch(()=>({}));
    if(!res.ok || !data.ok) throw new Error(data.error||('HTTP '+res.status));
    let text=data.text||'';
    if(opts.json){ try{ const j=JSON.parse(text); if(!silent) closeModal(); return j; }catch(e){ if(!silent) closeModal(); return {_raw:text}; } }
    if(!silent) closeModal();
    return text;
  }catch(e){
    if(!silent){
      closeModal();
      let msg='AI 调用失败：'+(e.message||e);
      if(/401|unauthorized|api[_ ]?key|未配置|DeepSeek HTTP 4/i.test(msg)) msg='AI 还没配好：请在 workbench-app/config.json 的 ai.apiKey 填上你的 DeepSeek API key，然后重启 server.js。';
      else if(/Failed to fetch|network/i.test(msg)) msg='连不上后端：确认 server.js 正在运行（node server.js）。';
      alert(msg);
    }
    return null;
  }
}
function copyText(s){ try{ navigator.clipboard.writeText(decodeURIComponent(s)); alert('已复制到剪贴板'); }catch(e){ alert('复制失败'); } }

/* ---- 全局数据上下文（给 AI 喂料） ---- */
function buildGlobalContext(){
  const L=[];
  const tasks=DATA.todayTasks.tasks.filter(t=>t.date===todayStr());
  L.push('【今天任务】'+ (tasks.length? tasks.map(t=>(t.done?'✓':'○')+t.text).join('；') : '暂无'));
  L.push('【摄影风格】'+(DATA.settings.styleTags||[]).join('/'));
  const rev=DATA.photo.reviews.slice(-5);
  L.push('【最近复盘】'+(rev.length? rev.map(r=>(r.platform||'')+' 赞'+(r.likes||0)+' 藏'+(r.saves||0)+' 粉'+(r.followers||0)).join('；') : '无'));
  const hot=DATA.photo.dailyHot.slice(-5);
  L.push('【今日热点】'+(hot.length? hot.map(h=>h.title).join('；') : '无'));
  const pf=DATA.fund.portfolio;
  L.push('【基金持仓】'+(pf.length? pf.map(f=>f.name+' 成本'+f.costPrice+' 现价'+f.currentPrice+' 份额'+f.shares).join('；') : '无'));
  const trades=DATA.fund.trades.slice(-3);
  L.push('【最近操作】'+(trades.length? trades.map(t=>t.type+' '+t.fundName+' '+t.amount+'元').join('；') : '无'));
  const sk=DATA.learn.skills;
  L.push('【学习计划】'+(sk.length? sk.map(s=>s.name+' '+((s.completedSteps.length/s.steps.length*100).toFixed(0))+'%').join('；') : '无'));
  const projs=DATA.incubator.projects;
  L.push('【孵化项目】'+(projs.length? projs.map(p=>p.name+'('+STAGES[p.stage]+')').join('；') : '无'));
  L.push('【想法数】'+(DATA.incubator.ideas.length||0));
  return L.join('\n');
}

/* ============================================================
   孵化池：AI 细化想法成方案
============================================================ */
function aiRefineIdea(id){
  const idea=DATA.incubator.ideas.find(x=>x.id===id); if(!idea) return;
  aiChat(
    '你是一个创业/副业孵化教练，擅长把模糊想法变成可执行方案。用简洁中文输出 JSON，字段：name(项目名，简短有力), oneLiner(一句话定位), whyNow(为什么现在值得做，1句), goals(2-3个具体目标数组), steps(3-5个有序步骤，每步{title,detail}), resources(所需资源数组，如设备/资金/技能/人脉), risks(2-3个主要风险与应对), timeline(大致周期，如"2周出MVP")。只输出 JSON，不要解释。',
    '我的想法：'+idea.text,
    {json:true, loading:'AI 正在把想法细化成方案'}
  ).then(plan=>{
    if(!plan) return;
    if(plan._raw){ alert('AI 返回了非 JSON 内容，已尝试复制原始结果。'); try{navigator.clipboard.writeText(plan._raw);}catch(e){} return; }
    showRefinePlan(idea, plan);
  });
}
function showRefinePlan(idea, plan){
  const goals=(plan.goals||[]).map(g=>`<li>${esc(g)}</li>`).join('');
  const steps=(plan.steps||[]).map((s,i)=>`<div class="skill-step"><div class="skill-step-dot">${i+1}</div><span class="step-text"><b>${esc(s.title)}</b>${s.detail?'：'+esc(s.detail):''}</span></div>`).join('');
  const resources=(plan.resources||[]).map(r=>`<li>${esc(r)}</li>`).join('');
  const risks=(plan.risks||[]).map(r=>`<li>${esc(r)}</li>`).join('');
  openModal(`${modalHeader('✨ AI 细化方案')}
    <div style="font-weight:800;font-size:18px;margin-bottom:2px">${esc(plan.name||idea.text)}</div>
    <div class="text-sm text-muted mb-8">${esc(plan.oneLiner||'')} ${plan.whyNow?'· '+esc(plan.whyNow):''}</div>
    ${goals?`<div class="section-label">目标</div><ul class="text-sm" style="padding-left:18px">${goals}</ul>`:''}
    <div class="section-label">执行步骤</div><div class="skill-steps" style="padding-left:2px">${steps}</div>
    ${resources?`<div class="section-label">所需资源</div><ul class="text-sm" style="padding-left:18px">${resources}</ul>`:''}
    ${risks?`<div class="section-label">风险与应对</div><ul class="text-sm" style="padding-left:18px">${risks}</ul>`:''}
    ${plan.timeline?`<p class="text-sm text-muted mt-8">⏱ 周期：${esc(plan.timeline)}</p>`:''}
    <div class="form-row mt-12">
      <button class="btn btn-ghost" style="flex:1" onclick="closeModal()">先看看</button>
      <button class="btn btn-primary" style="flex:1" onclick="savePlanAsProject('${idea.id}','${encodeURIComponent(JSON.stringify(plan))}')">➡️ 存为项目</button>
    </div>`);
}
function savePlanAsProject(ideaId, planStr){
  let plan; try{ plan=JSON.parse(decodeURIComponent(planStr)); }catch(e){ plan={}; }
  const name=plan.name||'未命名项目';
  const desc=[plan.oneLiner,plan.whyNow].filter(Boolean).join(' · ');
  DATA.incubator.projects.push({id:uid(),name,desc,stage:0,date:todayStr(),
    plan:{ goals:plan.goals||[], steps:plan.steps||[], resources:plan.resources||[], risks:plan.risks||[], timeline:plan.timeline||'' }});
  DATA.incubator.ideas=DATA.incubator.ideas.filter(x=>x.id!==ideaId);
  saveData(); closeModal(); renderIncubator(); switchPage('incubator');
}

/* ============================================================
   今天干啥：AI 安排今日 + 一屏看板播报
============================================================ */
function aiPlanToday(){
  const ctx=buildGlobalContext();
  aiChat(
    '你是我的每日副驾。基于我工作台的全局数据，给我今天最该做的 3-5 件事，按优先级排序。用中文输出 JSON：{focus:"一句话今日重点", items:[{priority:"高/中/低", title:"动作", why:"为什么做", how:"怎么做(具体)", module:"摄影/学习/基金/孵化/其他"}]}。只输出 JSON。',
    '我的全局数据：\n'+ctx,
    {json:true, loading:'AI 正在安排今天的行动'}
  ).then(r=>{
    if(!r) return;
    if(r._raw){ alert('AI 返回非 JSON'); return; }
    showTodayPlan(r);
  });
}
function catFromModule(m){ return ({'摄影':'photo','学习':'learn','基金':'fund','孵化':'other','其他':'other'})[m]||'other'; }
function showTodayPlan(r){
  const items=(r.items||[]).map(it=>`
    <div class="task-item" style="align-items:flex-start">
      <div class="task-checkbox ${it.priority==='高'?'checked':''}" style="${it.priority==='高'?'':'opacity:.4'}"></div>
      <div class="task-content"><div class="task-text">${esc(it.title)} <span class="task-tag tag-${catFromModule(it.module)}">${esc(it.module||'')}</span></div>
      <div class="task-meta"><span class="text-sm text-muted">${esc(it.why||'')}</span></div>
      <div class="text-sm text-muted mt-8">👉 ${esc(it.how||'')}</div></div>
      <button class="btn btn-primary btn-sm" onclick="addAiTask(this,'${encodeURIComponent(JSON.stringify(it))}')">加入</button>
    </div>`).join('');
  openModal(`${modalHeader('✨ 今天该做这些')}
    <div style="font-weight:800;margin-bottom:10px">${esc(r.focus||'')}</div>
    ${items}
    <p class="text-sm text-muted mt-12">点「加入」会作为今日任务添加；优先级高的已标亮。</p>`);
}
function addAiTask(btn, itStr){
  let it; try{ it=JSON.parse(decodeURIComponent(itStr)); }catch(e){ return; }
  DATA.todayTasks.tasks.push({id:uid(),text:it.title,category:catFromModule(it.module),done:false,date:todayStr(),rolled:false,why:it.why,how:it.how});
  saveData();
  btn.textContent='已加入✓'; btn.disabled=true; btn.style.opacity=.6;
  renderToday();
}

function aiGlobalDigest(){
  const ctx=buildGlobalContext();
  return aiChat(
    '你是我的每日播报员。基于工作台全局数据，输出 JSON：{lines:[{icon,text}]}。icon 只能是以下之一：🔥(热点/趋势)、📉(我的数据预警/不足)、💡(建议/灵感)、📌(下一步行动)。共 2-5 条，每条一行，口语、简短，不要写大段文字，text 里不要重复写 icon 符号。例：🔥 今日热点：复古胶片、赛博朋克。只输出 JSON。',
    '我的全局数据： '+ctx,
    {json:true, silent:true, loading:'AI 全局播报'}
  );
}
function renderDigestCard(){
  const el=document.getElementById('overview-digest');
  if(!el) return;
  const d=DATA.settings.aiDigest;
  if(d && d.date===todayStr() && Array.isArray(d.lines) && d.lines.length){ el.innerHTML=digestHTML(d); }
  else { el.innerHTML=`<div class="card-title"><span class="accent-bar"></span>🤖 今日播报</div><p class="text-sm text-muted">每天一屏看全局。点下方按钮让 AI 汇总你的工作台。</p><button class="btn btn-primary btn-block btn-sm mt-8" onclick="runDigest()">✨ 生成今日播报</button>`; }
}
function digestHTML(d){
  const lines=(d.lines||[]).slice(0,5).map(l=>{
    const icon=esc(l.icon||'📌'); const text=esc(l.text||'');
    return `<div class="bc-line"><span class="bc-icon">${icon}</span><span class="bc-text">${text}</span></div>`;
  }).join('');
  return `<div class="card-title"><span class="accent-bar"></span>🤖 今日播报</div>
    <div class="bc-list">${lines}</div>
    <button class="btn btn-ghost btn-block btn-sm mt-8" onclick="runDigest()">🔄 重新生成</button>`;
}
function runDigest(){
  openModal(`<div style="text-align:center;padding:34px 10px"><div style="font-size:34px">🤖</div><div style="margin-top:10px;font-weight:800;font-size:16px">AI 正在生成全局播报…</div></div>`);
  aiGlobalDigest().then(d=>{
    if(!d){ closeModal(); return; }
    if(d._raw){ closeModal(); alert('AI 返回非 JSON'); return; }
    d.date=todayStr();
    DATA.settings.aiDigest=d; saveData();
    closeModal(); renderDigestCard();
  });
}

/* ============================================================
   摄影：AI 复盘 / 策划下一条 / 客片赚钱分析
============================================================ */
function openAiReviewModal(){
  openModal(`${modalHeader('🤖 AI 复盘一条帖子')}
    <div class="form-group"><label>平台</label><div class="pill-select" id="ar-platform">
      <div class="pill selected" data-val="xhs" onclick="selectPill(this)">小红书</div>
      <div class="pill" data-val="douyin" onclick="selectPill(this)">抖音</div></div></div>
    <div class="form-group"><label>帖子主题/标题（可选）</label><input class="form-input" id="ar-theme" placeholder="这条帖子大概讲啥"></div>
    <div class="form-row">
      <div class="form-group"><label>播放/阅读</label><input class="form-input" id="ar-views" type="number" value="0"></div>
      <div class="form-group"><label>点赞</label><input class="form-input" id="ar-likes" type="number" value="0"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>收藏</label><input class="form-input" id="ar-saves" type="number" value="0"></div>
      <div class="form-group"><label>评论</label><input class="form-input" id="ar-comments" type="number" value="0"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>涨粉</label><input class="form-input" id="ar-followers" type="number" value="0"></div>
      <div class="form-group"><label>转化(咨询/成交)</label><input class="form-input" id="ar-conv" type="number" value="0"></div>
    </div>
    <div class="form-group"><label>你的感想（可选）</label><textarea class="form-textarea" id="ar-note" placeholder="你觉得哪点好/不好"></textarea></div>
    <button class="btn btn-primary btn-block" onclick="submitAiReview()">🤖 让 AI 复盘</button>`);
}
async function submitAiReview(){
  const platform=getPillValue('ar-platform');
  const theme=document.getElementById('ar-theme').value.trim();
  const views=parseInt(document.getElementById('ar-views').value)||0;
  const likes=parseInt(document.getElementById('ar-likes').value)||0;
  const saves=parseInt(document.getElementById('ar-saves').value)||0;
  const comments=parseInt(document.getElementById('ar-comments').value)||0;
  const followers=parseInt(document.getElementById('ar-followers').value)||0;
  const conv=parseInt(document.getElementById('ar-conv').value)||0;
  const note=document.getElementById('ar-note').value.trim();
  const recent=(DATA.photo.reviews.slice(-5).map(r=>`${r.platform} 赞${r.likes} 藏${r.saves} 粉${r.followers}`).join('；')||'无');
  const style=(DATA.settings.styleTags||[]).join('/');
  const r=await aiChat(
    '你是小红书/抖音内容复盘专家。基于一条帖子数据，用中文输出 JSON：{score:0-100表现分, summary:"一句话总评", worked:[2-3条做对的地方], improve:[2-3条可优化点], nextAngle:"下一条可以尝试的切入角度"}。只输出 JSON。',
    `我的摄影风格：${style}\n平台：${platform}\n主题：${theme}\n数据：播放/阅读${views} 点赞${likes} 收藏${saves} 评论${comments} 涨粉${followers} 转化${conv}\n我的感想：${note}\n近期其他帖子参考：${recent}`,
    {json:true, loading:'AI 正在复盘这条帖子'}
  );
  if(!r) return;
  if(r._raw){ alert('AI 返回非 JSON'); return; }
  DATA.photo.reviews.push({ id:uid(),date:todayStr(),platform,theme,views,likes,saves,comments,followers,conv,note,
    aiScore:r.score, aiSummary:r.summary, aiWorked:r.worked||[], aiImprove:r.improve||[], aiNext:r.nextAngle });
  saveData(); closeModal(); renderPhotoReviews();
}
function openAiPlanModal(){
  openModal(`${modalHeader('🤖 AI 策划下一条')}
    <div class="form-group"><label>这次想发啥方向？（可选，不填 AI 按你的风格和热点发挥）</label><textarea class="form-textarea" id="ap-brief" placeholder="比如：想拍一组夏日逆光人像，推给本地客户"></textarea></div>
    <button class="btn btn-primary btn-block" onclick="submitAiPlan()">🤖 让 AI 出方案</button>`);
}
async function submitAiPlan(){
  const brief=document.getElementById('ap-brief').value.trim();
  const style=(DATA.settings.styleTags||[]).join('/');
  const hot=(DATA.photo.dailyHot.slice(-5).map(h=>h.title).join('；')||'无');
  const recent=(DATA.photo.reviews.slice(-5).map(r=>`${r.platform} 赞${r.likes} 藏${r.saves} 粉${r.followers}${r.aiNext?(' 下条:'+r.aiNext):''}`).join('；')||'无');
  const r=await aiChat(
    '你是短视频/图文爆款策划。基于我的摄影风格、近期热点和过往复盘，用中文输出下一条内容方案 JSON：{topic:"选题", angle:"独特切入角度", title:"标题/封面文案", hook:"开头3秒钩子", structure:[3-5个内容结构步骤], tags:[3-5个标签], bestTime:"建议发布时间", reason:"为什么这么策划"}。只输出 JSON。',
    `摄影风格：${style}\n近期热点：${hot}\n过往复盘：${recent}\n本次方向：${brief||'（由你发挥）'}`,
    {json:true, loading:'AI 正在策划下一条'}
  );
  if(!r) return;
  if(r._raw){ alert('AI 返回非 JSON'); return; }
  showAiPlan(r);
}
function showAiPlan(r){
  const struct=(r.structure||[]).map((s,i)=>`<div class="skill-step"><div class="skill-step-dot">${i+1}</div><span class="step-text">${esc(s)}</span></div>`).join('');
  const tags=(r.tags||[]).map(t=>`<span class="sample-tag">${esc(t)}</span>`).join('');
  openModal(`${modalHeader('🤖 下一条方案')}
    <div style="font-weight:800;font-size:17px">${esc(r.topic||'')}</div>
    <div class="text-sm text-muted mt-8">${esc(r.angle||'')}</div>
    <div class="section-label">标题/封面</div><div class="card" style="padding:10px;font-weight:600">${esc(r.title||'')}</div>
    <div class="section-label">开头钩子</div><div class="card" style="padding:10px">${esc(r.hook||'')}</div>
    <div class="section-label">内容结构</div><div class="skill-steps" style="padding-left:2px">${struct}</div>
    ${tags?`<div class="section-label">标签</div><div>${tags}</div>`:''}
    <div class="text-sm text-muted mt-8">🕐 ${esc(r.bestTime||'')}</div>
    <div class="mt-8" style="background:#fff4e8;padding:10px;border-radius:10px;border:1px solid rgba(255,159,67,.35)"><b>为什么：</b>${esc(r.reason||'')}</div>
    <div class="form-row mt-12">
      <button class="btn btn-ghost" style="flex:1" onclick="copyText('${encodeURIComponent([r.topic,r.angle,r.title,r.hook,(r.structure||[]).join('\n'),(r.tags||[]).join(' '),r.bestTime,r.reason].filter(Boolean).join('\n\n'))}')">📋 复制文案</button>
      <button class="btn btn-primary" style="flex:1" onclick="saveAiPlanAsInspiration('${encodeURIComponent(JSON.stringify(r))}')">💡 存为灵感</button>
    </div>`);
}
function saveAiPlanAsInspiration(rStr){
  let r; try{ r=JSON.parse(decodeURIComponent(rStr)); }catch(e){ return; }
  DATA.photo.inspirations.push({id:uid(),date:todayStr(),type:'其他',title:(r.topic||'AI 策划')+'：'+(r.title||''),desc:[r.angle,r.hook,r.reason].filter(Boolean).join(' / ')});
  saveData(); closeModal(); renderPhotoInspirations(); switchPage('photo');
}
function aiAnalyzeSamples(){
  const list=DATA.photo.samples;
  if(!list.length){ alert('样片库还是空的，先存几张客片再分析'); return; }
  const data=list.map(s=>`标题:${s.title||'无'} 标签:${s.tags||'无'} 点赞:${s.likes||0} 收藏:${s.saves||0} 涨粉:${s.followers||0} 客片收入:${s.income||0} 借鉴:${s.borrow||''}`).join('\n');
  aiChat(
    '你是摄影接单/客片赚钱分析专家。基于我的样片库数据，用中文输出 JSON：{winningPatterns:[2-4条"什么类型/风格/客片在赚钱"的规律], recommendations:[2-3条"接下来该多拍什么、怎么定价/获客"的建议]}。只输出 JSON。',
    '我的样片库：\n'+data,
    {json:true, loading:'AI 分析啥在赚钱'}
  ).then(r=>{
    if(!r) return;
    if(r._raw){ alert('AI 返回非 JSON'); return; }
    const wp=(r.winningPatterns||[]).map(x=>`<li>${esc(x)}</li>`).join('');
    const rc=(r.recommendations||[]).map(x=>`<li>${esc(x)}</li>`).join('');
    openModal(`${modalHeader('💰 啥在赚钱')}
      <div class="section-label">赚钱规律</div><ul class="text-sm" style="padding-left:18px">${wp}</ul>
      <div class="section-label">行动建议</div><ul class="text-sm" style="padding-left:18px">${rc}</ul>`);
  });
}

/* ============================================================
   基金：AI 复盘
============================================================ */
function aiFundReview(){
  const pf=DATA.fund.portfolio;
  if(!pf.length){ alert('先添加基金持仓，AI 才能复盘'); return; }
  const port=pf.map(f=>{const profit=(f.currentPrice-f.costPrice)*f.shares; const pct=f.costPrice?(f.currentPrice-f.costPrice)/f.costPrice*100:0; return `${f.name}(${f.code}) 份额${f.shares} 成本${f.costPrice} 现价${f.currentPrice} 盈亏${profit.toFixed(2)}(${pct.toFixed(2)}%)`;}).join('\n');
  const trades=DATA.fund.trades.slice(-5).map(t=>`${t.type} ${t.fundName} ${t.amount}元 心情${t.mood||''} 理由:${t.reason||''}${t.result?' 事后:'+t.result:''}`).join('\n')||'无';
  const monthly=DATA.fund.monthly.slice(-3).map(m=>`${m.month} 收入${m.income} 支出${m.expense} 盈亏${m.profit} 心得:${m.lessons||''}`).join('\n')||'无';
  aiChat(
    '你是基金投资复盘教练。基于我的持仓、交易记录、月度账单，用中文输出 JSON：{summary:"一句话总评", performance:"收益表现分析", wins:[1-2条做对的操作], concerns:[1-3条需注意的风险/问题], suggestions:[2-3条具体调仓或操作建议]}。只输出 JSON。',
    `持仓：\n${port}\n近期交易：\n${trades}\n月度账单：\n${monthly}`,
    {json:true, loading:'AI 正在复盘基金'}
  ).then(r=>{
    if(!r) return;
    if(r._raw){ alert('AI 返回非 JSON'); return; }
    showFundReview(r);
  });
}
function showFundReview(r){
  const wins=(r.wins||[]).map(x=>`<li>${esc(x)}</li>`).join('');
  const concerns=(r.concerns||[]).map(x=>`<li>${esc(x)}</li>`).join('');
  const sugs=(r.suggestions||[]).map(x=>`<li>${esc(x)}</li>`).join('');
  openModal(`${modalHeader('🤖 基金 AI 复盘')}
    <div style="font-weight:800;font-size:16px;margin-bottom:8px">${esc(r.summary||'')}</div>
    <div class="text-sm text-muted mb-8">${esc(r.performance||'')}</div>
    ${wins?`<div class="section-label">做对的</div><ul class="text-sm" style="padding-left:18px">${wins}</ul>`:''}
    ${concerns?`<div class="section-label">要注意</div><ul class="text-sm" style="padding-left:18px">${concerns}</ul>`:''}
    ${sugs?`<div class="section-label">建议</div><ul class="text-sm" style="padding-left:18px">${sugs}</ul>`:''}
    <button class="btn btn-primary btn-block mt-12" onclick="saveFundReviewToMonthly('${encodeURIComponent(JSON.stringify(r))}')">📅 存进本月账单心得</button>`);
}
function saveFundReviewToMonthly(rStr){
  let r; try{ r=JSON.parse(decodeURIComponent(rStr)); }catch(e){ return; }
  const month=monthStr();
  let m=DATA.fund.monthly.find(x=>x.month===month);
  const text=`[AI复盘 ${todayStr()}] ${r.summary||''} 建议:${(r.suggestions||[]).join('；')}`;
  if(!m){ m={id:uid(),month,income:0,expense:0,profit:0,lessons:text}; DATA.fund.monthly.push(m); }
  else { m.lessons=(m.lessons?m.lessons+'\n':'')+text; }
  saveData(); closeModal(); renderFundMonthly(); switchPage('fund');
}

/* ============================================================
   发现流：抓爆款客片 → AI 分析 → 左滑丢/右滑收 → 趋势看板
============================================================ */
const DISCOVER_SYS='你是摄影约拍变现分析师。用户是个人摄影师(风格:{STYLE})，正在找"什么客片在赚钱"。对每条爆款客片/约拍相关帖子，输出分析。返回 JSON：{"items":[{"title":"帖子标题","platform":"xhs或douyin","link":"原帖链接(有就填,没有留空)","author":"作者昵称(有就填)","scene":"场景分类(如 情绪人像/婚纱/亲子/毕业照/宠物/闺蜜/私房/旅拍/证件照)","hotScore":1-100热度分,"metrics":"关键数据摘要(如 赞2.1w 藏8k 评600)","titleWords":"标题用了什么词/钩子,1句(如 数字+反差:599拍出2千质感)","visual":"封面构图/色调/场景/氛围,1句","props":"用了什么道具(如 烟花/氛围灯/胶片机),没有写 无","whyHot":"为什么火,1-2句","comments":"评论区在问什么(需求信号),1-2句","theirPrice":"对方定价或推测价位,如 599-999元/套","canFollow":"能跟/慎跟/别跟 + 一句理由(结合用户风格)","cost":"需要的成本(道具/场地/时间),1句","myPrice":"建议用户定价,如 499元/套 + 一句定价逻辑","borrow":"我能怎么借鉴,1-2句可执行的"}]}。只输出 JSON。';

function discoverPending(){ return (DATA.photo.discover.items||[]).filter(i=>i.status==='pending'); }

/* -- 入口1：批量粘贴 → AI 解析+分析 -- */
function openDiscoverImportModal(){
  openModal(`${modalHeader('📥 导入爆款帖子')}
    <p class="text-sm text-muted" style="margin-bottom:8px">刷抖音/小红书看到火的客片帖，把标题、数据、评论区内容随手复制，一次贴多条也行。AI 会自动拆条、分析、排好序推给你。</p>
    <div class="form-group"><textarea class="form-textarea" id="discover-paste" style="min-height:140px" placeholder="例如：\n《在废弃工厂拍的情绪片 姐妹们冲》 赞2.1w 藏8000 评论600+ 评论区都在问在哪拍的多少钱\n《599拍到这种程度真的值》婚纱客片 赞5000 藏1.2w ..."></textarea></div>
    <button class="btn btn-primary btn-block" onclick="submitDiscoverImport()">🤖 AI 解析 + 分析</button>`);
}
async function submitDiscoverImport(){
  const raw=document.getElementById('discover-paste').value.trim();
  if(!raw){ alert('先贴点内容进来'); return; }
  const sys=DISCOVER_SYS.replace('{STYLE}',(DATA.settings.styleTags||[]).join('/'));
  const r=await aiChat(sys,'以下是我搜集的爆款帖子原始内容，请拆条分析：\n'+raw,{json:true,loading:'AI 正在分析这些爆款'});
  if(!r) return;
  const items=(r.items||[]);
  if(!items.length){ alert('AI 没解析出有效帖子，换点更完整的内容再试试'); return; }
  ingestDiscoverItems(items,'paste');
}
/* -- 入口2：数据源抓取（config 配了第三方数据服务就是真自动） -- */
async function discoverFetchFromProvider(){
  try{
    const res=await fetch(hotApiBase()+'/refresh',{method:'POST',headers:apiHeaders()});
    const data=await res.json();
    if(!data.ok||!data.items||!data.items.length){ alert('数据源没返回内容。\n说明：这需要在 config.json 里配置第三方数据服务(如蝉妈妈/新红)的接口。没配的话，用「📥 导入爆款帖子」粘贴导入，效果一样。'); return; }
    const raw=data.items.map(i=>`《${i.title}》 平台:${i.platform} 标签:${i.tags||''} ${i.notes||''}`).join('\n');
    const sys=DISCOVER_SYS.replace('{STYLE}',(DATA.settings.styleTags||[]).join('/'));
    const r=await aiChat(sys,'以下是数据源抓到的热帖，请分析：\n'+raw,{json:true,loading:'AI 正在分析抓到的热帖'});
    if(!r||!(r.items||[]).length){ alert('AI 分析失败，稍后再试'); return; }
    ingestDiscoverItems(r.items,'api');
  }catch(e){ alert('抓取失败：'+(e.message||e)); }
}
function ingestDiscoverItems(items,source,silent){
  const d=DATA.photo.discover;
  const seen=new Set(d.items.map(i=>i.title));
  let added=0;
  items.forEach(it=>{
    if(!it.title || seen.has(it.title)) return; seen.add(it.title); added++;
    d.items.push({ id:uid(), date:todayStr(), source, status:'pending',
      title:it.title||'', platform:it.platform==='douyin'?'douyin':'xhs', scene:it.scene||'其他',
      link:it.link||'', author:it.author||'',
      hotScore:Math.max(1,Math.min(100,parseInt(it.hotScore)||50)), metrics:it.metrics||'',
      titleWords:it.titleWords||'', visual:it.visual||'', props:it.props||'',
      whyHot:it.whyHot||'', comments:it.comments||'', theirPrice:it.theirPrice||'',
      canFollow:it.canFollow||'', cost:it.cost||'', myPrice:it.myPrice||'', borrowHint:it.borrow||'' });
  });
  d.lastFetchDate=todayStr(); saveData();
  if(!silent) closeModal();
  renderDiscover();
  return added;
}
/* -- 入口3：自动收件箱（每日自动化推送到后端，前端打开时拉取） -- */
async function pullDiscoverInbox(){
  try{
    const base=(DATA.settings&&DATA.settings.backendUrl||'').replace(/\/+$/,'')||'';
    const res=await fetch(base+'/api/discover/inbox',{headers:apiHeaders()});
    const data=await res.json();
    const items=(data&&data.items)||[];
    if(!items.length) return;
    const added=ingestDiscoverItems(items,'auto',true);
    await fetch(base+'/api/discover/inbox/clear',{method:'POST',headers:apiHeaders()}).catch(()=>{});
    if(added>0){
      const info=document.getElementById('discover-info');
      if(info) info.textContent=`🚚 自动推送到货 ${added} 条 · 去刷卡`;
    }
  }catch(e){ /* 后端没开就算了，不打扰 */ }
}
/* -- 我的帖子真实数据同步（创作者中心 → 每晚自动化 → 收件箱 → 复盘） -- */
async function pullMypostsInbox(){
  try{
    const base=(DATA.settings&&DATA.settings.backendUrl||'').replace(/\/+$/,'')||'';
    const res=await fetch(base+'/api/myposts/inbox',{headers:apiHeaders()});
    const data=await res.json();
    const items=(data&&data.items)||[];
    if(!items.length) return;
    let added=0, updated=0;
    items.forEach(it=>{
      const pid=it.postId||it.link||it.title; if(!pid) return;
      const old=DATA.photo.reviews.find(r=>r.postId===pid);
      const nums={ views:parseInt(it.views)||0, likes:parseInt(it.likes)||0, saves:parseInt(it.saves)||0, comments:parseInt(it.comments)||0, followers:parseInt(it.followers)||0 };
      if(old){ /* 数据同步：同一帖子只更新数字与 AI 复盘 */
        Object.assign(old,nums,{ syncedAt:todayStr(), aiScore:it.aiScore||old.aiScore, aiSummary:it.aiSummary||old.aiSummary,
          aiWorked:it.aiWorked||old.aiWorked, aiImprove:it.aiImprove||old.aiImprove, aiNext:it.aiNext||old.aiNext });
        updated++;
      }else{
        DATA.photo.reviews.push(Object.assign({ id:uid(), date:it.publishDate||todayStr(), postId:pid, title:it.title||'',
          platform:it.platform==='douyin'?'douyin':'xhs', link:it.link||'', theme:it.title||'', conv:'', note:'', notes:'',
          source:'auto', syncedAt:todayStr(), aiScore:it.aiScore||0, aiSummary:it.aiSummary||'',
          aiWorked:it.aiWorked||[], aiImprove:it.aiImprove||[], aiNext:it.aiNext||'' },nums));
        added++;
      }
    });
    saveData();
    await fetch(base+'/api/myposts/inbox/clear',{method:'POST',headers:apiHeaders()}).catch(()=>{});
    if(added+updated>0){ renderPhotoReviews(); }
  }catch(e){ /* 后端没开就算了 */ }
}

/* -- 刷卡渲染 -- */
function sceneMeta(scene){
  const map={
    '情绪人像':{e:'🌫️',g:'linear-gradient(135deg,#667eea,#764ba2)'},
    '婚纱':{e:'💍',g:'linear-gradient(135deg,#ff9a9e,#fecfef)'},
    '亲子':{e:'👶',g:'linear-gradient(135deg,#f6d365,#fda085)'},
    '旅拍':{e:'🏖️',g:'linear-gradient(135deg,#43cea2,#185a9d)'},
    '国风':{e:'🏮',g:'linear-gradient(135deg,#cb2d3e,#ef473a)'},
    '探店':{e:'☕',g:'linear-gradient(135deg,#ff9966,#ff5e62)'},
    '私房':{e:'🛋️',g:'linear-gradient(135deg,#c471f5,#fa71cd)'},
    '情侣':{e:'💑',g:'linear-gradient(135deg,#ff5f6d,#ffc371)'},
    '写真':{e:'📸',g:'linear-gradient(135deg,#4b6cb7,#182848)'},
    '客片':{e:'🎞️',g:'linear-gradient(135deg,#ee9ca7,#ffdde1)'},
    '海边':{e:'🌊',g:'linear-gradient(135deg,#2193b0,#6dd5ed)'},
    '便携':{e:'🎒',g:'linear-gradient(135deg,#11998e,#38ef7d)'}
  };
  return map[scene]||{e:'✨',g:'linear-gradient(135deg,#4b6cb7,#182848)'};
}
function renderDiscover(){
  const el=document.getElementById('discover-stack'); if(!el) return;
  const pend=discoverPending().sort((a,b)=>b.hotScore-a.hotScore);
  const info=document.getElementById('discover-info');
  if(info){ const d=DATA.photo.discover; info.textContent=pend.length?`待筛 ${pend.length} 条 · 按热度排好了`:(d.lastFetchDate===todayStr()?'今天的都筛完了 ✅':'还没导入今天的爆款'); }
  if(!pend.length){ el.innerHTML=emptyHTML('lazy','没有待筛的爆款了，小鱼在等投喂~'); renderTrendBoard(); return; }
  const c=pend[0];
  const meta=sceneMeta(c.scene);
  const followClass=/^能跟/.test(c.canFollow)?'follow-yes':(/^别跟/.test(c.canFollow)?'follow-no':'');
  el.innerHTML=`
  <div class="discover-card" id="discover-card" style="touch-action:pan-y">
    <div class="dc-cover" style="background:${meta.g}">
      <span class="dc-emoji">${meta.e}</span>
      <div class="dc-top">
        <span class="dc-platform">${c.platform==='douyin'?'抖音':'小红书'}</span>
        <span class="dc-hot">🔥 ${c.hotScore}</span>
      </div>
    </div>
    <div class="dc-body">
      <div class="dc-title">${esc(c.title)}</div>
      <div class="dc-meta">${esc(c.scene)}${c.author?' · @'+esc(c.author):''}${c.metrics?' · '+esc(c.metrics):''}${c.link?` · <a href="${esc(c.link)}" target="_blank" rel="noopener">原帖↗</a>`:''}</div>
      <div class="dc-section why">🔥 <b>为什么火：</b>${esc(c.whyHot)}</div>
      ${c.titleWords?`<div class="dc-section">✍️ <b>标题钩子：</b>${esc(c.titleWords)}</div>`:''}
      ${c.visual?`<div class="dc-section">🎨 <b>封面视觉：</b>${esc(c.visual)}</div>`:''}
      ${c.props&&c.props!=='无'?`<div class="dc-section">🎪 <b>道具：</b>${esc(c.props)}</div>`:''}
      <div class="dc-section">💬 <b>评论区在问：</b>${esc(c.comments)}</div>
      <div class="dc-section">💰 <b>对方定价：</b>${esc(c.theirPrice)}</div>
      <div class="dc-section ${followClass}">✅ <b>能不能跟：</b>${esc(c.canFollow)}</div>
      <div class="dc-section">🧾 <b>成本：</b>${esc(c.cost)}</div>
      <div class="dc-section">🏷️ <b>我该定价：</b>${esc(c.myPrice)}</div>
      <div class="dc-actions">
        <button class="btn btn-ghost" onclick="swipeDiscover('${c.id}',false)">👈 不要</button>
        <button class="btn btn-primary" onclick="swipeDiscover('${c.id}',true)">收录 👉</button>
      </div>
      <p class="text-sm text-muted" style="text-align:center;margin-top:8px">也可以直接左滑丢弃 / 右滑收录</p>
    </div>
  </div>`;
  attachSwipe(document.getElementById('discover-card'),c.id);
  renderTrendBoard();
}
/* -- 手势：左滑丢 右滑收 -- */
function attachSwipe(card,id){
  if(!card) return;
  let sx=0,dx=0,dragging=false;
  const start=x=>{sx=x;dragging=true;card.style.transition='none';};
  const move=x=>{ if(!dragging)return; dx=x-sx; card.style.transform=`translateX(${dx}px) rotate(${dx/22}deg)`; card.style.opacity=String(Math.max(0.35,1-Math.abs(dx)/280)); };
  const end=()=>{ if(!dragging)return; dragging=false;
    if(Math.abs(dx)>90){ const keep=dx>0; card.style.transition='transform .25s,opacity .25s'; card.style.transform=`translateX(${dx>0?500:-500}px) rotate(${dx>0?24:-24}deg)`; card.style.opacity='0'; setTimeout(()=>swipeDiscover(id,keep),220); }
    else { card.style.transition='transform .2s,opacity .2s'; card.style.transform=''; card.style.opacity='1'; }
    dx=0; };
  card.addEventListener('touchstart',e=>start(e.touches[0].clientX),{passive:true});
  card.addEventListener('touchmove',e=>move(e.touches[0].clientX),{passive:true});
  card.addEventListener('touchend',end);
  card.addEventListener('mousedown',e=>{ if(e.target.closest('button'))return; e.preventDefault(); start(e.clientX);
    const mm=e2=>move(e2.clientX), mu=()=>{end();document.removeEventListener('mousemove',mm);document.removeEventListener('mouseup',mu);};
    document.addEventListener('mousemove',mm); document.addEventListener('mouseup',mu); });
}
function swipeDiscover(id,keep){
  const c=(DATA.photo.discover.items||[]).find(i=>i.id===id); if(!c) return;
  c.status=keep?'kept':'skipped'; c.decidedDate=todayStr();
  if(keep){ /* 右滑收录：自动填好所有信息进样片库 */
    const borrowParts=[
      c.borrowHint?`💡借鉴：${c.borrowHint}`:'',
      `🔥为什么火：${c.whyHot}`,
      c.titleWords?`✍️标题钩子：${c.titleWords}`:'',
      c.visual?`🎨视觉：${c.visual}`:'',
      (c.props&&c.props!=='无')?`🎪道具：${c.props}`:'',
      `💬需求：${c.comments}`,`✅${c.canFollow}`,`🧾成本：${c.cost}`,
      `🏷️建议定价：${c.myPrice}（对方${c.theirPrice}）`,
      c.metrics?`📊数据：${c.metrics}`:'',
      c.author?`👤作者：@${c.author}`:''
    ].filter(Boolean).join('｜');
    DATA.photo.samples.push({ id:uid(), date:todayStr(), url:c.link||'', title:c.title, platform:c.platform,
      likes:0,saves:0,followers:0,income:0,
      borrow:borrowParts,
      tags:[c.scene,c.platform==='douyin'?'抖音爆款':'小红书爆款'].join(','), fromDiscover:true });
  }
  saveData(); renderDiscover(); if(keep) renderPhotoSamples();
}

/* -- 趋势看板：本周什么场景在爆、价格在涨 -- */
function priceNum(s){ const m=String(s||'').match(/\d+/g); if(!m)return 0; const n=m.map(Number).filter(x=>x>=50&&x<=50000); return n.length? n.reduce((a,b)=>a+b,0)/n.length : 0; }
function renderTrendBoard(){
  const el=document.getElementById('discover-trend'); if(!el) return;
  const items=(DATA.photo.discover.items||[]);
  const now=Date.now(), DAY=86400000;
  const inDays=(it,a,b)=>{ const t=new Date(it.date).getTime(); return t>now-a*DAY && t<=now-b*DAY; };
  const thisW=items.filter(i=>inDays(i,7,0)), lastW=items.filter(i=>inDays(i,14,7));
  if(!items.length){ el.innerHTML=''; return; }
  const agg=arr=>{ const m={}; arr.forEach(i=>{ const s=i.scene||'其他'; (m[s]=m[s]||{n:0,score:0,price:0,pn:0}); m[s].n++; m[s].score+=i.hotScore||0; const p=priceNum(i.theirPrice); if(p){m[s].price+=p;m[s].pn++;} }); return m; };
  const A=agg(thisW), B=agg(lastW);
  const scenes=Object.keys(A).sort((a,b)=>A[b].n-A[a].n).slice(0,6);
  const maxN=Math.max(1,...scenes.map(s=>A[s].n));
  const rows=scenes.map(s=>{
    const a=A[s], b=B[s];
    const trend=!b? '🆕' : (a.n>b.n?'📈 +'+(a.n-b.n):(a.n<b.n?'📉 '+(a.n-b.n):'➖'));
    const trendCls=!b?'trend-flat':(a.n>b.n?'trend-up':(a.n<b.n?'trend-down':'trend-flat'));
    const priceNow=a.pn? Math.round(a.price/a.pn):0, priceOld=b&&b.pn? Math.round(b.price/b.pn):0;
    let priceTag='';
    if(priceNow){ if(priceOld&&priceNow>priceOld*1.05) priceTag=`<span class="tp-up">💰 ¥${priceNow} ↑</span>`; else if(priceOld&&priceNow<priceOld*0.95) priceTag=`<span class="tp-down">¥${priceNow} ↓</span>`; else priceTag=`<span class="tp-flat">¥${priceNow}</span>`; }
    return `<div class="trend-scene">
      <div class="trend-scene-head"><span class="trend-scene-name">${esc(s)}</span><span class="trend-scene-delta ${trendCls}">${a.n}条 ${trend} ${priceTag}</span></div>
      <div class="trend-bar"><div class="trend-bar-fill" style="width:${Math.round(a.n/maxN*100)}%"></div></div>
    </div>`;
  }).join('');
  const rep=DATA.photo.discover.trendReport;
  el.innerHTML=`<div class="trend-board">
    <div class="trend-title"><span class="accent-bar"></span>📈 本周风向（近7天 vs 上周）</div>
    ${rows||'<p class="text-sm text-muted">本周还没筛过帖子，导入几条就有了</p>'}
    ${rep&&DATA.photo.discover.trendWeek===weekStr()?`<div class="trend-ai">🤖 ${esc(rep)}</div>`:''}
    <button class="btn btn-ghost btn-block btn-sm mt-8" onclick="aiTrendReport()">🤖 AI 读风向</button>
  </div>`;
}
async function aiTrendReport(){
  const items=(DATA.photo.discover.items||[]).filter(i=>{ const t=new Date(i.date).getTime(); return t>Date.now()-14*86400000; });
  if(!items.length){ alert('近两周还没有帖子数据，先导入一些'); return; }
  const feed=items.map(i=>`[${i.date}]${i.scene}|热度${i.hotScore}|${i.theirPrice}|${i.status==='kept'?'已收':'—'}|${i.title}`).join('\n');
  const text=await aiChat(
    '你是摄影市场风向分析师。基于用户近两周筛过的爆款客片数据，用中文输出一段120字以内的风向判断：什么场景在爆、价格在怎么走、用户(风格:'+(DATA.settings.styleTags||[]).join('/')+')下周该押什么。口语化、直接给结论。',
    feed,{loading:'AI 正在读风向'});
  if(!text) return;
  DATA.photo.discover.trendReport=text; DATA.photo.discover.trendWeek=weekStr(); saveData(); renderTrendBoard();
}

/* ============================================================
   INIT
============================================================ */


function weeklyReviewTrend(){
  const revs=DATA.photo.reviews;
  if(!revs.length) return null;
  const now=new Date(); const day=now.getDay()||7; const mon=new Date(now); mon.setDate(now.getDate()-day+1); mon.setHours(0,0,0,0);
  const thisWeek=revs.filter(r=>{ const d=new Date(r.date); return d>=mon; });
  const lastMon=new Date(mon); lastMon.setDate(mon.getDate()-7);
  const lastWeek=revs.filter(r=>{ const d=new Date(r.date); return d>=lastMon && d<mon; });
  const sum=a=>a.reduce((s,r)=>s+(r.likes||0),0);
  const tL=sum(thisWeek), lL=sum(lastWeek);
  if(!tL && !lL) return null;
  let trend='';
  if(lastWeek.length && thisWeek.length){ const dd=Math.round((tL-lL)/Math.max(1,lL)*100); trend=' <span class="'+(dd>=0?'trend-up':'trend-down')+'">'+(dd>=0?'▲':'▼')+Math.abs(dd)+'%</span> 较上周'; }
  return `<div class="flex-between"><div><span class="text-sm text-muted">本周赞数</span> <b style="font-size:18px">${tL}</b></div><div style="text-align:right"><span class="text-sm text-muted">复盘</span> <b>${thisWeek.length}</b> 条${trend}</div></div>`;
}

function renderSettings(){
  const bu=document.getElementById('backend-url-input'); if(bu) bu.value=(DATA.settings.backendUrl||'');
  const at=document.getElementById('access-token-input'); if(at) at.value=(DATA.settings.accessToken||'');
}
function init(){
  loadData();
  autoRollTasks();
  checkDailyHot();
  initTabs();
  renderPage('overview');
  // 启动即从服务端拉取权威数据（服务端为单一数据源：网页版与主屏幕版完全一致）
  syncFromServer(true);
  // 切到后台/刷新前：立即把最新改动推上去（避免丢数据）
  document.addEventListener('visibilitychange',()=>{ if(document.hidden) flushPush(); else syncFromServer(true); });
  window.addEventListener('pagehide', flushPush);
  window.addEventListener('beforeunload', flushPush);
  // 页面常开时每 60 秒对账一次，另一台设备的改动会自动出现
  setInterval(()=>{ syncFromServer(true); }, 60000);
  if(!DATA.settings.aiDigest || DATA.settings.aiDigest.date!==todayStr() || !Array.isArray(DATA.settings.aiDigest.lines)){
    setTimeout(()=>{ aiGlobalDigest().then(d=>{ if(d&&!d._raw){ d.date=todayStr(); DATA.settings.aiDigest=d; saveData(); if(document.getElementById('page-overview').classList.contains('active')) renderDigestCard(); } }); }, 1800);
  }
  refreshAllFundQuotes(); // 打开即拉一次真实净值
  pullDiscoverInbox(); // 打开即收取每日自动化推送的爆款客片
  pullMypostsInbox(); // 打开即收取我的帖子真实数据同步
  setInterval(()=>{
    checkDailyHot();
    if(document.querySelector('.page.active')&&document.querySelector('.page.active').id==='page-photo'){ renderPhotoHot(); }
  }, 60000);
  setInterval(()=>{ refreshAllFundQuotes(); }, 30*60*1000); // 每30分钟刷新净值
}
init();
