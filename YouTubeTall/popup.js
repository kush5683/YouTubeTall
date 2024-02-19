var hideShortsCheckBox = document.getElementById("hideShorts");

hideShortsCheckBox.addEventListener("change", (e) => {
  setValue(e.target.checked);
});

async function setValue(value) {
  await browser.storage.local.set({ value });
}

async function init() {
  let value;
  browser.local.storage.get("value").then((result) => (value = result.value));
  if (value === undefined) {
    value = true;
  }
  hideShortsCheckBox.checked = value;
  setValue(value);
}

init().catch((e) => console.error(e));
