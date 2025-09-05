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

function getVideoCards() {
  return document.querySelectorAll(
    [
      "ytd-rich-item-renderer",
      "ytd-video-renderer",
      "ytd-grid-video-renderer",
      "ytd-compact-video-renderer",
      "ytd-reel-shelf-renderer",
      "ytd-reel-video-renderer",
    ].join(",")
  );
}

function isShortsCard(card) {
  if (!card) return false;
  if (card.hasAttribute("is-shorts")) return true;
  const shortsLink = card.querySelector(
    'a#thumbnail[href*="/shorts/"], a#video-title-link[href*="/shorts/"], a[href*="/shorts/"]'
  );
  if (shortsLink) return true;
  if (card.tagName && card.tagName.toLowerCase() === "ytd-reel-shelf-renderer") return true;
  return false;
}

function removeIsShortsElements() {
  if (!hideShorts) return;
  const cards = getVideoCards();
  cards.forEach((card) => {
    if (isShortsCard(card)) {
      card.remove();
      sendCount();
    }
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
