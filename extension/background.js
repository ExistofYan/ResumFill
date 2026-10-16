// Keep resumes readable by extension pages and explicitly injected scripts only.
chrome.runtime.onInstalled.addListener(()=>{
  chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'}).catch(()=>{});
});
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(!sender.tab)return;
  if(message.type==='getMappings'){
    chrome.storage.local.get('mappingProfiles').then(r=>reply(r.mappingProfiles?.[message.scope]||{})).catch(()=>reply({}));return true;
  }
  if(message.type==='saveMapping'&&typeof message.signature==='string'&&typeof message.key==='string'){
    // Serialize updates so simultaneous page actions do not lose mappings.
    mappingQueue=mappingQueue.catch(()=>{}).then(async()=>{
      const scope=message.scope;
      if(typeof scope!=='string'||scope.length>100||message.signature.length>5000)throw Error('Invalid mapping');
      const r=await chrome.storage.local.get('mappingProfiles'),mappingProfiles=r.mappingProfiles||{};
      const mappings=mappingProfiles[scope]||{};
      mappings[message.signature]=message.key;
      const keys=Object.keys(mappings);for(const key of keys.slice(0,Math.max(0,keys.length-1000)))delete mappings[key];
      mappingProfiles[scope]=mappings;await chrome.storage.local.set({mappingProfiles});reply({ok:true});
    }).catch(()=>reply({ok:false}));return true;
  }
});
let mappingQueue=Promise.resolve();
