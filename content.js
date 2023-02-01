browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.value) {
    console.log(changes.value.newValue);
    if (!changes.value.newValue) {
      window.location.reload();
    }
    update(changes.value.newValue);
  }
});

function update(value) {
  if (!value) {
    return;
  } else {
    var vids = document.querySelectorAll("ytd-grid-video-renderer");

      for (let i = 0; i < vids.length; i++) {
        if (vids[i].innerHTML.includes('aria-label="Shorts"')) {
          vids[i].remove();
        }
      }
    
  }
}

browser.storage.local.get("value").then((result) => console.log(result.value));
setTimeout(function () {
  browser.storage.local.get("value").then((result) => update(result.value));
}, 1000);
