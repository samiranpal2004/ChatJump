const list = document.getElementById("list");
const status = document.getElementById("status");
const search = document.getElementById("search");
const activationModal = document.getElementById("activationModal");
const licenseKeyInput = document.getElementById("licenseKeyInput");
const activateButton = document.getElementById("activateButton");
const activationError = document.getElementById("activationError");

const LICENSE_API_URL =
  "https://chatjump.netlify.app/.netlify/functions/validate-license";

let currentData = [];

// License management
function getDeviceId() {
  let deviceId = localStorage.getItem("chatjump_device_id");
  if (!deviceId) {
    deviceId =
      "device_" + Math.random().toString(36).substring(2, 15) + Date.now();
    localStorage.setItem("chatjump_device_id", deviceId);
  }
  return deviceId;
}

function showActivationModal(message = "") {
  console.log(
    "[ChatJump][sidebar] Showing activation modal. Message:",
    message
  );
  activationModal.classList.add("show");
  if (message) {
    activationError.textContent = message;
    activationError.classList.add("show");
  }
}

function hideActivationModal() {
  activationModal.classList.remove("show");
  activationError.classList.remove("show");
}

// Format license key input
licenseKeyInput.addEventListener("input", (e) => {
  let value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  let formatted = value.match(/.{1,4}/g)?.join("-") || value;
  e.target.value = formatted;
});

// Activate license
activateButton.addEventListener("click", async () => {
  console.log("[ChatJump][sidebar] Activate clicked");
  const licenseKey = licenseKeyInput.value.replace(/-/g, "");

  if (licenseKey.length < 16) {
    activationError.textContent = "Please enter a valid license key";
    activationError.classList.add("show");
    return;
  }

  activateButton.disabled = true;
  activateButton.textContent = "Activating...";
  activationError.classList.remove("show");

  try {
    console.log(
      "[ChatJump][sidebar] Calling validate-license endpoint:",
      LICENSE_API_URL
    );
    const response = await fetch(LICENSE_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        licenseKey: licenseKeyInput.value,
        deviceId: getDeviceId(),
        action: "activate",
      }),
    });

    const result = await response.json();

    if (result.valid) {
      console.log(
        "[ChatJump][sidebar] Activation successful; saving key and reloading tab"
      );
      localStorage.setItem("chatjump_license_key", licenseKeyInput.value);
      hideActivationModal();
      licenseKeyInput.value = "";
      loadCurrentConversation();

      // Reload content script
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.reload(tabs[0].id);
        }
      });
    } else {
      console.warn("[ChatJump][sidebar] Activation failed:", result);
      activationError.textContent = result.error || "Activation failed";
      activationError.classList.add("show");
    }
  } catch (error) {
    console.error("[ChatJump][sidebar] Activation network error:", error);
    activationError.textContent = "Network error. Please try again.";
    activationError.classList.add("show");
  } finally {
    activateButton.disabled = false;
    activateButton.textContent = "Activate License";
  }
});

// Listen for activation required messages from content script
chrome.runtime.onMessage.addListener((msg) => {
  console.log("[ChatJump][sidebar] Runtime message:", msg?.type, msg);
  if (msg && msg.type === "chatjump-activation-required") {
    showActivationModal(msg.message);
  }
});

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

  // Force-show activation modal if no license key stored
  const storedKey = localStorage.getItem("chatjump_license_key");
  if (!storedKey) {
    showActivationModal("License activation required");
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) {
      console.warn("[ChatJump][sidebar] No active tab");
      status.textContent = "No active ChatGPT tab";
      return;
    }

    const url = tabs[0].url;
    if (!url.includes("chatgpt.com") && !url.includes("chat.openai.com")) {
      console.warn("[ChatJump][sidebar] Not on ChatGPT page:", url);
      status.textContent = "Not on ChatGPT page";
      return;
    }

    chrome.tabs.sendMessage(
      tabs[0].id,
      { type: "chatjump-get-index" },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error(
            "[ChatJump][sidebar] Content script not loaded:",
            chrome.runtime.lastError
          );
          status.textContent = "Error: Content script not loaded";
          return;
        }

        if (response && response.index) {
          console.log(
            "[ChatJump][sidebar] Received index items:",
            response.index?.length
          );
          currentData = response.index;
          render(currentData);
        } else {
          console.warn(
            "[ChatJump][sidebar] No index returned from content script"
          );
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
