let profile,labels,csrf,currentRevision,busy=false,dirty=false;
const $=s=>document.querySelector(s);
const longFields=new Set(['summary','skills','education_text','experience_text','projects','cover_letter','work_description']);
function status(text,error=false){$('#status').textContent=text;$('#status').classList.toggle('error',error);}
function changed(){dirty=true;}
async function task(fn){if(busy){status('正在处理，请等待当前操作完成。');return;}busy=true;const controls=Array.from(document.querySelectorAll('button,input,textarea,select'));controls.forEach(x=>x.disabled=true);try{await fn();}catch(e){status(e.message,true);}finally{busy=false;controls.forEach(x=>x.disabled=false);}}
function customRow(item={label:'',value:''}){
  const row=document.createElement('div');row.className='custom-row';
  const name=document.createElement('input');name.placeholder='例如：第二段实习公司';name.value=item.label;name.maxLength=100;name.setAttribute('aria-label','自定义字段名称');
  const value=document.createElement('textarea');value.placeholder='填写内容';value.value=item.value;value.maxLength=30000;value.setAttribute('aria-label','自定义字段内容');
  const remove=document.createElement('button');remove.type='button';remove.className='secondary';remove.textContent='删除';remove.onclick=()=>{row.remove();changed();};
  row.append(name,value,remove);$('#custom').append(row);
}
function render(p){
  profile=p;$('#title').value=p.title;$('#fields').replaceChildren();$('#custom').replaceChildren();
  for(const [key,label]of Object.entries(labels)){
    const wrap=document.createElement('label');wrap.textContent=label;const input=document.createElement(longFields.has(key)?'textarea':'input');input.value=p.fields[key]||'';input.dataset.key=key;input.maxLength=30000;
    if(longFields.has(key))wrap.className='wide';wrap.append(input);$('#fields').append(wrap);
  }for(const item of p.custom||[])customRow(item);
}
function collect(){
  const p={version:1,title:$('#title').value||'我的简历',fields:{},custom:[]};
  for(const el of document.querySelectorAll('[data-key]'))p.fields[el.dataset.key]=el.value.trim();
  for(const row of document.querySelectorAll('.custom-row')){
    const label=row.querySelector('input').value.trim(),value=row.querySelector('textarea').value.trim();
    if(!label&&value)throw Error('有一项自定义内容没有字段名称，请补充名称后保存。');if(label)p.custom.push({label,value});
  }return p;
}
function review(p){
  const f=p.fields,warnings=[];
  if(f.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email))warnings.push('邮箱格式可能有误');
  if(f.phone&&!/^\+?[\d ()-]{6,25}$/.test(f.phone))warnings.push('手机号格式需要核对');
  for(const key of ['website','github','linkedin'])if(f[key]&&!/^https?:\/\/[^\s]+$/i.test(f[key]))warnings.push((labels[key]||key)+'建议加上 https://');
  return warnings;
}
async function post(path,body,headers={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);
  try{const res=await fetch(path,{method:'POST',signal:controller.signal,headers:{'X-ResumeFill-Token':csrf,...(currentRevision?{'X-ResumeFill-Revision':currentRevision}:{}),...headers},body});let result;try{result=await res.json();}catch{throw Error('本地服务没有返回有效结果。请关闭旧的启动窗口，重新运行最新版 start.bat。');}if(!res.ok)throw Error(result.error||'操作失败');return result;}
  catch(e){if(e.name==='AbortError')throw Error('处理超过 60 秒，请重试，或从 PDF 复制文字到“粘贴简历文字”中识别。');if(e instanceof TypeError)throw Error('无法连接本地服务，请确认 start.bat 的窗口仍然开着。');throw e;}
  finally{clearTimeout(timer);}
}
function download(p,name){const url=URL.createObjectURL(new Blob([JSON.stringify(p,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function refreshBackups(){
  const res=await fetch('/api/backups');if(!res.ok)throw Error('读取备份失败。');const r=await res.json();$('#backups').replaceChildren();
  for(const x of r.backups){const o=document.createElement('option');o.value=x.id;o.textContent=new Date(x.time).toLocaleString()+' · '+x.title;$('#backups').append(o);}
  if(!r.backups.length){const o=document.createElement('option');o.value='';o.textContent='暂无备份，修改后再次保存会生成';$('#backups').append(o);}
}
async function save(){
  const p=collect(),warnings=review(p);if(warnings.length&&!confirm('请核对：\n'+warnings.join('\n')+'\n仍然保存？'))return null;
  const r=await post('/api/save',JSON.stringify(p),{'Content-Type':'application/json'});profile=r.profile;currentRevision=r.revision;dirty=false;
  try{await refreshBackups();}catch{status('资料已保存，但备份列表刷新失败，请稍后点击刷新。');return profile;}
  status('已保存。历史版本可在自动备份区查看。更新插件资料需重新导入 JSON。');return profile;
}
function uploadFeedback(message,error=false){$('#uploadFeedback').textContent=message;$('#uploadFeedback').classList.toggle('error',error);}
function acceptImport(r,source){
  let next=r.profile;
  const count=r.field_count??Object.values(next.fields).filter(Boolean).length+next.custom.length;let kept=0;
  if($('#merge').checked){const current=collect();for(const [k,v]of Object.entries(current.fields))if(v){next.fields[k]=v;kept++;}const used=new Set(current.custom.map(x=>x.label));next.custom=[...current.custom,...next.custom.filter(x=>!used.has(x.label))];if(Object.values(current.fields).some(Boolean))next.title=current.title;}
  else if(dirty&&!confirm('导入将替换未保存的编辑内容，继续？'))return;
  render(next);dirty=true;$('#raw').textContent=r.text;
  let message=`已读取：${source}\n识别 ${count} 项资料，${r.text.length} 字原文。请核对下方字段后保存。`;
  if(kept)message+=`\n合并模式保留了 ${kept} 个已有字段。需要换成新简历时，请取消“只补充空白字段”，再点“重新读取所选文件”。`;
  if(count<3){message+='\n自动匹配较少。请展开原文检查文字是否完整；也可复制 PDF 文字到粘贴框重试。';$('#raw').parentElement.open=true;}
  uploadFeedback(message,count<3);status(message,count<3);
}
async function importSelected(){
  const file=$('#resume').files[0];if(!file){uploadFeedback('请先选择文件。',true);return;}
  return task(async()=>{
    uploadFeedback(`已选择：${file.name}\n正在读取，请稍候…`);status('正在本地解析…');
    try{if(file.size>12*1024*1024)throw Error('文件最大 12 MB。');const r=await post('/api/import',file,{'X-Filename':encodeURIComponent(file.name),'Content-Type':'application/octet-stream'});acceptImport(r,file.name);}
    catch(e){uploadFeedback(`读取失败：${file.name}\n${e.message}`,true);throw e;}
  });
}
$('#resume').onchange=importSelected;$('#retryImport').onclick=importSelected;
$('#parseText').onclick=()=>task(async()=>{const text=$('#pasteText').value;if(!text.trim())throw Error('请先粘贴简历文字。');uploadFeedback('正在识别粘贴的文字…');try{const r=await post('/api/parse-text',JSON.stringify({text}),{'Content-Type':'application/json'});acceptImport(r,'粘贴文字');}catch(e){uploadFeedback(e.message,true);throw e;}});
$('#add').onclick=()=>{if(document.querySelectorAll('.custom-row').length>=100)return status('自定义字段最多 100 个。',true);customRow();changed();};
$('#editor').onsubmit=e=>e.preventDefault();$('#editor').oninput=changed;$('#title').oninput=changed;
$('#save').onclick=()=>task(save);
$('#export').onclick=()=>task(async()=>{const p=await save();if(!p)return;download(p,'resumefill-profile.json');status('已下载 JSON。打开插件导入即可，可保存多个岗位版本。');});
$('#draft').onclick=()=>task(async()=>{download(collect(),'resumefill-draft.json');status('已下载当前草稿，尚未覆盖本地已保存资料。');});
$('#refreshBackups').onclick=()=>task(refreshBackups);
$('#restore').onclick=()=>task(async()=>{const id=$('#backups').value;if(!id)throw Error('尚无可恢复的备份。');if(!confirm('恢复选中的备份？未保存的编辑内容将替换，磁盘当前版会先备份。'))return;const r=await post('/api/restore',JSON.stringify({id}),{'Content-Type':'application/json'});render(r.profile);currentRevision=r.revision;dirty=false;$('#raw').textContent='已恢复备份，原文不包含在备份中。';await refreshBackups();status('已恢复备份。要更新插件，请重新下载并导入 JSON。');});
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
task(async()=>{const res=await fetch('/api/profile');if(!res.ok)throw Error('读取失败');const r=await res.json();labels=r.labels;csrf=r.csrf;currentRevision=r.revision;render(r.profile);await refreshBackups();status(r.warning||'已就绪。可以导入简历，也可以直接编辑资料。',!!r.warning);});
