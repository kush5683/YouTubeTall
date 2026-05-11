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
    shortsCardTags: ["ytd-reel-shelf-renderer", "ytd-rich-shelf-renderer"],
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
      "ytd-rich-shelf-renderer",
    ],
  },
  sidebarShorts: {
    fullGuideSelectors: [
      'ytd-guide-entry-renderer a[title="Shorts"]',
      'ytd-guide-entry-renderer a[aria-label="Shorts"]',
      'ytd-guide-entry-renderer a[href*="/shorts"]',
    ],
    fullGuideContainer: "ytd-guide-entry-renderer",
    miniGuideSelectors: [
      'ytd-mini-guide-entry-renderer a[title="Shorts"]',
      'ytd-mini-guide-entry-renderer a[aria-label="Shorts"]',
      'ytd-mini-guide-entry-renderer a[href*="/shorts"]',
    ],
    miniGuideContainer: "ytd-mini-guide-entry-renderer",
  },
  sidebarMusic: {
    fullGuideSelectors: [
      'ytd-guide-entry-renderer a[href*="music.youtube.com"]',
      'ytd-guide-entry-renderer a[title="YouTube Music"]',
      'ytd-guide-entry-renderer a[aria-label="YouTube Music"]',
    ],
    fullGuideContainer: "ytd-guide-entry-renderer",
    miniGuideSelectors: [
      'ytd-mini-guide-entry-renderer a[href*="music.youtube.com"]',
      'ytd-mini-guide-entry-renderer a[title="YouTube Music"]',
      'ytd-mini-guide-entry-renderer a[aria-label="YouTube Music"]',
    ],
    miniGuideContainer: "ytd-mini-guide-entry-renderer",
  },
};

let activeConfig = DEFAULT_CONFIG;
let hideShorts = true;
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

loadConfig();
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
  if (changes.selectorConfig) {
    activeConfig = mergeConfig(DEFAULT_CONFIG, changes.selectorConfig.newValue);
    if (hideShorts) removeIsShortsElements();
    if (hideShortsNav) removeGuideShortsEntry();
    if (hideMusicNav) removeGuideMusicEntry();
  }
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

function isShortsCard(card) {
  if (!card) return false;
  const cfg = activeConfig.shortsRemoval;
  for (const attr of cfg.shortsAttributes) {
    if (card.hasAttribute(attr)) return true;
  }
  const linkSelector = joinSelectors(cfg.shortsLinkSelectors);
  if (linkSelector && card.querySelector(linkSelector)) return true;
  const tag = card.tagName ? card.tagName.toLowerCase() : "";
  if (tag && cfg.shortsCardTags.some((t) => t.toLowerCase() === tag)) return true;
  return false;
}

function removeIsShortsElements() {
  if (!hideShorts) return;
  if (!activeConfig.shortsRemoval.enabled) return;
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
    const hasShortLink = linkSelector ? block.querySelector(linkSelector) : null;
    const inShortsAncestor = ancestorSelector ? block.closest(ancestorSelector) : null;
    if (hasShortLink || inShortsAncestor) {
      const container = containerSelector ? block.closest(containerSelector) : null;
      if (container) {
        container.remove();
      } else {
        block.remove();
      }
      sendCount();
    }
  });
}

function removeSidebarEntry(sectionKey) {
  const cfg = activeConfig[sectionKey];
  if (!cfg) return;
  for (const variant of ["fullGuide", "miniGuide"]) {
    const selectors = cfg[`${variant}Selectors`];
    const container = cfg[`${variant}Container`];
    const selector = joinSelectors(selectors);
    if (!selector || !container) continue;
    const anchors = document.querySelectorAll(selector);
    anchors.forEach((anchor) => {
      const containerEl = anchor.closest(container);
      if (containerEl) {
        containerEl.remove();
        sendCount();
      }
    });
  }
}

function removeGuideShortsEntry() {
  if (!hideShortsNav) return;
  removeSidebarEntry("sidebarShorts");
}

function removeGuideMusicEntry() {
  if (!hideMusicNav) return;
  removeSidebarEntry("sidebarMusic");
}

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
  Promise.all([loadConfig(), loadPreference()]).then(() => {
    removeIsShortsElements();
    removeGuideShortsEntry();
    removeGuideMusicEntry();
  });
}, false);
