// Debounce function to limit the frequency of function calls
function debounce(func, wait) {
  let timeout;
  return function (...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
}

// Function to remove elements with the 'is-shorts' property
const browserApi = typeof browser !== "undefined" ? browser : chrome;
const storage = browserApi.storage.sync || browserApi.storage.local;
let hideShorts = true;

async function loadPreference() {
  const result = await storage.get("hideShorts");
  hideShorts = result.hideShorts !== undefined ? result.hideShorts : true;
}

loadPreference();

browserApi.storage.onChanged.addListener((changes) => {
  if (changes.hideShorts) {
    hideShorts = changes.hideShorts.newValue;
    if (hideShorts) {
      removeIsShortsElements();
    }
  }
});

function sendCount() {
  browserApi.runtime.sendMessage({ type: "count", count: 1 });
}

function removeIsShortsElements() {
  if (!hideShorts) return;
  const elementsWithIsShorts = document.querySelectorAll("[is-shorts]");
  elementsWithIsShorts.forEach((element) => {
    element.remove();
    sendCount();
  });
  removeAdditionalContent();
}

function removeAdditionalContent() {
  const keywords = ["Premier", "Ad"];
  document
    .querySelectorAll("ytd-video-renderer,ytd-rich-item-renderer")
    .forEach((item) => {
      if (keywords.some((k) => item.innerText.includes(k))) {
        item.remove();
        sendCount();
      }
    });
}

// Function to handle DOM mutations and call removeIsShortsElements()
function handleDomMutations(mutations) {
  for (let mutation of mutations) {
    if (mutation.type === "childList") {
      debouncedRemoveIsShortsElements();
    }
  }
}

removeIsShortsElements();

window.addEventListener("popstate", removeIsShortsElements);
window.addEventListener("hashchange", removeIsShortsElements);


// Debounce removeIsShortsElements() with a 100ms delay
const debouncedRemoveIsShortsElements = debounce(removeIsShortsElements, 100);

// Observe DOM changes and call removeIsShortsElements() when necessary
const observer = new MutationObserver(handleDomMutations);
observer.observe(document.body, { childList: true, subtree: true });
window.addEventListener("load", () => {
  loadPreference().then(removeIsShortsElements);
}, false);
