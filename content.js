function getConversationId() {
  const match = window.location.pathname.match(/\/c\/([^/]+)/);
  return match ? match[1] : "default";
}

const conversationId = getConversationId();
let index = [];

function stableId(text, timestamp) {
  const s = `${timestamp}|${text.slice(0, 200)}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return "m-" + h.toString(16);
}

function looksLikeQuestion(text) {
  return text && text.length > 10;
}

function findAllMessages() {
  let articles = document.querySelectorAll("article[data-testid]");
  if (articles.length === 0) articles = document.querySelectorAll("article");
  if (articles.length === 0)
    articles = document.querySelectorAll("[data-message-id]");
  return Array.from(articles);
}

function isUserMessage(node) {
  const testId = node.getAttribute("data-testid");
  if (testId && testId.includes("user")) return true;

  if (node.querySelector('[data-message-author-role="user"]')) return true;
  if (node.querySelector('[data-author-role="user"]')) return true;

  // Infer from sibling - user messages come before assistant responses
  const nextArticle = node.nextElementSibling;
  if (nextArticle && nextArticle.tagName === "ARTICLE") {
    const nextTestId = nextArticle.getAttribute("data-testid");
    if (nextTestId && nextTestId.includes("assistant")) return true;
  }

  return false;
}

function addToIndex(node) {
  try {
    const text = node.innerText?.trim() || "";
    if (!text || !isUserMessage(node) || !looksLikeQuestion(text)) return;

    const ts =
      node.dataset?.messageId ||
      node.dataset?.messageid ||
      node.dataset?.testid ||
      node.getAttribute("data-testid") ||
      Date.now().toString();
    const id = stableId(text, ts);

    if (index.some((i) => i.id === id)) return;

    index.unshift({ id, text });
    if (index.length > 300) index.pop();
  } catch (err) {
    // Silently fail to avoid polluting console
  }
}
function scanExisting() {
  const nodes = findAllMessages();
  nodes.forEach((n) => addToIndex(n));
}

function initObserver() {
  const obs = new MutationObserver((muts) => {
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (n.nodeType === 1) {
          if (n.tagName === "ARTICLE") {
            addToIndex(n);
          }
          const articles = n.querySelectorAll
            ? n.querySelectorAll("article")
            : [];
          articles.forEach((article) => addToIndex(article));
        }
      }
    }
  });

  obs.observe(document.body, { childList: true, subtree: true });
  scanExisting();

  // ChatGPT lazy-loads messages, so rescan after delays
  setTimeout(scanExisting, 2000);
  setTimeout(scanExisting, 5000);

  // Rescan on scroll because ChatGPT loads more messages dynamically
  let scrollTimeout;
  window.addEventListener("scroll", () => {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(scanExisting, 500);
  });
}

function gotoById(id) {
  const nodes = findAllMessages();
  for (const node of nodes) {
    const t = node.innerText?.trim();
    if (!t) continue;

    const ts =
      node.dataset?.messageId ||
      node.dataset?.messageid ||
      node.dataset?.testid ||
      node.getAttribute("data-testid") ||
      Date.now().toString();
    const guess = stableId(t, ts);

    if (guess === id || t === index.find((x) => x.id === id)?.text) {
      node.scrollIntoView({ behavior: "smooth", block: "center" });
      node.style.outline = "3px solid #ffd54f";
      setTimeout(() => (node.style.outline = ""), 1600);
      return true;
    }
  }
  return false;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "chatjump-goto" && msg.id) {
    sendResponse({ ok: gotoById(msg.id) });
  } else if (msg && msg.type === "chatjump-get-index") {
    sendResponse({ index: index, conversationId: conversationId });
  }
  return true;
});

// Wait for DOM before initializing observer
const readyCheck = setInterval(() => {
  if (document.readyState === "complete" || document.querySelector("article")) {
    clearInterval(readyCheck);
    initObserver();
  }
}, 300);
