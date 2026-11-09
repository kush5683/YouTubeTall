const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { setImmediate: nextTurn, setTimeout: delay } = require("node:timers/promises");
const vm = require("node:vm");

const extensionDirs = {
  Chrome: path.join(__dirname, "..", "YouTubeTall"),
  Safari: path.join(__dirname, "..", "Shared (Extension)", "Resources"),
};
const sidebarMarker = "data-youtubetall-sidebar-hidden";

function resourcePath(platform, filename) {
  return path.join(extensionDirs[platform], filename);
}

function readManifest(platform) {
  return JSON.parse(readFileSync(resourcePath(platform, "manifest.json"), "utf8"));
}

function runScripts(filenames, globals, platform = "Chrome") {
  const context = vm.createContext(globals);
  for (const filename of filenames) {
    const sourcePath = resourcePath(platform, filename);
    vm.runInContext(readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  }
}

function browserFixture(preferences = {}, platform = "Chrome") {
  const messages = [];
  const saved = { ...preferences };
  const listeners = new Set();
  const api = {
    storage: {
      sync: {
        get: async () => ({ ...saved }),
        set: async (values) => Object.assign(saved, values),
      },
      onChanged: {
        addListener: (listener) => listeners.add(listener),
      },
    },
    runtime: {
      getManifest: () => readManifest(platform),
      sendMessage: async (message) => messages.push({ ...message }),
    },
  };
  function changePreference(key, value) {
    const detail = { [key]: { oldValue: saved[key], newValue: value } };
    saved[key] = value;
    for (const listener of listeners) listener(detail, "sync");
  }
  return { api, messages, saved, changePreference };
}

function videoCard({
  tag = "ytd-rich-item-renderer", id, marked = false, shortsLink = false, regularLink = false, parent,
} = {}) {
  const children = [];
  const card = {
    tagName: tag.toUpperCase(),
    id, parent, children,
    get isConnected() { return !this.removed && (!parent || parent.isConnected); },
    hasAttribute: (name) => marked && name === "is-shorts",
    querySelector(selector) {
      if (shortsLink && selector.includes("/shorts/")) return {};
      if (regularLink && selector.includes("/watch")) return {};
      return children.find((child) => !child.removed && child.querySelector(selector)) || null;
    },
    closest(selector) {
      const tags = selector.split(",").map((item) => item.trim());
      if (tags.includes(tag) || (marked && tags.includes("[is-shorts]"))) return this;
      return parent ? parent.closest(selector) : null;
    },
    removed: false,
    remove() { this.removed = true; },
  };
  if (parent) parent.children.push(card);
  return card;
}

function guideEntry(tag, title) {
  const attributes = new Map();
  const entry = {
    tag,
    title,
    removed: false,
    remove() { this.removed = true; },
    hasAttribute: (name) => attributes.has(name),
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: (name) => attributes.delete(name),
    anchor: { closest: (selector) => selector === tag ? entry : null },
  };
  return entry;
}

function startContent(cards, {
  pathname = "/feed/subscriptions", preferences, guideEntries = [], platform = "Chrome",
} = {}) {
  const fixture = browserFixture(preferences, platform);
  const observers = new Map();
  let cardScans = 0;
  const document = {
    body: {},
    querySelectorAll(selector) {
      if (selector === `[${sidebarMarker}]`) {
        return guideEntries.filter((entry) => !entry.removed && entry.hasAttribute(sidebarMarker));
      }
      const tags = selector.split(",").map((tag) => tag.trim());
      if (tags.includes("ytd-rich-item-renderer")) cardScans++;
      const matchingCards = cards.filter((card) => card.isConnected &&
        (tags.includes(card.tagName.toLowerCase()) || (card.id && tags.includes(`#${card.id}`)))
      );
      const matchingEntries = guideEntries.filter((entry) =>
        !entry.removed && tags.includes(`${entry.tag} a[title="${entry.title}"]`)
      );
      return [...matchingCards, ...matchingEntries.map((entry) => entry.anchor)];
    },
  };
  class MutationObserver {
    constructor(callback) { this.callback = callback; }
    observe(target, options) {
      if (target === document.body && options.subtree) observers.set(this, options);
    }
    disconnect() { observers.delete(this); }
  }
  function notifyBodyChange(attributeName) {
    const type = attributeName ? "attributes" : "childList";
    for (const [observer, options] of observers) {
      if (!options[type]) continue;
      if (attributeName && options.attributeFilter && !options.attributeFilter.includes(attributeName)) continue;
      observer.callback([{ type, attributeName }]);
    }
  }
  runScripts(readManifest(platform).content_scripts[0].js, {
    [platform === "Safari" ? "browser" : "chrome"]: fixture.api,
    document, location: { pathname },
    window: new EventTarget(), MutationObserver,
    setTimeout, clearTimeout,
  }, platform);
  return { ...fixture, notifyBodyChange, cardScans: () => cardScans };
}

test("Subscriptions removes marked cards, linked Shorts and reel shelves and counts each removal", async () => {
  const cards = [
    videoCard({ marked: true }), videoCard({ shortsLink: true }),
    videoCard({ tag: "ytd-reel-shelf-renderer" }), videoCard(),
  ];
  const { messages } = startContent(cards);
  await nextTurn();
  assert.deepEqual(cards.map((card) => card.removed), [true, true, true, false]);
  assert.deepEqual(messages, Array.from({ length: 3 }, () => ({ type: "count", count: 1 })));
});

test("History keeps Shorts and sends no badge updates", async () => {
  const card = videoCard({ marked: true });
  const { messages } = startContent([card], { pathname: "/feed/history" });
  await nextTurn();
  assert.equal(card.removed, false);
  assert.deepEqual(messages, []);
});

test("Subscriptions honors a saved Hide Shorts off setting on the initial scan", async () => {
  const card = videoCard({ marked: true });
  const { messages } = startContent([card], { preferences: { hideShorts: false } });
  await nextTurn();
  assert.equal(card.removed, false);
  assert.deepEqual(messages, []);
});

test("turning Hide Shorts on removes a newly available card", async () => {
  const cards = [];
  const { changePreference, messages } = startContent(cards, { preferences: { hideShorts: false } });
  await nextTurn();
  cards.push(videoCard({ shortsLink: true }));
  changePreference("hideShorts", true);
  assert.equal(cards[0].removed, true);
  assert.deepEqual(messages, [{ type: "count", count: 1 }]);
});

for (const platform of Object.keys(extensionDirs)) {
  test(`${platform} removes Shorts from mixed shelves and preserves regular cards and dismissible blocks`, async () => {
    const shelf = videoCard({ tag: "ytd-rich-shelf-renderer" });
    const regular = videoCard({ parent: shelf, regularLink: true });
    const ordinaryBlock = videoCard({ parent: regular, tag: "div", id: "dismissible" });
    const short = videoCard({ parent: shelf, shortsLink: true });
    const shortsBlock = videoCard({ parent: regular, tag: "div", id: "dismissible", shortsLink: true });
    const markedShelf = videoCard({ tag: "ytd-rich-shelf-renderer", marked: true });
    const linkedShelf = videoCard({ tag: "ytd-rich-shelf-renderer", shortsLink: true });
    const plainShelf = videoCard({ tag: "ytd-rich-shelf-renderer" });
    const cards = [shelf, regular, ordinaryBlock, short, shortsBlock, markedShelf, linkedShelf, plainShelf];
    const { messages } = startContent(cards, { platform });
    await nextTurn();
    assert.ok([shelf, regular, ordinaryBlock, plainShelf].every((card) => card.isConnected));
    assert.ok([short, shortsBlock, markedShelf, linkedShelf].every((card) => !card.isConnected));
    assert.deepEqual(messages, Array.from({ length: 4 }, () => ({ type: "count", count: 1 })));
  });

  test(`${platform} loads the rule that hides marked sidebar entries`, () => {
    const { css = [] } = readManifest(platform).content_scripts[0];
    const rules = css.map((file) => readFileSync(resourcePath(platform, file), "utf8")).join("\n");
    assert.match(rules, /\[data-youtubetall-sidebar-hidden\]\s*\{[^}]*\bdisplay\s*:\s*none\b/);
  });

  test(`${platform} independently hides and restores the same sidebar entries in both guide sizes`, async () => {
    const entries = ["ytd-guide-entry-renderer", "ytd-mini-guide-entry-renderer"].flatMap((tag) =>
      ["Shorts", "YouTube Music", "Subscriptions"].map((title) => guideEntry(tag, title))
    );
    entries[0].setAttribute("aria-current", "page");
    entries[1].setAttribute("hidden", "");
    const { changePreference, messages } = startContent([], { platform, guideEntries: entries });
    function assertHidden(shorts, music) {
      assert.ok(entries.every((entry) => !entry.removed), "Original entries must stay attached");
      const hidden = entries.map((entry) => entry.hasAttribute(sidebarMarker));
      assert.deepEqual(hidden, [shorts, music, false, shorts, music, false]);
    }
    await nextTurn();
    assertHidden(false, false);
    changePreference("hideShortsNav", true);
    assertHidden(true, false);
    changePreference("hideMusicNav", true);
    assertHidden(true, true);
    changePreference("hideShortsNav", false);
    assertHidden(false, true);
    changePreference("hideShortsNav", true);
    assertHidden(true, true);
    changePreference("hideMusicNav", false);
    assertHidden(true, false);
    changePreference("hideShortsNav", false);
    assertHidden(false, false);
    assert.ok(entries[0].hasAttribute("aria-current"));
    assert.ok(entries[1].hasAttribute("hidden"));
    assert.deepEqual(messages, Array.from({ length: 6 }, () => ({ type: "count", count: 1 })));
  });

  test(`${platform} applies saved sidebar settings to existing, newly rendered and recycled entries`, async () => {
    const entries = [guideEntry("ytd-guide-entry-renderer", "Shorts")];
    const { changePreference, messages, notifyBodyChange } = startContent([], {
      platform, guideEntries: entries, preferences: { hideShortsNav: true },
    });
    await nextTurn();
    assert.equal(entries[0].hasAttribute(sidebarMarker), true);

    entries.push(guideEntry("ytd-mini-guide-entry-renderer", "Shorts"));
    notifyBodyChange();
    await delay(150);
    assert.equal(entries[0].hasAttribute(sidebarMarker), true);
    assert.equal(entries[1].hasAttribute(sidebarMarker), true);
    entries[0].title = "Home";
    notifyBodyChange("title");
    await delay(150);
    assert.equal(entries[0].hasAttribute(sidebarMarker), false);
    assert.equal(entries[1].hasAttribute(sidebarMarker), true);
    changePreference("hideShortsNav", false);
    assert.ok(entries.every((entry) => !entry.removed && !entry.hasAttribute(sidebarMarker)));
    assert.deepEqual(messages, [{ type: "count", count: 1 }, { type: "count", count: 1 }]);
  });
}

test("Safari reapplies changed selector overrides and restores previous matches", async () => {
  const tag = "ytd-guide-entry-renderer";
  const entries = [guideEntry(tag, "Shorts"), guideEntry(tag, "Clips")];
  const { changePreference } = startContent([], {
    platform: "Safari", guideEntries: entries, preferences: { hideShortsNav: true },
  });
  const hidden = () => entries.map((entry) => entry.hasAttribute(sidebarMarker));
  await nextTurn();
  assert.deepEqual(hidden(), [true, false]);
  changePreference("selectorConfig", {
    schemaVersion: 1, sidebarShorts: { fullGuideSelectors: [`${tag} a[title="Clips"]`] },
  });
  assert.deepEqual(hidden(), [false, true]);
  changePreference("selectorConfig", undefined);
  assert.deepEqual(hidden(), [true, false]);
});

test("a burst of DOM mutations schedules one scan that removes a newly inserted Short", async () => {
  const cards = [];
  const { cardScans, messages, notifyBodyChange } = startContent(cards);
  await nextTurn();
  const initialScans = cardScans();
  cards.push(videoCard({ shortsLink: true }), videoCard());
  notifyBodyChange();
  notifyBodyChange();
  assert.equal(cardScans(), initialScans);
  await delay(150);
  assert.equal(cardScans(), initialScans + 1);
  assert.deepEqual(cards.map((card) => card.removed), [true, false]);
  assert.deepEqual(messages, [{ type: "count", count: 1 }]);
});

async function startPopup(preferences) {
  const fixture = browserFixture(preferences);
  const elements = {};
  for (const id of ["hideShorts", "hideShortsNav", "hideMusicNav", "extVersion"]) {
    const element = new EventTarget();
    element.checked = false;
    element.textContent = "";
    element.setAttribute = (key, value) => { element[key] = value; };
    elements[id] = element;
  }
  runScripts(["popup.js"], {
    chrome: fixture.api,
    document: { getElementById: (id) => elements[id] },
    console,
  });
  await nextTurn();
  return { ...fixture, elements };
}

test("popup checks Hide Shorts by default and leaves both sidebar options off", async () => {
  const { elements } = await startPopup();
  assert.equal(elements.hideShorts.checked, true);
  assert.equal(elements.hideShortsNav.checked, false);
  assert.equal(elements.hideMusicNav.checked, false);
});

test("popup restores saved settings and persists each checkbox change", async () => {
  const preferences = { hideShorts: false, hideShortsNav: true, hideMusicNav: true };
  const { elements, saved, messages } = await startPopup(preferences);
  for (const [key, value] of Object.entries(preferences)) {
    assert.equal(elements[key].checked, value);
    elements[key].checked = !value;
    elements[key].dispatchEvent(new Event("change"));
    await nextTurn();
    assert.equal(saved[key], !value);
    assert.deepEqual(messages.at(-1), { type: "preference", [key]: !value });
  }
});

test("popup displays the manifest version when Chrome exposes only the chrome API", async () => {
  const { elements } = await startPopup();
  assert.equal(elements.extVersion.textContent, `v${readManifest("Chrome").version}`);
});

test("background badge accumulates counts, ignores unrelated messages and resets", () => {
  const badgeText = [];
  const badgeColors = [];
  let onMessage;
  runScripts(["background.js"], {
    chrome: {
      runtime: { onMessage: { addListener(listener) { onMessage = listener; } } },
      action: {
        setBadgeText: ({ text }) => badgeText.push(text),
        setBadgeBackgroundColor: ({ color }) => badgeColors.push(color),
      },
    },
  });
  for (const message of [
    { type: "count", count: 1 }, { type: "count", count: 2 }, { type: "preference" },
    { type: "reset" }, { type: "count", count: 1 },
  ]) {
    onMessage(message);
  }
  assert.deepEqual(badgeText, ["1", "3", "", "1"]);
  assert.deepEqual(badgeColors, ["#FF0000", "#FF0000", "#FF0000"]);
});
