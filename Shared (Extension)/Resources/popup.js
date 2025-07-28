const hideShortsCheckBox = document.getElementById("hideShorts");
const storage = browser.storage.sync || browser.storage.local;

hideShortsCheckBox.addEventListener("change", (e) => {
  setValue(e.target.checked);
});

async function setValue(value) {
  await storage.set({ hideShorts: value });
  await browser.runtime.sendMessage({ type: "preference", hideShorts: value });
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

init().catch((e) => console.error(e));
