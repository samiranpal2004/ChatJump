const SELECTORS = {
  container: 'div[data-scroll-anchor="true"]',
  message: 'article[data-message-id]',
  userMarker: '[data-author-role="user"]'
};


let index = []; 

function stableId(text, timestamp){
  const s = `${timestamp}|${text.slice(0,200)}`;
  let h = 0;
  for(let i=0;i<s.length;i++) h = (h*31 + s.charCodeAt(i)) >>> 0;
  return 'm-' + h.toString(16);
}

function looksLikeQuestion(text){
  return text && text.length>8 && (text.trim().endsWith('?') || /^(how|what|why|when|where|who)\b/i.test(text));
}

function saveIndex(){
  chrome.storage.local.set({ chatjump_index: index });
}

function addToIndex(node){
  
  const text = node.innerText?.trim() || '';
  if(!text || !looksLikeQuestion(text)) return;
  const ts = node.dataset?.msgTimestamp || Date.now().toString();
  const id = stableId(text, ts);
  if(index.some(i => i.id===id)) return;
  const entry = { id, text };
  index.unshift(entry); 
  if(index.length>200) index.pop(); 
  saveIndex();
}


window.addEventListener('chatjump-goto', (e) => {
  const id = e.detail?.id;
  if(!id) return;
 
  for(const node of document.querySelectorAll(SELECTORS.message)){
    const t = node.innerText?.trim();
    if(!t) continue;
    
    const guess = stableId(t, node.dataset?.msgTimestamp || Date.now().toString());
    if(guess === id || t === (index.find(x=>x.id===id)?.text)){
      node.scrollIntoView({behavior:'smooth', block:'center'});
      node.style.outline = '3px solid #ffd54f';
      setTimeout(()=> node.style.outline = '', 1800);
      break;
    }
  }
});


chrome.storage.local.get(['chatjump_index'], res => {
  index = res.chatjump_index || [];
});


function initObserver(){
  const container = document.querySelector(SELECTORS.container);
  if(!container) return console.warn('ChatJump: container not found — update SELECTORS.container');
  const obs = new MutationObserver(muts => {
    for(const m of muts){
      for(const n of m.addedNodes){
        if(n.nodeType===1 && n.matches && n.matches(SELECTORS.message)){
        
          if(SELECTORS.userMarker){
            if(n.querySelector && n.querySelector(SELECTORS.userMarker) || n.matches(SELECTORS.userMarker) || n.closest(SELECTORS.userMarker)){
              addToIndex(n);
            }
          } else {
            
            addToIndex(n);
          }
        }
      }
    }
  });
  obs.observe(container, { childList: true, subtree: true });
 
  document.querySelectorAll(SELECTORS.message).forEach(n => {
    addToIndex(n);
  });
}


const readyCheck = setInterval(() => {
  if(document.readyState === 'complete' || document.querySelector(SELECTORS.container)){
    clearInterval(readyCheck);
    initObserver();
  }
}, 500);
