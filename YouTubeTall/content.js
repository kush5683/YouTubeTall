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
let hideShorts = false;
let hideShortsNav = false;
let hideMusicNav = false;
let removedCount = 0;

async function loadPreference() {
  const result = await storage.get(["hideShorts", "hideShortsNav", "hideMusicNav"]);
  hideShorts = result.hideShorts !== undefined ? result.hideShorts : true;
  hideShortsNav = result.hideShortsNav !== undefined ? result.hideShortsNav : false;
  hideMusicNav = result.hideMusicNav !== undefined ? result.hideMusicNav : false;
}

const setSidebarSections = createSidebarFilter(sendCount);

function updateSidebar() {
  setSidebarSections(
    hideShortsNav && defaultShortsGuide,
    hideMusicNav && defaultMusicGuide,
  );
}

browserApi.storage.onChanged.addListener((changes) => {
  if (changes.hideShortsNav) hideShortsNav = changes.hideShortsNav.newValue;
  if (changes.hideMusicNav) hideMusicNav = changes.hideMusicNav.newValue;
  if (changes.hideShortsNav || changes.hideMusicNav) updateSidebar();
  if (changes.hideShorts) hideShorts = changes.hideShorts.newValue;
  if (changes.hideShorts) removeIsShortsElements();
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

const regularVideoLinks = 'a[href*="/watch?"], a[href*="/live/"], a[href*="/playlist?"]';

function hasOnlyShortsLinks(element) {
  return element.querySelector('a[href*="/shorts/"]') && !element.querySelector(regularVideoLinks);
}

function isShortsCard(card) {
  if (card.hasAttribute("is-shorts")) return true;
  const tag = card.tagName.toLowerCase();
  if (tag === "ytd-reel-shelf-renderer" || tag === "ytd-reel-video-renderer") return true;
  return hasOnlyShortsLinks(card);
}

function removeIsShortsElements() {
  if (!hideShorts) return;
  if (!shouldProcessPage()) return; // avoid affecting History and other pages
  const cards = getVideoCards();
  let removed = 0;
  cards.forEach((card) => {
    if (card.isConnected && isShortsCard(card)) {
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
    if (!block.isConnected) return;
    const inShortsAncestor = block.closest('ytd-reel-shelf-renderer, ytd-reel-video-renderer, [is-shorts]');
    if (!inShortsAncestor && !hasOnlyShortsLinks(block)) return;
    const container = block.closest(
      'ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer'
    );
    // A Shorts block may share its outer container with an ordinary video.
    const target = container && !container.querySelector(regularVideoLinks) ? container : block;
    target.remove();
    sendCount();
  });
}

loadPreference().then(() => {
  updateSidebar();
  removeIsShortsElements();
});

window.addEventListener("popstate", removeIsShortsElements);
window.addEventListener("hashchange", removeIsShortsElements);
window.addEventListener("load", removeIsShortsElements);

const scanAfterMutation = debounce(removeIsShortsElements, 100);
const observer = new MutationObserver(scanAfterMutation);
observer.observe(document.body, { childList: true, subtree: true });
