// Background service worker for ChatJump
// Shows an action badge when activation is required and clears it when validated

chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeText({ text: "" });
});

function setActivationBadge(tabId) {
  chrome.action.setBadgeText({ tabId, text: "!" });
  chrome.action.setBadgeBackgroundColor({ tabId, color: "#EF4444" });
}

function clearBadge(tabId) {
  chrome.action.setBadgeText({ tabId, text: "" });
}

// Listen to messages from content/sidebar
chrome.runtime.onMessage.addListener((msg, sender) => {
  const tabId = sender?.tab?.id;
  if (!tabId) return;

  if (msg && msg.type === "chatjump-activation-required") {
    setActivationBadge(tabId);
  } else if (msg && msg.type === "chatjump-validated") {
    clearBadge(tabId);
  }
});

// Clear badge when tab reloads or navigates (content will re-validate)
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading" || changeInfo.url) {
    clearBadge(tabId);
  }
});
