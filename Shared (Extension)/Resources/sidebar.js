function guideSection(anchorSelectors) {
  const fullGuideContainer = "ytd-guide-entry-renderer";
  const miniGuideContainer = "ytd-mini-guide-entry-renderer";
  return {
    fullGuideContainer,
    fullGuideSelectors: anchorSelectors.map(selector => `${fullGuideContainer} ${selector}`),
    miniGuideContainer,
    miniGuideSelectors: anchorSelectors.map(selector => `${miniGuideContainer} ${selector}`),
  };
}

const defaultShortsGuide = guideSection([
  'a[title="Shorts"]', 'a[aria-label="Shorts"]', 'a[href*="/shorts"]',
]);
const defaultMusicGuide = guideSection([
  'a[href*="music.youtube.com"]', 'a[title="YouTube Music"]', 'a[aria-label="YouTube Music"]',
]);

function createSidebarFilter(onHide) {
  const marker = "data-youtubetall-sidebar-hidden";
  let sections = [];
  let timer;

  function update() {
    timer = undefined;
    const matches = new Set();
    for (const section of sections) {
      for (const variant of ["fullGuide", "miniGuide"]) {
        const selector = section[`${variant}Selectors`]?.join(",");
        const container = section[`${variant}Container`];
        if (!selector || !container) continue;
        for (const anchor of document.querySelectorAll(selector)) {
          const entry = anchor.closest(container);
          if (entry) matches.add(entry);
        }
      }
    }

    for (const entry of document.querySelectorAll(`[${marker}]`)) {
      if (!matches.has(entry)) entry.removeAttribute(marker);
    }
    for (const entry of matches) {
      if (entry.hasAttribute(marker)) continue;
      entry.setAttribute(marker, "");
      onHide();
    }
  }

  // YouTube can replace a guide entry or reuse it for a different link.
  const observer = new MutationObserver(() => {
    if (timer === undefined) timer = setTimeout(update, 100);
  });

  return function setSections(...enabledSections) {
    sections = enabledSections.filter(Boolean);
    observer.disconnect();
    clearTimeout(timer);
    if (sections.length) {
      observer.observe(document.body, {
        childList: true, subtree: true, attributes: true,
        attributeFilter: ["href", "title", "aria-label"],
      });
    }
    update();
  };
}
