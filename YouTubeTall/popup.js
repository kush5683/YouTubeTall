const hideShortsCheckBox = document.getElementById("hideShorts");
const hideShortsNavCheckBox = document.getElementById("hideShortsNav");
const hideMusicNavCheckBox = document.getElementById("hideMusicNav");
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

hideShortsCheckBox.addEventListener("change", (e) => setValues({ hideShorts: e.target.checked }));
hideShortsNavCheckBox.addEventListener("change", (e) => setValues({ hideShortsNav: e.target.checked }));
hideMusicNavCheckBox.addEventListener("change", (e) => setValues({ hideMusicNav: e.target.checked }));

async function setValues(values) {
  await storage.set(values);
  await browserApi.runtime.sendMessage({ type: "preference", ...values });
}

async function init() {
  const result = await storage.get(["hideShorts", "hideShortsNav", "hideMusicNav"]);
  const hideShorts = result.hideShorts !== undefined ? result.hideShorts : true;
  const hideShortsNav = result.hideShortsNav !== undefined ? result.hideShortsNav : false;
  const hideMusicNav = result.hideMusicNav !== undefined ? result.hideMusicNav : false;
  hideShortsCheckBox.checked = hideShorts;
  hideShortsNavCheckBox.checked = hideShortsNav;
  hideMusicNavCheckBox.checked = hideMusicNav;
  await setValues({ hideShorts, hideShortsNav, hideMusicNav });
}

setVersion();
init().catch((e) => console.error(e));
