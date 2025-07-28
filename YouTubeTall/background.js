let totalHidden = 0;

browser.runtime.onMessage.addListener((request) => {
  if (request.type === "count") {
    totalHidden += request.count || 0;
    browser.browserAction.setBadgeText({ text: totalHidden.toString() });
    browser.browserAction.setBadgeBackgroundColor({ color: "#FF0000" });
  } else if (request.type === "reset") {
    totalHidden = 0;
    browser.browserAction.setBadgeText({ text: "" });
  }
});
