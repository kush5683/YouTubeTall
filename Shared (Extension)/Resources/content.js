// Debounce function to limit the frequency of function calls
function debounce(func, wait) {
  let timeout;
  return function (...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
}

const browserApi = typeof browser !== "undefined" ? browser : chrome;
const storage = browserApi.storage.sync || browserApi.storage.local;

// Selector config is versioned so a stored override that targets an older
// schema can be detected and discarded instead of breaking removal silently
// when YouTube changes its DOM and we ship new defaults.
const CONFIG_SCHEMA_VERSION = 1;

const DEFAULT_CONFIG = {
  schemaVersion: CONFIG_SCHEMA_VERSION,
  shortsRemoval: {
    enabled: true,
    // Prefix-match routes; exactRoutes match the whole pathname; excludePatterns
    // are regex strings that veto a match (so /@mkbhd is processed but
    // /@mkbhd/shorts is left alone).
    routes: ["/feed/subscriptions", "/results", "/@", "/channel/", "/c/", "/user/"],
    exactRoutes: ["/"],
    excludePatterns: ["(?:^|/)shorts(?:/|$)"],
    cardSelectors: [
      "ytd-rich-item-renderer",
      "ytd-video-renderer",
      "ytd-grid-video-renderer",
      "ytd-compact-video-renderer",
      "ytd-rich-shelf-renderer",
      "ytd-reel-shelf-renderer",
      "ytd-reel-video-renderer",
      "ytd-shelf-renderer",
      "ytd-rich-section-renderer",
    ],
    shortsLinkSelectors: [
      'a#thumbnail[href*="/shorts/"]',
      'a#video-title-link[href*="/shorts/"]',
      'a[href*="/shorts/"]',
    ],
    shortsCardTags: ["ytd-reel-shelf-renderer", "ytd-reel-video-renderer"],
    shortsAttributes: ["is-shorts"],
    dismissibleSelectors: ["#dismissible", "#dismissable"],
    dismissibleContainerSelectors: [
      "ytd-rich-item-renderer",
      "ytd-video-renderer",
      "ytd-grid-video-renderer",
      "ytd-compact-video-renderer",
    ],
    shortsAncestorSelectors: [
      "ytd-reel-shelf-renderer",
      "ytd-reel-video-renderer",
      "[is-shorts]",
    ],
  },
  sidebarShorts: defaultShortsGuide,
  sidebarMusic: defaultMusicGuide,
};

let activeConfig = DEFAULT_CONFIG;
let hideShorts = false;
let hideShortsNav = false;
let hideMusicNav = false;

function mergeConfig(defaults, override) {
  if (!override || typeof override !== "object") return defaults;
  if (override.schemaVersion !== defaults.schemaVersion) {
    console.warn(
      `[YouTubeTall] selectorConfig schema v${override.schemaVersion} does not match expected v${defaults.schemaVersion}; using defaults`
    );
    return defaults;
  }
  const merged = { schemaVersion: defaults.schemaVersion };
  for (const section of Object.keys(defaults)) {
    if (section === "schemaVersion") continue;
    if (override[section] && typeof override[section] === "object") {
      merged[section] = { ...defaults[section], ...override[section] };
    } else {
      merged[section] = defaults[section];
    }
  }
  return merged;
}

async function loadConfig() {
  try {
    const result = await storage.get("selectorConfig");
    activeConfig = mergeConfig(DEFAULT_CONFIG, result.selectorConfig);
  } catch (e) {
    activeConfig = DEFAULT_CONFIG;
  }
}

async function loadPreference() {
  const result = await storage.get(["hideShorts", "hideShortsNav", "hideMusicNav"]);
  hideShorts = result.hideShorts !== undefined ? result.hideShorts : true;
  hideShortsNav = result.hideShortsNav !== undefined ? result.hideShortsNav : false;
  hideMusicNav = result.hideMusicNav !== undefined ? result.hideMusicNav : false;
}

const setSidebarSections = createSidebarFilter(sendCount);

function updateSidebar() {
  setSidebarSections(
    hideShortsNav && activeConfig.sidebarShorts,
    hideMusicNav && activeConfig.sidebarMusic,
  );
}

browserApi.storage.onChanged.addListener((changes) => {
  if (changes.hideShortsNav) hideShortsNav = changes.hideShortsNav.newValue;
  if (changes.hideMusicNav) hideMusicNav = changes.hideMusicNav.newValue;
  if (changes.selectorConfig) {
    activeConfig = mergeConfig(DEFAULT_CONFIG, changes.selectorConfig.newValue);
  }
  if (changes.hideShortsNav || changes.hideMusicNav || changes.selectorConfig) updateSidebar();
  if (changes.hideShorts) hideShorts = changes.hideShorts.newValue;
  if (changes.hideShorts || changes.selectorConfig) removeIsShortsElements();
});

function sendCount() {
  browserApi.runtime.sendMessage({ type: "count", count: 1 });
}

function joinSelectors(list) {
  return list && list.length ? list.join(",") : "";
}

function shouldProcessPage() {
  if (!location || typeof location.pathname !== "string") return false;
  const cfg = activeConfig.shortsRemoval;
  const path = location.pathname;
  for (const pattern of cfg.excludePatterns || []) {
    try {
      if (new RegExp(pattern).test(path)) return false;
    } catch (e) {
      // ignore malformed user-supplied patterns
    }
  }
  for (const exact of cfg.exactRoutes || []) {
    if (path === exact) return true;
  }
  for (const prefix of cfg.routes || []) {
    if (path.startsWith(prefix)) return true;
  }
  return false;
}

function getVideoCards() {
  const selector = joinSelectors(activeConfig.shortsRemoval.cardSelectors);
  if (!selector) return [];
  return document.querySelectorAll(selector);
}

const regularVideoLinks = 'a[href*="/watch?"], a[href*="/live/"], a[href*="/playlist?"]';

function hasOnlyShortsLinks(element, shortsSelector) {
  return shortsSelector && element.querySelector(shortsSelector) && !element.querySelector(regularVideoLinks);
}

function isShortsCard(card) {
  const cfg = activeConfig.shortsRemoval;
  for (const attr of cfg.shortsAttributes) {
    if (card.hasAttribute(attr)) return true;
  }
  const tag = card.tagName ? card.tagName.toLowerCase() : "";
  if (tag && cfg.shortsCardTags.some((t) => t.toLowerCase() === tag)) return true;
  return hasOnlyShortsLinks(card, joinSelectors(cfg.shortsLinkSelectors));
}

function removeIsShortsElements() {
  if (!hideShorts) return;
  if (!activeConfig.shortsRemoval.enabled) return;
  if (!shouldProcessPage()) return; // avoid affecting History and other pages
  const cards = getVideoCards();
  cards.forEach((card) => {
    if (card.isConnected && isShortsCard(card)) {
      card.remove();
      sendCount();
    }
  });
  removeShortsDismissibleBlocks();
}

// Catches Shorts that live inside generic "#dismissible" wrappers without
// over-matching: only removes a block when it contains a /shorts/ link or
// sits inside a known Shorts shelf/reel ancestor.
function removeShortsDismissibleBlocks() {
  const cfg = activeConfig.shortsRemoval;
  const blockSelector = joinSelectors(cfg.dismissibleSelectors);
  if (!blockSelector) return;
  const ancestorSelector = joinSelectors(cfg.shortsAncestorSelectors);
  const containerSelector = joinSelectors(cfg.dismissibleContainerSelectors);
  const linkSelector = joinSelectors(cfg.shortsLinkSelectors);
  const blocks = document.querySelectorAll(blockSelector);
  blocks.forEach((block) => {
    if (!block.isConnected) return;
    const inShortsAncestor = ancestorSelector ? block.closest(ancestorSelector) : null;
    if (!inShortsAncestor && !hasOnlyShortsLinks(block, linkSelector)) return;
    const container = containerSelector ? block.closest(containerSelector) : null;
    const target = container && !container.querySelector(regularVideoLinks) ? container : block;
    target.remove();
    sendCount();
  });
}

Promise.all([loadConfig(), loadPreference()]).then(() => {
  updateSidebar();
  removeIsShortsElements();
});

window.addEventListener("popstate", removeIsShortsElements);
window.addEventListener("hashchange", removeIsShortsElements);
window.addEventListener("load", removeIsShortsElements);

const scanAfterMutation = debounce(removeIsShortsElements, 100);
const observer = new MutationObserver(scanAfterMutation);
observer.observe(document.body, { childList: true, subtree: true });
