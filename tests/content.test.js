// Run the real injected script against a small browser-DOM fixture, no dependencies.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
let mappings={};
class Input{
  constructor(name,label,value='',type='text'){this.tagName='INPUT';this.id='';this.attrs={name};this.labels=[{textContent:label}];this._value=value;this.type=type;this.isConnected=true;this.disabled=false;this.readOnly=false;this.isContentEditable=false;this.nodeType=1;this.events=[];this.listeners={};}
  get value(){return this._value;}set value(v){this._value=String(v);}
  getAttribute(k){return this.attrs[k]??null;}
  getClientRects(){return [1];}
  dispatchEvent(e){this.events.push(e.type);}
  matches(){return true;}
}
class Textarea extends Input{constructor(name,label,value=''){super(name,label,value);this.tagName='TEXTAREA';}get value(){return this._value;}set value(v){this._value=String(v);}}
class Select extends Input{constructor(name,label){super(name,label);this.tagName='SELECT';this.options=[{value:'',textContent:'请选择'},{value:'m',textContent:'硕士'},{value:'b',textContent:'本科'}];}get value(){return this._value;}set value(v){this._value=String(v);}get selectedOptions(){return this.options.filter(x=>x.value===this.value);}}
class Event{constructor(type,options){this.type=type;Object.assign(this,options);}}
const els=[new Input('full_name','姓名'),new Input('email','Email'),new Input('address','详细地址','原地址'),new Input('verification_code','验证码'),new Select('degree','学历'),new Input('company_1','公司名称'),new Input('company_2','公司名称'),new Textarea('summary','自我评价'),new Input('xyz','奇怪字段')];
const doc={URL:'https://jobs.example/apply?stage=1',listeners:{},querySelectorAll:s=>s==='*'?els:els,getElementById:()=>null,addEventListener(type,fn){this.listeners[type]=fn;},documentElement:{append(){}}};
doc.createElement=()=>({style:{},setAttribute(){},remove(){}});
doc.defaultView={HTMLInputElement:Input,HTMLTextAreaElement:Textarea,HTMLSelectElement:Select,Event,getComputedStyle:()=>({visibility:'visible',display:'block'})};
els.forEach(e=>e.ownerDocument=doc);
const context={document:doc,console,setTimeout:()=>0,chrome:{runtime:{async sendMessage(m){if(m.type==='getMappings')return mappings;if(m.type==='saveMapping'){mappings[m.signature]=m.key;return {ok:true};}}}}};
vm.createContext(context);vm.runInContext(fs.readFileSync('extension/engine.js','utf8'),context);vm.runInContext(fs.readFileSync('extension/content.js','utf8'),context);
(async()=>{
  const profile={fields:{name:'Yan Tong',email:'yan@example.com',address:'新地址',degree:'硕士',company:'Company A',summary:'Java developer'},custom:[{label:'特殊字段',value:'Custom value'}]};
  const run=context.__resumeFill.run;
  await run('fill',{profile,overwrite:false});
  assert.equal(els[0].value,'Yan Tong');assert.equal(els[1].value,'yan@example.com');
  assert.equal(els[2].value,'原地址');assert.equal(els[3].value,'');assert.equal(els[4].value,'m');
  assert.equal(els[5].value,'');assert.equal(els[6].value,'');assert.equal(els[7].value,'Java developer');
  assert.deepEqual(els[0].events,['input','change']);
  els[1].value='manual@example.com';await run('undo');assert.equal(els[0].value,'');assert.equal(els[1].value,'manual@example.com');assert.equal(els[4].value,'');
  await run('arm',{key:'custom:0',value:'Custom value',overwrite:false});
  await doc.listeners.click({composedPath:()=>[els[8]],preventDefault(){},stopPropagation(){}});
  assert.equal(els[8].value,'Custom value');assert.equal(Object.keys(mappings).length,1);
  els[8].value='';await run('fill',{profile,overwrite:false});assert.equal(els[8].value,'Custom value');
  await run('fill',{profile,overwrite:true});assert.equal(els[2].value,'新地址');
  // A scan changes nothing. Only checked fields may be committed.
  await run('undo');els[0].value='';els[1].value='';
  let plan=await run('scan',{profile,overwrite:false});
  assert.equal(els[0].value,'');assert.equal(els[1].value,'');
  const nameId=plan.items.find(x=>x.key==='name').id;
  await run('apply',{token:plan.token,ids:[nameId]});assert.equal(els[0].value,'Yan Tong');assert.equal(els[1].value,'');
  await assert.rejects(()=>run('apply',{token:plan.token,ids:[nameId]}),/预览已失效/);
  // A second click with nothing to fill must not destroy undo.
  await run('fill',{profile});await run('fill',{profile});await run('undo');assert.equal(els[0].value,'');
  plan=await run('scan',{profile});els[0].value='User typed';
  let result=await run('apply',{token:plan.token,ids:plan.items.filter(x=>x.eligible).map(x=>x.id)});
  assert.equal(els[0].value,'User typed');assert.ok(result.changed>=1);
  await run('undo');els[0].value='';
  plan=await run('scan',{profile});doc.URL+='&step=2';
  await assert.rejects(()=>run('apply',{token:plan.token,ids:[0]}),/预览已失效/);doc.URL='https://jobs.example/apply?stage=1';
  // Web constraints and edits after scanning are rechecked.
  els[0].maxLength=3;plan=await run('scan',{profile});assert.equal(plan.items.find(x=>x.key==='name').eligible,false);delete els[0].maxLength;
  const date=new Input('graduation_date','毕业时间','','date');date.ownerDocument=doc;els.push(date);
  let bad={...profile,fields:{...profile.fields,graduation:'2026-02-30'}};
  plan=await run('scan',{profile:bad});assert.equal(plan.items.find(x=>x.key==='graduation').eligible,false);
  bad.fields.graduation='2026-02-28';plan=await run('scan',{profile:bad});assert.equal(plan.items.find(x=>x.key==='graduation').eligible,true);
  const month=new Input('availability','到岗时间','','month');month.ownerDocument=doc;els.push(month);
  bad.fields.availability='2026-13';plan=await run('scan',{profile:bad});assert.equal(plan.items.find(x=>x.key==='availability').eligible,false);
  els[0].readOnly=true;plan=await run('scan',{profile});assert.equal(plan.items.some(x=>x.key==='name'),false);els[0].readOnly=false;
  // Same select value with changed visible meaning must be skipped.
  els[4].value='';plan=await run('scan',{profile});els[4].options[1].textContent='博士';
  result=await run('apply',{token:plan.token,ids:[plan.items.find(x=>x.key==='degree').id]});assert.equal(result.changed,1);assert.equal(els[4].value,'');els[4].options[1].textContent='硕士';
  // A site that immediately rejects a value must not be reported as filled.
  await run('undo');els[0].value='';const originalDispatch=els[0].dispatchEvent;
  els[0].dispatchEvent=function(e){if(e.type==='input')this.value='';};
  plan=await run('scan',{profile});result=await run('apply',{token:plan.token,ids:[plan.items.find(x=>x.key==='name').id]});assert.equal(result.failed,1);assert.equal(result.filled,0);els[0].dispatchEvent=originalDispatch;
  console.log('PASS: content script fill, protect existing, skip secrets, degree select, repeated history, events, undo, manual mapping and reuse');
  console.log('PASS: preview/check selection, stale plans, changed values/URL/options, repeated undo, maxLength, invalid dates/months, read-only and site rejection');
})().catch(e=>{console.error(e);process.exitCode=1;});
