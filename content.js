// License Validation
const LICENSE_API_URL =
  "https://chatjump.netlify.app/.netlify/functions/validate-license";

// Generate a unique device ID
function getDeviceId() {
  let deviceId = localStorage.getItem("chatjump_device_id");
  if (!deviceId) {
    deviceId =
      "device_" + Math.random().toString(36).substring(2, 15) + Date.now();
    localStorage.setItem("chatjump_device_id", deviceId);
  }
  return deviceId;
}

// Check if license is valid
async function validateLicense() {
  const licenseKey = localStorage.getItem("chatjump_license_key");

  if (!licenseKey) {
    console.log(
      "[ChatJump][content] No license in localStorage; requesting activation"
    );
    showActivationRequired();
    return false;
  }

  try {
    console.log(
      "[ChatJump][content] Validating license against:",
      LICENSE_API_URL
    );
    const response = await fetch(LICENSE_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        licenseKey: licenseKey,
        deviceId: getDeviceId(),
        action: "validate",
      }),
    });

    const result = await response.json();

    if (result.valid) {
      console.log(
        "[ChatJump][content] License valid; proceeding to init observer"
      );
      // Inform background to clear badge
      try {
        chrome.runtime.sendMessage({ type: "chatjump-validated" });
      } catch (e) {}
      return true;
    } else {
      console.warn("[ChatJump][content] License invalid:", result.error);
      showActivationRequired(result.error);
      return false;
    }
  } catch (error) {
    console.error("[ChatJump][content] License validation error:", error);
    return false; // Fail closed - require activation on error
  }
}

// Show activation required message
function showActivationRequired(message = "License activation required") {
  // Send message to sidebar to show activation UI
  try {
    chrome.runtime.sendMessage(
      {
        type: "chatjump-activation-required",
        message: message,
      },
      () => {
        // Ignore if no receiver is present (popup closed)
        if (chrome.runtime?.lastError) {
          console.debug(
            "[ChatJump][content] No sidebar listener (popup closed)"
          );
        }
      }
    );
    console.log(
      "[ChatJump][content] Sent activation-required message to sidebar/background"
    );
  } catch (e) {
    console.error(
      "[ChatJump][content] Error sending activation-required message:",
      e
    );
  }
}

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

    // Validate license before initializing
    console.log("[ChatJump][content] DOM ready; starting license validation");
    validateLicense().then((isValid) => {
      if (isValid) {
        console.log("[ChatJump][content] Initializing observer");
        initObserver();
      } else {
        console.warn(
          "[ChatJump][content] Activation required; waiting for user action in popup"
        );
      }
    });
  }
}, 300);
