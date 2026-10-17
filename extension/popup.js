let profile,fieldLabels={},profiles={},currentId='',preview=null,busy=false;
const $=s=>document.querySelector(s),status=t=>$('#status').textContent=t;
const labels={name:'姓名',first_name:'英文名',last_name:'英文姓',email:'邮箱',phone:'手机',city:'城市',address:'地址',postcode:'邮编',linkedin:'LinkedIn',github:'GitHub',website:'个人网站',job_title:'意向职位',availability:'到岗时间',summary:'自我评价',skills:'技能',school:'学校',degree:'学历',major:'专业',graduation:'毕业时间',company:'公司',position:'任职职位',work_description:'工作职责',education_text:'完整教育经历',experience_text:'完整工作经历',projects:'项目经历',cover_letter:'求职信'};
function valid(p){
  if(!p||typeof p!=='object'||!p.fields||typeof p.fields!=='object'||Array.isArray(p.fields))throw Error('请选择本工具导出的资料 JSON。');
  if(p.title!==undefined&&(typeof p.title!=='string'||p.title.length>100))throw Error('资料名称最多 100 字。');
  const fields={};for(const [k,v]of Object.entries(p.fields)){if(!Object.hasOwn(labels,k))continue;if(typeof v!=='string'||v.length>30000)throw Error('字段格式有误或超过 30000 字。');fields[k]=v;}
  const custom=p.custom||[];if(!Array.isArray(custom)||custom.length>100||custom.some(x=>!x||typeof x.label!=='string'||typeof x.value!=='string'||x.label.length>100||x.value.length>30000))throw Error('自定义字段格式有误。');
  return {version:1,title:p.title||'我的简历',fields,custom};
}
function invalidate(){preview=null;$('#preview').hidden=true;$('#rows').replaceChildren();}
function render(){
  profile=profiles[currentId];invalidate();$('#profiles').replaceChildren();
  for(const [id,p]of Object.entries(profiles)){const o=document.createElement('option');o.value=id;o.textContent=p.title;$('#profiles').append(o);}$('#profiles').value=currentId;
  $('#profile').textContent=profile?`当前：${profile.title}（共 ${Object.keys(profiles).length} 份）`:'尚未导入资料';renderFields();
}
function renderFields(){
  $('#field').replaceChildren();fieldLabels={};const q=$('#filter').value.toLowerCase().trim();
  const add=(k,label,value)=>{if(value&&(!q||(k+' '+label+' '+value).toLowerCase().includes(q)))fieldLabels[k]={label,value};};
  if(profile){for(const [k,v]of Object.entries(profile.fields))add(k,labels[k]||k,v);(profile.custom||[]).forEach((x,i)=>add('custom:'+i,x.label,x.value));}
  for(const [key,item]of Object.entries(fieldLabels)){const o=document.createElement('option');o.value=key;o.textContent=item.label;$('#field').append(o);}updateValue();
}
function updateValue(){$('#value').value=fieldLabels[$('#field').value]?.value||'';}
async function task(fn){if(busy)return;busy=true;const buttons=Array.from(document.querySelectorAll('button,select,input'));buttons.forEach(x=>x.disabled=true);try{await fn();}catch(e){status(e.message);}finally{busy=false;buttons.forEach(x=>x.disabled=false);document.querySelectorAll('#rows input[data-locked]').forEach(x=>x.disabled=true);}}
async function action(name,payload={}){
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(!tab?.id)throw Error('没有当前网页。');
  try{
    await chrome.scripting.executeScript({target:{tabId:tab.id},files:['engine.js','content.js']});
    const result=await chrome.scripting.executeScript({target:{tabId:tab.id},func:(a,p)=>globalThis.__resumeFill.run(a,p),args:[name,payload]});
    const data=result[0]?.result;if(!data)throw Error('页面没有返回结果');status(data.message);return data;
  }catch(e){throw Error('操作未完成：'+e.message+'。请在普通网页使用；页面刷新或插件更新后请重新扫描。');}
}
function requireProfile(){if(!profile)throw Error('请先导入资料 JSON。');return {profile,profileId:currentId,overwrite:$('#overwrite').checked};}
function showPreview(data){
  preview=data;$('#rows').replaceChildren();$('#preview').hidden=false;
  for(const item of data.items){
    const row=document.createElement('label');row.className='preview-row';const check=document.createElement('input');check.type='checkbox';check.value=item.id;check.checked=item.eligible;check.disabled=!item.eligible;if(!item.eligible)check.dataset.locked='true';
    const text=document.createElement('div'),title=document.createElement('b'),detail=document.createElement('small');
    title.textContent=item.label;detail.textContent=item.eligible?`${item.source} · ${labels[item.key]||'自定义字段'}\n原值：${item.old||'（空）'}\n将填：${item.value}`:item.reason;
    text.append(title,detail);row.append(check,text);$('#rows').append(row);
  }
}
$('#profiles').onchange=()=>task(async()=>{currentId=$('#profiles').value;await chrome.storage.local.set({currentId});render();status('已切换版本。字段记忆按版本独立保存。');});
$('#field').onchange=updateValue;$('#filter').oninput=renderFields;$('#overwrite').onchange=invalidate;
$('#import').onchange=e=>{const file=e.target.files[0];task(async()=>{
  if(!file)return;if(file.size>12*1024*1024)throw Error('JSON 最大 12 MB。');const next=valid(JSON.parse(await file.text()));
  const replace=$('#replace').checked&&currentId&&profiles[currentId];if(!replace&&Object.keys(profiles).length>=10)throw Error('最多 10 份，请删除一份，或勾选更新当前版本。');
  const id=replace?currentId:crypto.randomUUID(),nextProfiles={...profiles,[id]:next};
  const r=await chrome.storage.local.get('mappingProfiles'),maps=r.mappingProfiles||{};delete maps[id];
  await chrome.storage.local.set({profiles:nextProfiles,currentId:id,mappingProfiles:maps});profiles=nextProfiles;currentId=id;$('#filter').value='';render();status('已导入。该版本的字段记忆已重置。');
}).finally(()=>e.target.value='');};
$('#scan').onclick=()=>task(async()=>showPreview(await action('scan',requireProfile())));
$('#apply').onclick=()=>task(async()=>{if(!preview)throw Error('请先扫描。');const ids=Array.from(document.querySelectorAll('#rows input:checked:not([data-locked])')).map(x=>Number(x.value));if(!ids.length)throw Error('请至少勾选一项。');const token=preview.token;try{await action('apply',{token,ids});}finally{invalidate();}});
$('#all').onclick=()=>document.querySelectorAll('#rows input:not(:disabled)').forEach(x=>x.checked=true);
$('#none').onclick=()=>document.querySelectorAll('#rows input').forEach(x=>x.checked=false);
$('#fill').onclick=()=>task(async()=>{invalidate();await action('fill',requireProfile());});
$('#undo').onclick=()=>task(async()=>{invalidate();await action('undo');});$('#cancel').onclick=()=>task(()=>action('cancel'));
$('#pick').onclick=()=>task(async()=>{const key=$('#field').value,item=fieldLabels[key];if(!item?.value)throw Error('先选择有内容的字段。');invalidate();await action('arm',{key,value:item.value,profileId:currentId,overwrite:$('#overwrite').checked});window.close();});
$('#copy').onclick=()=>task(async()=>{if(!$('#value').value)throw Error('没有可复制内容。');await navigator.clipboard.writeText($('#value').value);status('已复制，可在网站粘贴。');});
$('#export').onclick=()=>task(async()=>{requireProfile();const url=URL.createObjectURL(new Blob([JSON.stringify(profile,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='resumefill-profile.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);status('已导出当前版本。JSON 含个人资料，请妥善保管。');});
$('#clearMap').onclick=()=>task(async()=>{const r=await chrome.storage.local.get('mappingProfiles'),maps=r.mappingProfiles||{};delete maps[currentId];await chrome.storage.local.set({mappingProfiles:maps});invalidate();status('已清除此版本字段记忆。');});
$('#clearProfile').onclick=()=>task(async()=>{requireProfile();if(!confirm('删除当前版本及其字段记忆？其他版本和 Python 资料会保留。'))return;const next={...profiles};delete next[currentId];const r=await chrome.storage.local.get('mappingProfiles'),maps=r.mappingProfiles||{};delete maps[currentId];const id=Object.keys(next)[0]||'';await chrome.storage.local.set({profiles:next,currentId:id,mappingProfiles:maps});profiles=next;currentId=id;render();status('已删除当前版本。');});
task(async()=>{
  const r=await chrome.storage.local.get(['profiles','currentId','profile']);const next={};
  for(const [id,p]of Object.entries(r.profiles||{}))next[id]=valid(p);
  if(!Object.keys(next).length&&r.profile){next.legacy=valid(r.profile);await chrome.storage.local.set({profiles:next,currentId:'legacy'});}
  profiles=next;currentId=profiles[r.currentId]?r.currentId:Object.keys(profiles)[0]||'';await chrome.storage.local.remove(['profile','mappings']);render();
});
