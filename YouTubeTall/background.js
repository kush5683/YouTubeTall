const browserApi = typeof browser !== "undefined" ? browser : chrome;
let totalHidden = 0;
const actionApi = browserApi.action || browserApi.browserAction;

browserApi.runtime.onMessage.addListener((request) => {
  if (request.type === "count") {
    totalHidden += request.count || 0;
    actionApi.setBadgeText({ text: totalHidden.toString() });
    actionApi.setBadgeBackgroundColor({ color: "#FF0000" });
  } else if (request.type === "reset") {
    totalHidden = 0;
    actionApi.setBadgeText({ text: "" });
  }
});
