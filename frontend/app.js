// 法典 — 前端交互逻辑
const $=s=>document.querySelector(s),$$=s=>document.querySelectorAll(s);
let S={keyOk:false,fileName:null,fileContent:null,textContent:null,pipe:'contract_review',running:false};
const PIPES=[
  {id:'contract_review',name:'标准合同审查',icon:'🔍',steps:'审查官 → 研究员 → 合规顾问'},
  {id:'legal_drafting',name:'法律文书起草',icon:'✍️',steps:'研究员 → 起草员 → 审查官'},
  {id:'full_case_prep',name:'完整案件准备',icon:'⚖️',steps:'审查官 → 分析师 → 证据员 → 合规顾问'}
];
const SM=[
  {n:'审查官',e:'🔍',r:'Creator'},{n:'研究员',e:'📚',r:'Researcher'},{n:'合规顾问',e:'📋',r:'Compliance'},
  {n:'起草员',e:'✍️',r:'Drafter'},{n:'分析师',e:'⚖️',r:'Analyst'},{n:'证据员',e:'📎',r:'Evidence'}
];
const isElectron=!!(window.fadian&&window.fadian.checkKey);

// ── API 调用（自动适配 Electron IPC / 浏览器 HTTP）──
async function api(url,body){
  if(isElectron){
    if(url==='/api/check-key')return window.fadian.checkKey();
    if(url==='/api/save-key')return window.fadian.saveKey(body.apiKey);
    if(url==='/api/run-review')return window.fadian.runReview(body);
    throw new Error('Unknown route: '+url);
  }
  var r=await fetch('http://localhost:28999'+url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  return r.json();
}

// ── 初始化 ──
(async function init(){
  $('#pipeOpts').innerHTML=PIPES.map(function(p,i){
    return '<div class="pipe-opt'+(i===0?' active':'')+'" data-pipe="'+p.id+'"><div class="p-top"><span class="p-icon">'+p.icon+'</span><span class="p-name">'+p.name+'</span></div><div class="p-steps">'+p.steps+'</div></div>';
  }).join('');
  await ckKey();
  bindEvents();
  // 恢复上次审查结果 + 加载历史列表
  if(isElectron){
    try{
      var prev=await window.fadian.loadLatest();
      if(prev&&prev.result){
        showResult(prev.result);
      }
    }catch(e){console.error('[init] loadLatest err:',e)}
    refreshHistoryList();
  }
})();

function bindEvents(){
  $('#pipeOpts').addEventListener('click',function(e){
    var o=e.target.closest('.pipe-opt'); if(!o)return;
    $$('.pipe-opt').forEach(function(x){x.classList.remove('active')});
    o.classList.add('active'); S.pipe=o.dataset.pipe; upBtn();
  });
  $('#uploadZone').addEventListener('click',function(){$('#fileInput').click()});
  $('#uploadZone').addEventListener('dragover',function(e){e.preventDefault();$('#uploadZone').style.borderColor='var(--accent2)'});
  $('#uploadZone').addEventListener('dragleave',function(){$('#uploadZone').style.borderColor=''});
  $('#uploadZone').addEventListener('drop',function(e){e.preventDefault();$('#uploadZone').style.borderColor='';var f=e.dataTransfer.files[0];if(f)hdFile(f)});
  $('#fileInput').addEventListener('change',function(e){var f=e.target.files[0];if(f)hdFile(f)});
  $('#btnSaveKey').addEventListener('click',svKey);
  $('#keyInput').addEventListener('keydown',function(e){if(e.key==='Enter')svKey()});
  $('#btnGo').addEventListener('click',start);
  $('#linkGetKey').addEventListener('click',function(e){e.preventDefault();window.open('https://platform.deepseek.com/api_keys','_blank')});
  // 历史面板
  $('#historyHeader').addEventListener('click',function(){
    var list=$('#historyList');
    var toggle=$('#historyToggle');
    var open=list.classList.contains('open');
    if(open){list.classList.remove('open');toggle.classList.remove('open')}
    else{list.classList.add('open');toggle.classList.add('open');refreshHistoryList()}
  });
  // 导出按钮
  bindExportEvents();
  // 文字输入实时监听
  $('#textInput').addEventListener('input',function(){
    var len=$('#textInput').value.length;
    $('#charCount').textContent=len+' / 50000 字';
    S.textContent=$('#textInput').value.trim()||null;
    S.fileContent=null; S.fileName=null;
    $('#uploadZone').classList.remove('has-file');
    $('#uploadZone').querySelector('.up-icon').textContent='📤';
    $('#uploadZone').querySelector('.up-text').textContent='点击上传合同文件';
    $('#uploadZone').querySelector('.up-hint').innerHTML='拖拽或点击 · 支持 .txt .md .docx';
    if(S.textContent){
      $('#liveStream').textContent='已输入文字内容（'+S.textContent.length+' 字符）';
      $('#emptyState').style.display='none';
      $('#progressPanel').classList.add('visible');
    }
    upBtn();
  });
}

// ── Key 管理 ──
async function ckKey(){
  try{
    var r=await api('/api/check-key');
    console.log('[ckKey]',JSON.stringify(r));
    if(r&&typeof r.hasKey==='boolean')setKey(r.hasKey,r.masked);
  }catch(e){console.error('[ckKey] err:',e)}
  if(isElectron)return;
  try{var r2=await fetch('http://localhost:28999/api/check-key');var d=await r2.json();setKey(d.hasKey)}catch(e2){}
}

function setKey(ok,masked){
  S.keyOk=ok;
  $('#keyDot').className='kdot '+(ok?'ok':'no');
  $('#keyLabel').textContent=ok?('已配置 '+(masked||'')):'未配置 API Key';
  if(ok){$('#keyInput').value='';$('#keyInput').placeholder='已保存，可输入新 Key 替换'}
  setHS(ok?'就绪':'请先配置 API Key',ok);
  upBtn();
}

async function svKey(){
  var k=$('#keyInput').value.trim(); if(!k)return;
  console.log('[svKey] len:',k.length);
  try{
    var r=await api('/api/save-key',{apiKey:k});
    console.log('[svKey] ok:',JSON.stringify(r));
  }catch(e){console.error('[svKey] err:',e);alert('保存失败: '+e.message);return}
  $('#keyInput').value='';
  await ckKey();
}

// ── 文件处理 ──
function hdFile(f){
  var ext=f.name.split('.').pop().toLowerCase();
  if(['txt','md','docx'].indexOf(ext)===-1){alert('支持 .txt .md .docx 格式');return}
  S.fileName=f.name; S.textContent=null;
  $('#textInput').value=''; $('#charCount').textContent='0 / 50000 字';
  var r=new FileReader();
  r.onload=function(e){
    S.fileContent=e.target.result;
    $('#uploadZone').classList.add('has-file');
    $('#uploadZone').querySelector('.up-icon').textContent='✅';
    $('#uploadZone').querySelector('.up-text').textContent='文件已加载';
    $('#uploadZone').querySelector('.up-hint').innerHTML='<span class="file-name">'+f.name+'</span>';
    $('#liveStream').textContent='已加载：'+f.name+'（'+S.fileContent.length+' 字符）';
    $('#emptyState').style.display='none';
    $('#progressPanel').classList.add('visible');
    upBtn();
  };
  r.readAsText(f,'UTF-8');
}

function upBtn(){
  var b=$('#btnGo');
  if(S.running){b.disabled=true;b.classList.add('running');b.textContent='⏳ 审查中...';return}
  b.classList.remove('running');
  if(!S.keyOk){b.disabled=true;b.textContent='请先配置 API Key'}
  else if(!S.fileContent&&!S.textContent){b.disabled=true;b.textContent='请上传合同文件或输入文字'}
  else{b.disabled=false;b.textContent='开始审查'}
}

function setHS(t,ok){
  $('#headerStatus').textContent=t;
  $('.app-header .status .dot').style.background=ok?'var(--ok)':'var(--warn)';
}

function updateStageCard(name,status){
  var card=$('.stage-card[data-s="'+name+'"]');
  if(card){card.className='stage-card '+status;card.querySelector('.sc-badge').textContent=status==='active'?'进行中':'完成'}
}

// ── 审查流程 ──
async function start(){
  if(S.running||(!S.fileContent&&!S.textContent))return;
  S.running=true;upBtn();setHS('审查中...',true);
  $('#progressPanel').classList.add('visible');$('#resultPanel').classList.remove('visible');$('#emptyState').style.display='none';

  var pipe=PIPES.find(function(p){return p.id===S.pipe});
  var sn=pipe.steps.split(' → ');
  var st=[];sn.forEach(function(s){var m=SM.find(function(x){return x.n===s});if(m)st.push(m)});

  $('#stages').innerHTML=st.map(function(s){return '<div class="stage-card pending" data-s="'+s.n+'"><div class="sc-icon">'+s.e+'</div><div class="sc-name">'+s.n+'</div><div class="sc-role">'+s.r+'</div><div class="sc-badge">等待</div></div>'}).join('');
  $('#liveStream').textContent='🚀 启动审查流程...';

  var content=S.fileContent||S.textContent;
  var fileName=S.fileName||('手动输入（'+content.length+'字）');

  var result=null;
  try{
    if(isElectron){
      var si=0;
      (function tick(){
        if(si<st.length){updateStageCard(st[si].n,'active');$('#liveStream').textContent+='\n▶ '+st[si].e+' '+st[si].n}
        setTimeout(function(){
          if(si<st.length){updateStageCard(st[si].n,'done');si++;tick()}
        },800);
      })();
      result=await window.fadian.runReview({content:content,fileName:fileName,pipelineType:S.pipe});
      st.forEach(function(s){updateStageCard(s.n,'done')});
    }else{
      result=await runSSE();
    }
  }catch(err){
    $('#liveStream').textContent+='\n\n❌ '+err.message;
    setHS('审查失败',false);S.running=false;upBtn();return;
  }
  if(result)showResult(result);
  setHS('审查完成 ✅',true);S.running=false;upBtn();
}

async function runSSE(){
  var content=S.fileContent||S.textContent;
  var fileName=S.fileName||('手动输入（'+content.length+'字）');
  var resp=await fetch('http://localhost:28999/api/run-review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:content,fileName:fileName,pipelineType:S.pipe})});
  if(!resp.ok)throw new Error('请求失败 ('+resp.status+')');
  var reader=resp.body.getReader(),decoder=new TextDecoder();
  var buf='',result=null;
  while(true){
    var rd=await reader.read();if(rd.done)break;
    buf+=decoder.decode(rd.value,{stream:true});
    var lines=buf.split('\n');buf=lines.pop()||'';
    var evt=null,data='';
    for(var i=0;i<lines.length;i++){
      var l=lines[i];
      if(l.startsWith('event: '))evt=l.slice(7).trim();
      else if(l.startsWith('data: '))data=l.slice(6);
      else if(l===''&&evt){try{var d=JSON.parse(data);
        if(evt==='progress'){updateStageCard(d.stageName,d.status==='running'?'active':'done');$('#liveStream').textContent+='\n'+(d.status==='running'?'▶':'✅')+' '+d.stageEmoji+' '+d.stageName+(d.status==='done'?' 完成':'')}
        else if(evt==='done')result=d;
        else if(evt==='error')throw new Error(d.error);
      }catch(err){$('#liveStream').textContent+='\n\n❌ '+err.message;S.running=false;upBtn();return null}
      evt=null;data='';}
    }
  }
  return result;
}

// ── 结果展示 ──
function showResult(r){
  lastResult=r;
  // 补全 meta 信息（审查流程中有 S，恢复历史时可能没有）
  lastResult.fileName=lastResult.fileName||S.fileName||('手动输入');
  lastResult.pipelineName=lastResult.pipelineName||(PIPES.find(function(p){return p.id===S.pipe})||PIPES[0]).name;
  $('#progressPanel').classList.remove('visible');$('#resultPanel').classList.add('visible');
  var fn=lastResult.fileName||S.fileName||('手动输入');
  // 根据 pipelineName 反查 icon
  var pipe=PIPES.find(function(p){return p.name===lastResult.pipelineName})||PIPES[0];
  $('#resultMeta').innerHTML='<div class="meta-item">'+pipe.icon+' '+lastResult.pipelineName+'</div><div class="meta-item">⏱ '+(r.elapsedSeconds||'?')+' 秒</div><div class="meta-item">📄 '+fn+'</div>';
  var ss=r.stages||[];
  if(ss.length<=1){$('#resultTabs').style.display='none';$('#resultTabContents').innerHTML='<div class="result-body">'+md2h(r.finalReport||'')+'</div>'}
  else{
    $('#resultTabs').style.display='flex';
    $('#resultTabs').innerHTML=ss.map(function(s,i){return '<button class="result-tab'+(i===ss.length-1?' active':'')+'" data-t="'+i+'">'+s.emoji+' '+s.name+'</button>'}).join('');
    $('#resultTabContents').innerHTML=ss.map(function(s,i){return '<div class="result-tab-content'+(i===ss.length-1?' active':'')+'" data-t="'+i+'"><div class="result-body">'+md2h(s.output)+'</div></div>'}).join('');
    $$('.result-tab').forEach(function(t){t.addEventListener('click',function(){
      $$('.result-tab').forEach(function(x){x.classList.remove('active')});
      $$('.result-tab-content').forEach(function(x){x.classList.remove('active')});
      t.classList.add('active');$('.result-tab-content[data-t="'+t.dataset.t+'"]').classList.add('active');
    })});
  }
  $('#mainContent').scrollTop=0;
  // 刷新历史列表
  refreshHistoryList();
}

// ── 历史列表 ──
async function refreshHistoryList(){
  if(!isElectron)return;
  try{
    var history=await window.fadian.loadHistory();
    var list=$('#historyList');
    if(!history.length){list.innerHTML='<div class="history-item" style="color:var(--text3)">暂无历史记录</div>';return}
    list.innerHTML=history.map(function(h,i){
      var pipeName=PIPES.find(function(p){return p.id===h.pipelineType});
      pipeName=pipeName?pipeName.name:'审查';
      var time=new Date(h.time).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
      var fn=(h.fileName||'').replace(/\.(txt|md|docx)$/i,'');
      return '<div class="history-item" data-idx="'+i+'" onclick="loadHistoryItem('+i+')"><span class="hi-name">'+pipeName+' · '+fn+'</span><span class="hi-time">'+time+'</span></div>';
    }).join('');
  }catch(e){console.error('[refreshHistoryList]',e)}
}

// 暴露到全局作用域供 onclick 使用
window.loadHistoryItem=async function(idx){
  try{
    var history=await window.fadian.loadHistory();
    var item=history[idx];
    if(item&&item.result){
      item.result.fileName=item.fileName;
      item.result.pipelineName=PIPES.find(function(p){return p.id===item.pipelineType}).name;
      showResult(item.result);
      $('#historyList').classList.remove('open');
      $('#historyToggle').classList.remove('open');
    }
  }catch(e){console.error('[loadHistoryItem]',e)}
};

// ── Markdown → HTML ──
function md2h(md){
  if(!md)return'';
  var h=md;
  h=h.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  h=h.replace(/^#### (.+)$/gm,'<h4>$1</h4>');
  h=h.replace(/^### (.+)$/gm,'<h3>$1</h3>');
  h=h.replace(/^## (.+)$/gm,'<h2>$1</h2>');
  h=h.replace(/^# (.+)$/gm,'<h1>$1</h1>');
  h=h.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
  h=h.replace(/\*(.+?)\*/g,'<em>$1</em>');
  h=h.replace(/`([^`]+)`/g,'<code>$1</code>');
  h=h.replace(/^---$/gm,'<hr>');
  h=h.replace(/^&gt; (.+)$/gm,'<blockquote>$1</blockquote>');
  h=h.replace(/^- (.+)$/gm,'<li>$1</li>');
  h=h.replace(/((?:<li>.*<\/li>\n?)+)/g,'<ul>$1</ul>');
  h=h.replace(/^\d+\. (.+)$/gm,'<li>$1</li>');
  h=h.replace(/^\|(.+)\|$/gm,function(line){if(line.match(/^\|[- :|]+\|$/))return'';var cells=line.split('|').filter(function(c){return c.trim()});return'<tr>'+cells.map(function(c){return'<td>'+c.trim()+'</td>'}).join('')+'</tr>'});
  h=h.replace(/\n\n/g,'</p><p>');
  h='<p>'+h+'</p>';
  h=h.replace(/<p><\/(h[1-4]|ul|ol|table|blockquote|hr|tr)>/g,'</$1>');
  h=h.replace(/<(h[1-4]|ul|ol|table|blockquote|hr|tr)><\/p>/g,'<$1>');
  h=h.replace(/<p><\/p>/g,'');
  return h;
}

// ── 导出功能 ──
var lastResult=null;

function bindExportEvents(){
  $('#btnExportMd').addEventListener('click',function(){doExport('md')});
  $('#btnExportDocx').addEventListener('click',function(){doExport('docx')});
  $('#btnExportTxt').addEventListener('click',function(){doExport('txt')});
}

function buildReportMarkdown(r){
  var lines=[];
  var pipeName=r.pipelineName||'标准合同审查';
  lines.push('# '+pipeName+' 报告');
  lines.push('');
  lines.push('> 生成时间：'+new Date().toLocaleString());
  lines.push('> 耗时：'+(r.elapsedSeconds||'?')+' 秒');
  lines.push('');
  var ss=r.stages||[];
  if(!ss.length)return lines.join('\n')+'\n\n'+(r.finalReport||'');
  for(var i=0;i<ss.length;i++){
    var s=ss[i];
    lines.push('## '+s.emoji+' '+s.name);
    lines.push('');
    lines.push(s.output||'(无输出)');
    lines.push('');
  }
  return lines.join('\n');
}

function buildReportText(r){
  var md=buildReportMarkdown(r);
  // 简单去标记
  return md.replace(/^#+ /gm,'').replace(/\*\*/g,'').replace(/\*/g,'').replace(/`/g,'').replace(/^> /gm,'').replace(/^---$/gm,'---');
}

async function doExport(format){
  if(!lastResult){
    alert('没有可导出的报告');
    return;
  }
  var pipeName=lastResult.pipelineName||'审查';
  var fn=lastResult.fileName||('手动输入');
  var content,ext,defaultName,filters;
  if(format==='docx'){
    // docx: 用 html 格式，Word 可打开
    content=buildReportHtml(lastResult);
    ext='docx';
    defaultName=pipeName+'报告_'+fn.replace(/\.[^.]+$/,'')+'.doc';
    filters=[{name:'Word 文档',extensions:['doc','docx']}];
  }else if(format==='md'){
    content=buildReportMarkdown(lastResult);
    ext='md';
    defaultName=pipeName+'报告_'+fn.replace(/\.[^.]+$/,'')+'.md';
    filters=[{name:'Markdown',extensions:['md']}];
  }else{
    content=buildReportText(lastResult);
    ext='txt';
    defaultName=pipeName+'报告_'+fn.replace(/\.[^.]+$/,'')+'.txt';
    filters=[{name:'纯文本',extensions:['txt']}];
  }
  if(isElectron){
    var res=await window.fadian.exportFile({content:content,defaultName:defaultName,filters:filters});
    if(!res.success){
      if(res.error)alert('导出失败: '+res.error);
    }
  }else{
    // 浏览器回退：下载
    var blob=new Blob([content],{type:format==='docx'?'text/html':'text/plain;charset=utf-8'});
    var a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=defaultName;
    a.click();
  }
}

function buildReportHtml(r){
  var pipeName=r.pipelineName||'标准合同审查';
  var h='<html><head><meta charset="UTF-8"><title>'+pipeName+'报告</title>';
  h+='<style>body{font-family:"Noto Sans SC",sans-serif;line-height:1.8;max-width:780px;margin:40px auto;color:#2c2416}h1{border-bottom:2px solid #8b4513;padding-bottom:8px}h2{border-bottom:1px solid #d4ccc2;padding-bottom:6px;margin-top:1.4em}table{width:100%;border-collapse:collapse;margin:16px 0}th,td{border:1px solid #d4ccc2;padding:8px 12px}th{background:#f3f0ec}</style></head><body>';
  h+='<h1>'+pipeName+' 报告</h1>';
  h+='<p>生成时间：'+new Date().toLocaleString()+' | 耗时：'+(r.elapsedSeconds||'?')+' 秒</p>';
  var ss=r.stages||[];
  for(var i=0;i<ss.length;i++){
    h+='<h2>'+ss[i].emoji+' '+ss[i].name+'</h2>';
    h+=md2h(ss[i].output||'(无输出)');
  }
  h+='</body></html>';
  return h;
}
