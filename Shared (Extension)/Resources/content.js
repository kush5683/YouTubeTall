// Debounce function to limit the frequency of function calls
function debounce(func, wait) {
  let timeout;
  return function (...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
}

// Function to remove elements with the 'is-shorts' property
function removeIsShortsElements() {
  // Select all elements with the 'is-shorts' attribute
  const elementsWithIsShorts = document.querySelectorAll("[is-shorts]");

  // Iterate through each element and remove it
  elementsWithIsShorts.forEach((element) => {
    element.remove();
  });
}

// Function to handle DOM mutations and call removeIsShortsElements()
function handleDomMutations(mutations) {
  for (let mutation of mutations) {
    if (mutation.type === "childList") {
      debouncedRemoveIsShortsElements();
    }
  }
}

removeIsShortsElements();

// Debounce removeIsShortsElements() with a 100ms delay
const debouncedRemoveIsShortsElements = debounce(removeIsShortsElements, 100);

// Observe DOM changes and call removeIsShortsElements() when necessary
const observer = new MutationObserver(handleDomMutations);
observer.observe(document.body, { childList: true, subtree: true });
