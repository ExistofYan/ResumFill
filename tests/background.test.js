const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
let handler,installed,data={};
const context={chrome:{runtime:{onInstalled:{addListener(fn){installed=fn;}},onMessage:{addListener(fn){handler=fn;}}},storage:{local:{async setAccessLevel(){},async get(k){return {[k]:structuredClone(data[k])};},async set(v){Object.assign(data,structuredClone(v));}}}}};
vm.createContext(context);vm.runInContext(fs.readFileSync('extension/background.js','utf8'),context);
const request=m=>new Promise(resolve=>handler(m,{tab:{id:1}},resolve));
(async()=>{
  installed();
  await Promise.all(Array.from({length:20},(_,i)=>request({type:'saveMapping',scope:'profile-A',signature:'field'+i,key:'name'})));
  assert.equal(Object.keys(await request({type:'getMappings',scope:'profile-A'})).length,20);
  assert.equal(Object.keys(await request({type:'getMappings',scope:'profile-B'})).length,0);
  await request({type:'saveMapping',scope:'profile-B',signature:'field1',key:'email'});
  assert.equal((await request({type:'getMappings',scope:'profile-A'})).field1,'name');
  assert.equal((await request({type:'getMappings',scope:'profile-B'})).field1,'email');
  assert.equal((await request({type:'saveMapping',scope:'a'.repeat(101),signature:'x',key:'name'})).ok,false);
  const oldSet=context.chrome.storage.local.set;context.chrome.storage.local.set=async()=>{throw Error('quota');};
  assert.equal((await request({type:'saveMapping',scope:'profile-A',signature:'quota',key:'name'})).ok,false);
  context.chrome.storage.local.set=oldSet;
  console.log('PASS: background profile isolation, serialized concurrent mappings, invalid scope, storage failure');
})().catch(e=>{console.error(e);process.exitCode=1;});
