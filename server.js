/* ============================================================
   工作台后端 - server.js（零依赖，Node 18+ 自带 fetch）
   作用：
   1) 托管前端静态文件 (index.html / app.js)
   2) /api/hot/today   -> 返回当天已缓存的热点（前端读取）
   3) /api/hot/refresh -> 立即向第三方数据服务拉取并缓存
   4) 每天 09:00 自动抓取一次，缓存到 data/hot.json
   API key 只存在本服务端，不进前端。
============================================================ */
const http=require('http');
const fs=require('fs');
const path=require('path');

const ROOT=__dirname;
const DATA_DIR=process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT,'data');
const DATA_FILE=path.join(DATA_DIR,'hot.json');
const MIME={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};

/* ---- 配置加载（config.json 可被环境变量覆盖，便于云端部署不泄露密钥） ---- */
let CONFIG={};
try{ CONFIG=JSON.parse(fs.readFileSync(path.join(ROOT,'config.json'),'utf8')); console.log('[cfg] 已加载 config.json'); }
catch(e){
  try{ CONFIG=JSON.parse(fs.readFileSync(path.join(ROOT,'config.example.json'),'utf8')); console.log('[cfg] 未找到 config.json，使用 config.example.json'); }
  catch(e2){ console.error('[cfg] 配置文件缺失，使用默认'); CONFIG={port:56170}; }
}
const PORT=process.env.PORT || CONFIG.port || 56170;

/* 环境变量优先覆盖（部署到云端时把密钥放环境变量，不进仓库） */
const AI={ endpoint: process.env.AI_ENDPOINT || (CONFIG.ai&&CONFIG.ai.endpoint) || 'https://api.deepseek.com/chat/completions',
           apiKey: process.env.AI_API_KEY || (CONFIG.ai&&CONFIG.ai.apiKey) || '',
           model: process.env.AI_MODEL || (CONFIG.ai&&CONFIG.ai.model) || 'deepseek-chat' };
const HOT=Object.assign({}, CONFIG.hot||{});
if(process.env.HOT_ENDPOINT) HOT.endpoint=process.env.HOT_ENDPOINT;
if(process.env.HOT_APIKEY){ HOT.headers=HOT.headers||{}; HOT.headers.Authorization='Bearer '+process.env.HOT_APIKEY; }
const REQUIRED_TOKEN=(process.env.ACCESS_TOKEN || CONFIG.accessToken || '').toString();

try{ fs.mkdirSync(DATA_DIR,{recursive:true}); }catch(e){}

/* ---- 工具 ---- */
function todayStr(){ const d=new Date(); const p=n=>String(n).padStart(2,'0'); return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()); }
function getByPath(o,p){ if(!p) return o; return p.split('.').reduce((a,k)=> (a==null?undefined:a[k]), o); }
function mapPlatform(v,map,def){ if(v==null) return def; const s=String(v).toLowerCase(); return map[s]||def; }
function toTags(v){ if(v==null) return []; if(Array.isArray(v)) return v.map(String); return String(v).split(/[,，、;；|]/).map(s=>s.trim()).filter(Boolean); }

/* 把第三方返回 JSON 归一成我们的结构：{title, platform('douyin'|'xhs'), tags[], notes} */
function normalizeHot(raw,cfg){
  const f=cfg.fields||{};
  const list=getByPath(raw, f.list)||[];
  if(!Array.isArray(list)) return [];
  return list.map(it=>({
    title: getByPath(it,f.title)||'',
    platform: mapPlatform(getByPath(it,f.platform), cfg.platformMap||{}, cfg.defaultPlatform||'xhs'),
    tags: toTags(getByPath(it,f.tags)),
    notes: getByPath(it,f.notes)||''
  })).filter(x=>x.title);
}

async function fetchFromProvider(){
  const cfg=HOT||{};
  const url0=cfg.endpoint;
  if(!url0) throw new Error('未配置 hot.endpoint');
  const q=new URLSearchParams(cfg.query||{});
  const qs=q.toString();
  const url=qs? (url0+(url0.indexOf('?')>=0?'&':'?')+qs) : url0;
  const res=await fetch(url,{ method:(cfg.method||'GET').toUpperCase(), headers:cfg.headers||{} });
  if(!res.ok) throw new Error('第三方接口 HTTP '+res.status);
  const json=await res.json();
  return normalizeHot(json,cfg);
}

/* ---- 本地缓存 ---- */
function loadHot(){ try{ return JSON.parse(fs.readFileSync(DATA_FILE,'utf8')); }catch(e){ return null; } }
/* ---- 全量数据存档（手机/电脑共用一份，最后写入者胜） ---- */
const STATE_FILE=path.join(DATA_DIR,'state.json');
function loadState(){ try{ return JSON.parse(fs.readFileSync(STATE_FILE,'utf8')); }catch(e){ return {updatedAt:0,data:null}; } }
function saveState(s){
  try{
    fs.mkdirSync(DATA_DIR,{recursive:true});
    // 每天首次写入前留一份当日备份，防手滑
    const bak=path.join(DATA_DIR,'state-backup-'+todayStr()+'.json');
    if(fs.existsSync(STATE_FILE) && !fs.existsSync(bak)){ try{ fs.copyFileSync(STATE_FILE,bak); }catch(e){} }
    fs.writeFileSync(STATE_FILE,JSON.stringify(s));
  }catch(e){ console.error('[state] 写入失败',e.message); }
}
/* 合并同步：按条目（id）合并数组，标量取较新方；绝不整包覆盖，避免任一方新增被冲掉 */
function isIdArray(a){ return Array.isArray(a) && (a.length? (a[0]&&a[0].id!==undefined) : true); }
function mergeState(base, incoming){
  const out=JSON.parse(JSON.stringify(base||{}));
  for(const k in (incoming||{})){
    const iv=incoming[k], bv=out[k];
    if(Array.isArray(iv) && Array.isArray(bv)){
      if(isIdArray(iv) && isIdArray(bv)){
        const map={}; bv.forEach(x=>{ if(x&&x.id!==undefined) map[x.id]=x; });
        iv.forEach(x=>{ if(x&&x.id!==undefined) map[x.id]=x; });
        out[k]=Object.values(map); // 按 id 并集，任一方新增都不丢
      }else{
        out[k]=iv; // 原始数组(字符串/数字)取较新方
      }
    }else if(iv && typeof iv==='object' && !Array.isArray(iv) && bv && typeof bv==='object' && !Array.isArray(bv)){
      out[k]=mergeState(bv, iv);
    }else{
      out[k]=iv;
    }
  }
  return out;
}
/* ---- 发现流收件箱（每日自动化推送 → 前端拉取） ---- */
const INBOX_FILE=path.join(DATA_DIR,'discover-inbox.json');
function loadInbox(){ try{ const j=JSON.parse(fs.readFileSync(INBOX_FILE,'utf8')); return {items:Array.isArray(j.items)?j.items:[]}; }catch(e){ return {items:[]}; } }
function saveInbox(data){ try{ fs.writeFileSync(INBOX_FILE,JSON.stringify(data,null,2)); }catch(e){ console.error('[discover] 收件箱写入失败',e.message); } }
/* ---- 我的帖子复盘收件箱（创作者中心真实数据 + AI 复盘） ---- */
const MYPOSTS_FILE=path.join(DATA_DIR,'myposts-inbox.json');
function loadMyposts(){ try{ const j=JSON.parse(fs.readFileSync(MYPOSTS_FILE,'utf8')); return {items:Array.isArray(j.items)?j.items:[]}; }catch(e){ return {items:[]}; } }
function saveMyposts(data){ try{ fs.writeFileSync(MYPOSTS_FILE,JSON.stringify(data,null,2)); }catch(e){ console.error('[myposts] 收件箱写入失败',e.message); } }
function saveHot(items){
  try{ fs.mkdirSync(DATA_DIR,{recursive:true}); }catch(e){}
  fs.writeFileSync(DATA_FILE, JSON.stringify({date:todayStr(), items:items||[]},null,2));
}

/* ---- 每天 09:00 自动抓取 ---- */
function maybeFetch(){
  const now=new Date();
  if(now.getHours()<9) return;
  const stored=loadHot();
  if(stored && stored.date===todayStr()) return;
  fetchFromProvider()
    .then(items=>{ if(items&&items.length){ saveHot(items); console.log('[hot] 已缓存 '+items.length+' 条当天热点'); } })
    .catch(e=>console.error('[hot] 抓取失败:', e.message));
}
setInterval(maybeFetch, 60*1000);
maybeFetch();

/* ---- 读取请求体 ---- */
function readBody(req){
  return new Promise((resolve,reject)=>{
    let b=''; req.on('data',c=>b+=c); req.on('end',()=>{ try{ resolve(b?JSON.parse(b):{}); }catch(e){ reject(e); } }); req.on('error',reject);
  });
}

/* ---- AI 代理（OpenAI 兼容，DeepSeek 等） ---- */
async function handleAiChat(req,res){
  let body={};
  try{ body=await readBody(req); }catch(e){ return res.end(JSON.stringify({ok:false,error:'请求体解析失败'})); }
  const ai=AI;
  if(!ai.apiKey || ai.apiKey==='YOUR_DEEPSEEK_API_KEY'){
    return res.end(JSON.stringify({ok:false,error:'AI 未配置：请在 config.json 的 ai.apiKey 填入你的 DeepSeek API key 后重启服务。'}));
  }
  const endpoint=ai.endpoint||'https://api.deepseek.com/chat/completions';
  const model=ai.model||'deepseek-chat';
  const messages=[
    {role:'system',content:String(body.system||'你是一个有用的中文助手。')},
    {role:'user',content:String(body.user||'')}
  ];
  const payload={ model, messages, temperature: (body.temperature==null?0.7:body.temperature) };
  if(body.json) payload.response_format={type:'json_object'};
  try{
    const r=await fetch(endpoint,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+ai.apiKey},
      body:JSON.stringify(payload)
    });
    if(!r.ok){
      const t=await r.text().catch(()=> '');
      return res.end(JSON.stringify({ok:false,error:'DeepSeek HTTP '+r.status+' '+(t||'').slice(0,200)}));
    }
    const j=await r.json();
    const text=(j.choices&&j.choices[0]&&j.choices[0].message)?j.choices[0].message.content:'';
    return res.end(JSON.stringify({ok:true,text}));
  }catch(e){
    return res.end(JSON.stringify({ok:false,error:String(e.message||e)}));
  }
}

/* ---- 访问令牌校验（仅在设置了 ACCESS_TOKEN / config.accessToken 时启用） ---- */
function tokenOk(req,u){
  if(!REQUIRED_TOKEN) return true;
  const h=(req.headers['x-access-token']||'').toString();
  const q=(u.searchParams.get('token')||'').toString();
  return h===REQUIRED_TOKEN || q===REQUIRED_TOKEN;
}
/* ---- HTTP 服务 ---- */
function serve(res, p){
  const fp=path.normalize(path.join(ROOT,p));
  if(fp!==path.join(ROOT,p) || !fp.startsWith(ROOT)){ res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(fp,(err,data)=>{
    if(err){ res.writeHead(404); return res.end('not found'); }
    const ext=path.extname(fp);
    const noCache=['.html','.js','.css'].includes(ext);
    const headers={'Content-Type':MIME[ext]||'application/octet-stream'};
    // 关键：HTML/JS/CSS 不缓存，保证“添加到主屏幕”的 PWA 始终拉最新代码，避免旧版同步逻辑作祟
    if(noCache) headers['Cache-Control']='no-cache, no-store, must-revalidate';
    res.writeHead(200,headers);
    res.end(data);
  });
}
async function handleApi(req,res,u){
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin','*');
  if(u.pathname==='/api/health'){ return res.end(JSON.stringify({ok:true,ts:Date.now()})); }
  if(!tokenOk(req,u)){ res.statusCode=401; return res.end(JSON.stringify({ok:false,error:'需要访问令牌 (ACCESS_TOKEN)'})); }
  if(u.pathname==='/api/hot/today'){ return res.end(JSON.stringify(loadHot()||{date:null,items:[]})); }
  if(u.pathname==='/api/hot/refresh' && req.method==='POST'){
    try{ const items=await fetchFromProvider(); saveHot(items); return res.end(JSON.stringify({ok:true,items})); }
    catch(e){ return res.end(JSON.stringify({ok:false,error:String(e.message||e)})); }
  }
  if(u.pathname==='/api/ai/chat' && req.method==='POST'){ return handleAiChat(req,res); }
  /* ---- 全量数据同步：GET 拉取 / POST 覆盖（带 updatedAt 防旧盖新） ---- */
  if(u.pathname==='/api/state' && req.method==='GET'){ return res.end(JSON.stringify(loadState())); }
  if(u.pathname==='/api/state' && req.method==='POST'){
    try{
      const body=await readBody(req);
      if(!body || !body.data) return res.end(JSON.stringify({ok:false,error:'data 为空'}));
      const cur=loadState();
      if((body.updatedAt||0) < (cur.updatedAt||0)){
        return res.end(JSON.stringify({ok:false,stale:true,updatedAt:cur.updatedAt}));
      }
      // 合并而不是整包覆盖：保留另一台设备已存在、本机没有的条目（如基金/笔记）
      const merged=mergeState(cur.data||{}, body.data||{});
      saveState({updatedAt:body.updatedAt||Date.now(),data:merged});
      return res.end(JSON.stringify({ok:true}));
    }catch(e){ return res.end(JSON.stringify({ok:false,error:String(e.message||e)})); }
  }
  /* ---- 发现流收件箱：外部（每日自动化）推送分析好的爆款条目，前端打开时拉取 ---- */
  if(u.pathname==='/api/discover/ingest' && req.method==='POST'){
    try{
      const body=await readBody(req);
      const items=Array.isArray(body.items)?body.items:[];
      if(!items.length) return res.end(JSON.stringify({ok:false,error:'items 为空'}));
      const inbox=loadInbox();
      const seen=new Set(inbox.items.map(i=>i.title));
      let added=0;
      items.forEach(i=>{ if(i.title && !seen.has(i.title)){ inbox.items.push(Object.assign({pushedAt:new Date().toISOString()},i)); seen.add(i.title); added++; } });
      saveInbox(inbox);
      console.log('[discover] 收件箱新增 '+added+' 条（共 '+inbox.items.length+' 条待拉取）');
      return res.end(JSON.stringify({ok:true,added,total:inbox.items.length}));
    }catch(e){ return res.end(JSON.stringify({ok:false,error:String(e.message||e)})); }
  }
  if(u.pathname==='/api/discover/inbox'){ return res.end(JSON.stringify(loadInbox())); }
  if(u.pathname==='/api/discover/inbox/clear' && req.method==='POST'){
    saveInbox({items:[]}); return res.end(JSON.stringify({ok:true}));
  }
  /* ---- 我的帖子复盘收件箱：每晚自动化推送创作者中心真实数据+AI复盘，前端拉取合并进复盘 ---- */
  if(u.pathname==='/api/myposts/ingest' && req.method==='POST'){
    try{
      const body=await readBody(req);
      const items=Array.isArray(body.items)?body.items:[];
      if(!items.length) return res.end(JSON.stringify({ok:false,error:'items 为空'}));
      const inbox=loadMyposts();
      const key=i=>(i.postId||i.title||'')+'@'+(i.publishDate||'');
      const seen=new Set(inbox.items.map(key));
      let added=0;
      items.forEach(i=>{ const k=key(i); if(k!=='@' && !seen.has(k)){ inbox.items.push(Object.assign({pushedAt:new Date().toISOString()},i)); seen.add(k); added++; } });
      saveMyposts(inbox);
      console.log('[myposts] 收件箱新增 '+added+' 条（共 '+inbox.items.length+' 条待拉取）');
      return res.end(JSON.stringify({ok:true,added,total:inbox.items.length}));
    }catch(e){ return res.end(JSON.stringify({ok:false,error:String(e.message||e)})); }
  }
  if(u.pathname==='/api/myposts/inbox'){ return res.end(JSON.stringify(loadMyposts())); }
  if(u.pathname==='/api/myposts/inbox/clear' && req.method==='POST'){
    saveMyposts({items:[]}); return res.end(JSON.stringify({ok:true}));
  }
  res.writeHead(404); res.end('{}');
}
const server=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://localhost');
  if(u.pathname.startsWith('/api/')){ return handleApi(req,res,u); }
  if(u.pathname==='/'){ return serve(res,'/index.html'); }
  serve(res,u.pathname);
});
server.listen(PORT,()=>console.log('[server] 工作台后端已启动 -> http://localhost:'+PORT));
