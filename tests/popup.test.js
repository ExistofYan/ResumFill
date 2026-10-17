const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
class Node{
  constructor(){this.children=[];this.dataset={};this.value='';this.textContent='';this.checked=false;this.disabled=false;this.hidden=false;}
  append(...nodes){this.children.push(...nodes);if(!this.value&&nodes[0]?.value)this.value=nodes[0].value;}
  replaceChildren(...nodes){this.children=nodes;this.value='';}
}
const ids=['profile','profiles','import','replace','scan','overwrite','preview','rows','apply','fill','undo','filter','field','value','pick','copy','cancel','status','export','clearMap','clearProfile','all','none'];
const nodes=Object.fromEntries(ids.map(x=>[x,new Node()]));
const rowInputs=()=>nodes.rows.children.map(x=>x.children[0]);
const document={querySelector:s=>nodes[s.slice(1)],createElement:()=>new Node(),querySelectorAll(s){
  if(s==='button,select,input')return [...Object.values(nodes),...rowInputs()];
  if(s==='#rows input[data-locked]')return rowInputs().filter(x=>x.dataset.locked);
  if(s==='#rows input:checked:not([data-locked])')return rowInputs().filter(x=>x.checked&&!x.dataset.locked);
  if(s==='#rows input:not(:disabled)')return rowInputs().filter(x=>!x.disabled);
  if(s==='#rows input')return rowInputs();return [];
}};
const initial={version:1,title:'Backend',fields:{name:'Yan Tong',email:'yan@example.com'},custom:[]};
let storage={profiles:{one:initial,two:{...initial,title:'Data'}},currentId:'one'},calls=[];
const context={document,console,confirm:()=>true,crypto:{randomUUID:()=> 'new-profile'},Blob,URL,setTimeout:()=>0,window:{close(){}},navigator:{clipboard:{async writeText(){}}},chrome:{storage:{local:{async get(keys){if(typeof keys==='string')return {[keys]:storage[keys]};return Object.fromEntries(keys.map(k=>[k,storage[k]]));},async set(v){Object.assign(storage,v);},async remove(keys){keys.forEach(k=>delete storage[k]);}}},tabs:{async query(){return [{id:1}];}},scripting:{async executeScript(args){if(args.files)return [];const [action,payload]=args.args;calls.push({action,payload});if(action==='scan')return [{result:{token:'plan-token',message:'Preview',items:[{id:0,label:'Name',key:'name',old:'',value:'Yan Tong',eligible:true,source:'自动识别'},{id:1,label:'Captcha',key:'',old:'',value:'',eligible:false,reason:'skip'}]}}];return [{result:{message:'Done'}}];}}}};
vm.createContext(context);vm.runInContext(fs.readFileSync('extension/popup.js','utf8'),context);
const settle=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
  await settle();assert.equal(nodes.profiles.value,'one');
  await nodes.scan.onclick();assert.equal(nodes.preview.hidden,false);assert.equal(rowInputs()[0].checked,true);assert.equal(rowInputs()[1].disabled,true);
  await nodes.apply.onclick();assert.deepEqual(Array.from(calls.at(-1).payload.ids),[0]);assert.equal(calls.at(-1).action,'apply');assert.equal(nodes.preview.hidden,true);
  nodes.profiles.value='two';await nodes.profiles.onchange();assert.equal(storage.currentId,'two');assert.equal(nodes.profile.textContent.includes('Data'),true);
  nodes.filter.value='email';nodes.filter.oninput();assert.equal(nodes.field.children.length,1);assert.equal(nodes.value.value,'yan@example.com');
  await nodes.clearProfile.onclick();assert.equal(storage.profiles.two,undefined);assert.ok(storage.profiles.one);
  nodes.import.files=[{size:100,async text(){return JSON.stringify({...initial,title:'New'});}}];
  await nodes.import.onchange({target:nodes.import});await settle();assert.ok(storage.profiles['new-profile']);assert.equal(storage.currentId,'new-profile');
  console.log('PASS: popup startup, preview apply with busy controls, locked rows, profile switch/delete/import, field search');
})().catch(e=>{console.error(e);process.exitCode=1;});
