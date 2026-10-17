const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
class Node{
  constructor(tag='DIV'){this.tagName=tag.toUpperCase();this.children=[];this.value='';this.dataset={};this.checked=false;this.disabled=false;this.classList={toggle(){}};}
  append(...nodes){this.children.push(...nodes);if(this.tagName==='SELECT'&&!this.value)this.value=nodes[0]?.value||'';}
  replaceChildren(){this.children=[];this.value='';}
  setAttribute(){}remove(){}click(){}
  querySelector(s){return this.children.find(x=>x.tagName===s.toUpperCase());}
}
const ids=['status','custom','fields','title','resume','merge','raw','backups','add','editor','save','export','draft','restore','refreshBackups','uploadFeedback','retryImport','pasteText','parseText'];
const nodes=Object.fromEntries(ids.map(id=>[id,new Node(id==='backups'?'SELECT':'DIV')]));nodes.merge.checked=true;
nodes.raw.parentElement={open:false};
const inputs=()=>nodes.fields.children.map(w=>w.children[0]);
const document={querySelector:s=>nodes[s.slice(1)],createElement:t=>new Node(t),querySelectorAll(s){if(s==='[data-key]')return inputs();if(s==='.custom-row')return nodes.custom.children;if(s==='button,input,textarea,select')return [...Object.values(nodes),...inputs()];return [];}};
let disk={version:1,title:'Existing',fields:{name:'Original',email:'',summary:'Existing summary'},custom:[{label:'Second company',value:'Existing company'}]},version='v1',lastSave,failImport=false;
let pasted=false;
const imported={version:1,title:'Import',fields:{name:'Changed',email:'new@example.com',summary:''},custom:[{label:'Second company',value:'Changed company'}]};
const context={document,console,Blob,URL,AbortController,clearTimeout:()=>{},setTimeout:()=>0,confirm:()=>true,window:{addEventListener(){}},async fetch(path,options){
  if(path==='/api/profile')return {ok:true,async json(){return {profile:disk,labels:{name:'姓名',email:'邮箱',summary:'简介'},csrf:'token',revision:version};}};
  if(path==='/api/backups')return {ok:true,async json(){return {backups:[]};}};
  if(path==='/api/import')return {ok:!failImport,async json(){return failImport?{error:'Bad import'}:{profile:structuredClone(imported),text:'Raw',notice:'Imported'};}};
  if(path==='/api/parse-text'){pasted=true;return {ok:true,async json(){return {profile:structuredClone(imported),text:'Pasted text',field_count:2};}};}
  if(path==='/api/save'){lastSave=options;disk=JSON.parse(options.body);version='v2';return {ok:true,async json(){return {profile:disk,revision:version};}};}
  throw Error('Unexpected request');
}};
vm.createContext(context);vm.runInContext(fs.readFileSync('static/app.js','utf8'),context);
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const collect=()=>JSON.parse(vm.runInContext('JSON.stringify(collect())',context));
(async()=>{
  await settle();assert.equal(collect().fields.name,'Original');
  nodes.resume.files=[{size:10,name:'resume.txt'}];await nodes.resume.onchange();await settle();
  assert.equal(collect().fields.name,'Original');assert.equal(collect().fields.email,'new@example.com');assert.equal(collect().custom[0].value,'Existing company');
  await nodes.save.onclick();assert.equal(lastSave.headers['X-ResumeFill-Revision'],'v1');
  assert.equal(nodes.resume.files[0].name,'resume.txt');assert.ok(nodes.uploadFeedback.textContent.includes('resume.txt'));assert.ok(nodes.uploadFeedback.textContent.includes('合并模式'));
  failImport=true;nodes.resume.files=[{size:10,name:'bad.docx'}];await nodes.resume.onchange();await settle();assert.equal(collect().fields.name,'Original');assert.equal(nodes.status.textContent,'Bad import');assert.ok(nodes.uploadFeedback.textContent.includes('Bad import'));
  failImport=false;nodes.merge.checked=false;nodes.resume.files=[{size:10,name:'new.txt'}];await nodes.retryImport.onclick();await settle();assert.equal(collect().fields.name,'Changed');
  await nodes.save.onclick();assert.equal(lastSave.headers['X-ResumeFill-Revision'],'v2');
  nodes.pasteText.value='Pasted text';await nodes.parseText.onclick();assert.equal(pasted,true);assert.ok(nodes.uploadFeedback.textContent.includes('粘贴文字'));assert.equal(nodes.raw.parentElement.open,true);
  console.log('PASS: editor initialization, merge without data loss, save revisions, failed import preservation, replace import');
})().catch(e=>{console.error(e);process.exitCode=1;});
