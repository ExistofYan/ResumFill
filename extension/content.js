(()=>{
  if(globalThis.__resumeFill)return;
  const state={history:[],armed:null,plan:null};
  const targets='input,textarea,select,[contenteditable="true"]';
  const blocked=/password|captcha|verification|验证码|密码|one.?time.?code|otp|身份证|护照|passport|national.?id/iu;
  function roots(){
    const found=[],seen=new Set();
    const visit=r=>{if(seen.has(r))return;seen.add(r);found.push(r);for(const e of r.querySelectorAll('*')){if(e.shadowRoot)visit(e.shadowRoot);if(e.tagName==='IFRAME'){try{if(e.contentDocument)visit(e.contentDocument);}catch{}}}};
    visit(document);return found;
  }
  function elements(){return roots().flatMap(r=>Array.from(r.querySelectorAll(targets)));}
  function descriptors(e){
    const doc=e.ownerDocument,labels=Array.from(e.labels||[]).map(x=>x.textContent.trim());
    const refs=(e.getAttribute('aria-labelledby')||'').split(/\s+/).map(id=>doc.getElementById(id)?.textContent||'');
    const prior=e.previousElementSibling;
    return [...labels,...refs,e.getAttribute('aria-label'),e.getAttribute('placeholder'),e.getAttribute('name'),e.id,prior&&/^(LABEL|SPAN)$/.test(prior.tagName)?prior.textContent:''].filter(x=>x&&x.length<180);
  }
  function usable(e){
    if(!e.isConnected||e.disabled||e.readOnly||e.getAttribute('aria-disabled')==='true'||e.closest?.('[inert]'))return false;
    if(e.tagName==='INPUT'&&!['text','email','tel','url','number','date','month'].includes(e.type))return false;
    const style=e.ownerDocument.defaultView.getComputedStyle(e);
    return !!e.getClientRects().length&&style.visibility!=='hidden'&&style.display!=='none'&&style.opacity!=='0';
  }
  const valueOf=e=>String(e.isContentEditable?e.textContent:e.value??'');
  const baseSignature=e=>[e.tagName,e.id,e.getAttribute('name'),e.getAttribute('placeholder'),e.getAttribute('aria-label'),descriptors(e).join('|')].join('::');
  function signatures(els){
    const groups=new Map(),result=new Map();
    for(const e of els){const key=e.ownerDocument.URL+'::'+baseSignature(e);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(e);}
    for(const [key,list]of groups)list.forEach((e,i)=>result.set(e,key+'::'+list.length+'::'+i));return result;
  }
  function chooseSelect(e,value){
    const norm=ResumeFillEngine.normalize(value),forms=new Set([norm]);
    const degrees={本科:['bachelor','bachelors','bachelorsdegree','undergraduate'],硕士:['master','masters','mastersdegree','postgraduate'],博士:['phd','doctorate','doctoral']};
    for(const [cn,en]of Object.entries(degrees))if(norm===cn||en.includes(norm)){forms.add(cn);en.forEach(x=>forms.add(x));}
    const options=Array.from(e.options).filter(o=>!o.disabled&&!o.parentElement?.disabled&&(forms.has(ResumeFillEngine.normalize(o.textContent))||forms.has(ResumeFillEngine.normalize(o.value))));
    return options.length===1?{ok:true,value:options[0].value}:{ok:false,reason:'下拉选项无法唯一匹配'};
  }
  function preparedValue(e,value){
    const v=String(value);if(e.tagName==='SELECT')return chooseSelect(e,v);
    if(e.type==='date'){
      if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||Number.isNaN(Date.parse(v+'T00:00:00Z'))||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v)return {ok:false,reason:'日期需要有效的 YYYY-MM-DD 格式'};
    }
    if(e.type==='month'&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(v))return {ok:false,reason:'月份需要 YYYY-MM 格式'};
    if(e.type==='number'&&(!/^[+-]?\d+(\.\d+)?$/.test(v)||!Number.isFinite(Number(v))))return {ok:false,reason:'此处需要数字'};
    if(e.type==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))return {ok:false,reason:'邮箱格式需要核对'};
    if(e.type==='url'&&!/^https?:\/\/[^\s]+$/i.test(v))return {ok:false,reason:'网址请包含 https:// 或 http://'};
    if(Number.isInteger(e.maxLength)&&e.maxLength>=0&&v.length>e.maxLength)return {ok:false,reason:`超过网页 ${e.maxLength} 字限制`};
    if(['date','month','number'].includes(e.type)){
      const min=e.getAttribute('min'),max=e.getAttribute('max'),numeric=e.type==='number';
      if(min!==null&&(numeric?Number(v)<Number(min):v<min)||max!==null&&(numeric?Number(v)>Number(max):v>max))return {ok:false,reason:'超出网页允许范围'};
    }
    return {ok:true,value:v};
  }
  function write(e,v){
    if(e.isContentEditable)e.textContent=v;
    else{const win=e.ownerDocument.defaultView,proto=e.tagName==='SELECT'?win.HTMLSelectElement.prototype:e.tagName==='TEXTAREA'?win.HTMLTextAreaElement.prototype:win.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,v);}
  }
  function notify(e){const win=e.ownerDocument.defaultView;e.dispatchEvent(new win.Event('input',{bubbles:true,composed:true}));e.dispatchEvent(new win.Event('change',{bubbles:true,composed:true}));}
  function commit(e,v){
    const old=valueOf(e);if(old===v)return false;
    try{write(e,v);if(valueOf(e)!==v){write(e,old);return false;}const entry={e,old,value:v};state.history.push(entry);notify(e);if(valueOf(e)!==v){state.history.splice(state.history.indexOf(entry),1);return false;}return true;}
    catch{try{write(e,old);}catch{}return false;}
  }
  function empty(e){return !valueOf(e).trim()||(e.tagName==='SELECT'&&/^(请选择|please select|select\b|choose\b|--)/i.test(e.selectedOptions[0]?.textContent.trim()||''));}
  function banner(message){
    let b=document.getElementById('__resumefill_notice');if(!b){b=document.createElement('div');b.id='__resumefill_notice';b.setAttribute('role','status');Object.assign(b.style,{position:'fixed',top:'18px',right:'18px',zIndex:2147483647,background:'#173857',color:'white',padding:'16px',borderRadius:'10px',font:'14px/1.6 sans-serif',maxWidth:'380px',boxShadow:'0 8px 30px #0004'});document.documentElement.append(b);}b.textContent=message;setTimeout(()=>b.remove(),6500);
  }
  async function scan(payload){
    state.armed=null;
    const values=ResumeFillEngine.flatten(payload.profile),scope=payload.profileId||'legacy';
    const mappings=await chrome.runtime.sendMessage({type:'getMappings',scope})||{},els=elements().filter(usable),sigs=signatures(els),counts={};
    const guesses=new Map(els.map(e=>[e,ResumeFillEngine.matchField(descriptors(e),e.autocomplete||'')]));
    for(const key of guesses.values())if(key)counts[key]=(counts[key]||0)+1;
    const items=[],internal=[];
    for(const e of els){
      const desc=descriptors(e),mapped=mappings[sigs.get(e)],key=mapped||guesses.get(e),source=mapped?'已记住':'自动识别';
      let reason='',prepared=null;
      if(blocked.test(desc.join(' ')))reason='验证码或敏感字段，跳过';
      else if(!key)reason='无法可靠识别，请手动指定';
      else if(!values[key])reason='资料中没有此字段内容';
      else if(!mapped&&['school','degree','major','graduation','company','position','work_description'].includes(key)&&counts[key]>1)reason='重复经历，请手动指定';
      else if(!payload.overwrite&&!empty(e))reason='已有内容，保留';
      else{prepared=preparedValue(e,values[key]);if(!prepared.ok)reason=prepared.reason;else if(prepared.value===valueOf(e))reason='内容相同，无需修改';}
      const index=items.length,label=desc[0]||'未命名输入框';
      items.push({id:index,label,key:key||'',source,old:valueOf(e),value:values[key]||'',eligible:!reason,reason});
      internal.push({e,key,old:valueOf(e),value:prepared?.value,sig:sigs.get(e),base:baseSignature(e),url:e.ownerDocument.URL,options:e.tagName==='SELECT'?Array.from(e.options).map(o=>[o.value,o.textContent,!!o.disabled,!!o.parentElement?.disabled]):null,eligible:!reason});
    }
    const token=String(Date.now())+'-'+Math.random();state.plan={token,internal,url:document.URL};
    return {items,token,message:`扫描 ${items.length} 项，可填写 ${items.filter(x=>x.eligible).length} 项。勾选核对后点击确认。`};
  }
  async function apply(payload){
    const plan=state.plan;
    if(!plan||plan.token!==payload.token||plan.url!==document.URL)throw Error('预览已失效，请重新扫描当前页。');
    const ids=new Set(payload.ids||[]),currentSigs=signatures(elements().filter(usable));
    let filled=0,changed=0,failed=0;state.armed=null;
    for(const [i,item]of plan.internal.entries()){
      if(!ids.has(i)||!item.eligible)continue;
      const e=item.e;
      if(!usable(e)||currentSigs.get(e)!==item.sig||baseSignature(e)!==item.base||e.ownerDocument.URL!==item.url||blocked.test(descriptors(e).join(' '))||valueOf(e)!==item.old){changed++;continue;}
      if(e.tagName==='SELECT'){
        if(JSON.stringify(Array.from(e.options).map(o=>[o.value,o.textContent,!!o.disabled,!!o.parentElement?.disabled]))!==JSON.stringify(item.options)){changed++;continue;}
      }else if(!preparedValue(e,item.value).ok){changed++;continue;}
      if(commit(e,item.value))filled++;else failed++;
    }
    if(state.history.length>500)state.history.splice(0,state.history.length-500);
    state.plan=null;
    return {filled,changed,failed,message:`已填写 ${filled} 项；网页或内容变化跳过 ${changed} 项，控件拒绝 ${failed} 项。请核对后自行提交。`};
  }
  async function run(action,payload={}){
    if(action==='scan')return scan(payload);
    if(action==='apply')return apply(payload);
    if(action==='fill'){const p=await scan(payload);return apply({token:p.token,ids:p.items.filter(x=>x.eligible).map(x=>x.id)});}
    if(action==='undo'){
      state.plan=null;state.armed=null;let n=0;
      for(const item of [...state.history].reverse())if(item.e.isConnected&&valueOf(item.e)===item.value){try{write(item.e,item.old);notify(item.e);n++;}catch{}}
      state.history=[];return {message:`已撤销 ${n} 次修改；你手动改过的内容会保留。`};
    }
    if(action==='cancel'){state.armed=null;banner('已取消选择。');return {message:'已取消'};}
    if(action==='arm'){
      state.plan=null;state.armed=payload;banner('ResumeFill：请点击目标输入框。Esc 取消。');
      for(const r of roots()){r.addEventListener('click',onPick,true);r.addEventListener('keydown',onKey,true);}
      return {message:'请选择输入框'};
    }
    throw Error('未知操作');
  }
  function onKey(e){if(e.key==='Escape'){state.armed=null;banner('已取消选择。');}}
  async function onPick(ev){
    if(!state.armed)return;
    const e=ev.composedPath().find(x=>x.nodeType===1&&x.matches?.(targets));if(!e||!usable(e))return;
    ev.preventDefault();ev.stopPropagation();const picked=state.armed;state.armed=null;
    if(blocked.test(descriptors(e).join(' '))){banner('此字段已跳过。');return;}
    if(!empty(e)&&!picked.overwrite){banner('已有内容。需要替换时，在插件中勾选“覆盖已有内容”。');return;}
    const prepared=preparedValue(e,picked.value);if(!prepared.ok){banner(prepared.reason+'；可使用插件复制后手动粘贴。');return;}
    if(valueOf(e)!==prepared.value&&!commit(e,prepared.value)){banner('网页未接受填写，请复制后手动粘贴。');return;}
    try{const sig=signatures(elements().filter(usable)).get(e);if(!sig)throw Error();const result=await chrome.runtime.sendMessage({type:'saveMapping',scope:picked.profileId||'legacy',signature:sig,key:picked.key});banner(result?.ok?'已填写并记住此字段。':'已填写，字段记忆保存失败。');}
    catch{banner('已填写，字段记忆保存失败。');}
  }
  globalThis.__resumeFill={run};
})();
