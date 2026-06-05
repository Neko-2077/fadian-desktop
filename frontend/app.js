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
  $('#progressPanel').classList.remove('visible');$('#resultPanel').classList.add('visible');
  var fn=S.fileName||('手动输入');
  $('#resultMeta').innerHTML='<div class="meta-item">📋 '+(r.pipelineName||'标准合同审查')+'</div><div class="meta-item">⏱ '+(r.elapsedSeconds||'?')+' 秒</div><div class="meta-item">📄 '+fn+'</div>';
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
}

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
