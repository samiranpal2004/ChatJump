const list = document.getElementById("list");
const status = document.getElementById("status");
const search = document.getElementById("search");

let currentData = [];

function render(items) {
  list.innerHTML = "";
  if (!items || items.length === 0) {
    status.textContent = "No questions indexed yet.";
    return;
  }

  status.textContent = `${items.length} question(s)`;

  for (const it of items) {
    const li = document.createElement("li");
    li.className = "item";
    li.textContent =
      it.text.length > 120 ? it.text.slice(0, 120) + "…" : it.text;
    li.dataset.id = it.id;

    li.addEventListener("click", () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]) return;
        chrome.tabs.sendMessage(tabs[0].id, {
          type: "chatjump-goto",
          id: it.id,
        });
      });
    });

    list.appendChild(li);
  }
}

function loadCurrentConversation() {
  list.innerHTML = "";
  status.textContent = "Loading...";
  search.value = "";

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) {
      status.textContent = "No active ChatGPT tab";
      return;
    }

    const url = tabs[0].url;
    if (!url.includes("chatgpt.com") && !url.includes("chat.openai.com")) {
      status.textContent = "Not on ChatGPT page";
      return;
    }

    chrome.tabs.sendMessage(
      tabs[0].id,
      { type: "chatjump-get-index" },
      (response) => {
        if (chrome.runtime.lastError) {
          status.textContent = "Error: Content script not loaded";
          return;
        }

        if (response && response.index) {
          currentData = response.index;
          render(currentData);
        } else {
          status.textContent = "No questions indexed yet.";
          currentData = [];
        }
      }
    );
  });
}

loadCurrentConversation();

// Reload when user navigates to a different conversation
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].id === tabId) {
        loadCurrentConversation();
      }
    });
  }
});

// Reload when user switches tabs
chrome.tabs.onActivated.addListener(() => {
  loadCurrentConversation();
});

search.addEventListener("input", () => {
  const q = search.value.toLowerCase();
  if (!q) {
    render(currentData);
  } else {
    render(currentData.filter((i) => i.text.toLowerCase().includes(q)));
  }
});
