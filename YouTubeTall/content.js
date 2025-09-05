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
let removedCount = 0;

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

// Only process on the Subscriptions feed page
function shouldProcessPage() {
  // YouTube SPA uses pathnames like "/feed/subscriptions" for subs
  return location && typeof location.pathname === "string" && location.pathname.startsWith("/feed/subscriptions");
}

function getVideoCards() {
  return document.querySelectorAll(
    [
      "ytd-rich-item-renderer",
      "ytd-video-renderer",
      "ytd-grid-video-renderer",
      "ytd-compact-video-renderer",
      // Full shelves like the Shorts shelf
      "ytd-rich-shelf-renderer",
      "ytd-reel-shelf-renderer",
      "ytd-reel-video-renderer",
    ].join(",")
  );
}

function isShortsCard(card) {
  if (!card) return false;
  if (card.hasAttribute("is-shorts")) return true;
  // Detect Shorts by link targets within the card
  const shortsLink = card.querySelector(
    'a#thumbnail[href*="/shorts/"], a#video-title-link[href*="/shorts/"], a[href*="/shorts/"]'
  );
  if (shortsLink) return true;
  // Reels shelf is dedicated to Shorts
  if (card.tagName && card.tagName.toLowerCase() === "ytd-reel-shelf-renderer") return true;
  // Rich shelf (e.g., Shorts shelf on home/subs)
  if (card.tagName && card.tagName.toLowerCase() === "ytd-rich-shelf-renderer") return true;
  return false;
}

function removeIsShortsElements() {
  if (!hideShorts) return;
  if (!shouldProcessPage()) return; // avoid affecting History and other pages
  const cards = getVideoCards();
  let removed = 0;
  cards.forEach((card) => {
    if (isShortsCard(card)) {
      card.remove();
      removed++;
      sendCount();
    }
  });
  removedCount += removed;
  removeShortsDismissibleBlocks();
}

// Remove Shorts contained within generic "#dismissible" blocks without over-matching
function removeShortsDismissibleBlocks() {
  const blocks = document.querySelectorAll('#dismissible, #dismissable');
  blocks.forEach((block) => {
    // Only treat as Shorts if a shorts link exists or it's within a shorts shelf/reel
    const hasShortLink = block.querySelector('a[href*="/shorts/"]');
    const inReel = block.closest('ytd-reel-shelf-renderer, ytd-reel-video-renderer');
    const inRichShelf = block.closest('ytd-rich-shelf-renderer');
    if (hasShortLink || inReel || inRichShelf) {
      const container = block.closest(
        'ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer'
      );
      if (container) {
        container.remove();
      } else {
        block.remove();
      }
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
