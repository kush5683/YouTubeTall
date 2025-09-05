const hideShortsCheckBox = document.getElementById("hideShorts");
const browserApi = typeof browser !== "undefined" ? browser : chrome;
const storage = browserApi.storage.sync || browserApi.storage.local;

function setVersion() {
  try {
    const manifest = browser?.runtime?.getManifest?.();
    const version = manifest && manifest.version ? manifest.version : "";
    const el = document.getElementById("extVersion");
    if (el && version) {
      el.textContent = `v${version}`;
      el.setAttribute("title", `Version ${version}`);
    }
  } catch (e) {
    // no-op
  }
}

hideShortsCheckBox.addEventListener("change", (e) => {
  setValue(e.target.checked);
});

async function setValue(value) {
  await storage.set({ hideShorts: value });
  await browserApi.runtime.sendMessage({ type: "preference", hideShorts: value });
}

async function init() {
  const result = await storage.get("hideShorts");
  let value = result.hideShorts;
  if (value === undefined) {
    value = true;
  }
  hideShortsCheckBox.checked = value;
  await setValue(value);
}

setVersion();
init().catch((e) => console.error(e));
