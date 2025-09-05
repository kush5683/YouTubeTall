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
let hideShortsNav = false;
let hideMusicNav = false;

async function loadPreference() {
  const result = await storage.get(["hideShorts", "hideShortsNav", "hideMusicNav"]);
  hideShorts = result.hideShorts !== undefined ? result.hideShorts : true;
  hideShortsNav = result.hideShortsNav !== undefined ? result.hideShortsNav : false;
  hideMusicNav = result.hideMusicNav !== undefined ? result.hideMusicNav : false;
}

loadPreference();

browserApi.storage.onChanged.addListener((changes) => {
  if (changes.hideShorts) {
    hideShorts = changes.hideShorts.newValue;
    if (hideShorts) removeIsShortsElements();
  }
  if (changes.hideShortsNav) {
    hideShortsNav = changes.hideShortsNav.newValue;
    if (hideShortsNav) removeGuideShortsEntry();
  }
  if (changes.hideMusicNav) {
    hideMusicNav = changes.hideMusicNav.newValue;
    if (hideMusicNav) removeGuideMusicEntry();
  }
});

function sendCount() {
  browserApi.runtime.sendMessage({ type: "count", count: 1 });
}

// Only process on the Subscriptions feed page
function shouldProcessPage() {
  // YouTube SPA uses pathnames like "/feed/subscriptions" for subs
  return (
    location &&
    typeof location.pathname === "string" &&
    location.pathname.startsWith("/feed/subscriptions")
  );
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
  const shortsLink = card.querySelector(
    'a#thumbnail[href*="/shorts/"], a#video-title-link[href*="/shorts/"], a[href*="/shorts/"]'
  );
  if (shortsLink) return true;
  if (card.tagName && card.tagName.toLowerCase() === "ytd-reel-shelf-renderer") return true;
  // Rich shelf (e.g., Shorts shelf on home/subs)
  if (card.tagName && card.tagName.toLowerCase() === "ytd-rich-shelf-renderer") return true;
  return false;
}

function removeIsShortsElements() {
  if (!hideShorts) return;
  if (!shouldProcessPage()) return; // avoid affecting History and other pages
  const cards = getVideoCards();
  cards.forEach((card) => {
    if (isShortsCard(card)) {
      card.remove();
      sendCount();
    }
  });
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

// Remove the left-nav Shorts entry (ytd-guide-entry-renderer with anchor title="Shorts")
function removeGuideShortsEntry() {
  if (!hideShortsNav) return;
  // Full guide entries
  const guideAnchors = document.querySelectorAll(
    'ytd-guide-entry-renderer a[title="Shorts"], ytd-guide-entry-renderer a[aria-label="Shorts"], ytd-guide-entry-renderer a[href*="/shorts"]'
  );
  guideAnchors.forEach((anchor) => {
    const container = anchor.closest('ytd-guide-entry-renderer');
    if (container) {
      container.remove();
      sendCount();
    }
  });
  // Mini guide entries (collapsed nav)
  const miniAnchors = document.querySelectorAll(
    'ytd-mini-guide-entry-renderer a[title="Shorts"], ytd-mini-guide-entry-renderer a[aria-label="Shorts"], ytd-mini-guide-entry-renderer a[href*="/shorts"]'
  );
  miniAnchors.forEach((anchor) => {
    const container = anchor.closest('ytd-mini-guide-entry-renderer');
    if (container) {
      container.remove();
      sendCount();
    }
  });
}

// Remove the left-nav YouTube Music entry
function removeGuideMusicEntry() {
  if (!hideMusicNav) return;
  // Full guide: usually points to music.youtube.com
  const guideAnchors = document.querySelectorAll(
    'ytd-guide-entry-renderer a[href*="music.youtube.com"], ytd-guide-entry-renderer a[title="YouTube Music"], ytd-guide-entry-renderer a[aria-label="YouTube Music"]'
  );
  guideAnchors.forEach((anchor) => {
    const container = anchor.closest('ytd-guide-entry-renderer');
    if (container) {
      container.remove();
      sendCount();
    }
  });
  // Mini guide version
  const miniAnchors = document.querySelectorAll(
    'ytd-mini-guide-entry-renderer a[href*="music.youtube.com"], ytd-mini-guide-entry-renderer a[title="YouTube Music"], ytd-mini-guide-entry-renderer a[aria-label="YouTube Music"]'
  );
  miniAnchors.forEach((anchor) => {
    const container = anchor.closest('ytd-mini-guide-entry-renderer');
    if (container) {
      container.remove();
      sendCount();
    }
  });
}

// Function to handle DOM mutations and call removeIsShortsElements()
function handleDomMutations(mutations) {
  for (let mutation of mutations) {
    if (mutation.type === "childList") {
      debouncedRemoveIsShortsElements();
      debouncedRemoveGuideShortsEntry();
      debouncedRemoveGuideMusicEntry();
    }
  }
}

removeIsShortsElements();
removeGuideShortsEntry();
removeGuideMusicEntry();

window.addEventListener("popstate", removeIsShortsElements);
window.addEventListener("hashchange", removeIsShortsElements);
window.addEventListener("hashchange", removeGuideShortsEntry);
window.addEventListener("hashchange", removeGuideMusicEntry);


// Debounce removeIsShortsElements() with a 100ms delay
const debouncedRemoveIsShortsElements = debounce(removeIsShortsElements, 100);
const debouncedRemoveGuideShortsEntry = debounce(removeGuideShortsEntry, 100);
const debouncedRemoveGuideMusicEntry = debounce(removeGuideMusicEntry, 100);

// Observe DOM changes and call removeIsShortsElements() when necessary
const observer = new MutationObserver(handleDomMutations);
observer.observe(document.body, { childList: true, subtree: true });
window.addEventListener("load", () => {
  loadPreference().then(removeIsShortsElements);
  removeGuideShortsEntry();
  removeGuideMusicEntry();
}, false);
