(() => {
  const input = document.querySelector("textarea");
  const button = document.querySelector("button");
  let busy = false;
  let composing = false;

  function send(event) {
    if (!event.isTrusted || busy) return;
    const prompt = input.value.trim();
    if (!prompt) return;
    input.value = "";
    setBusy(true);
    parent.postMessage({ type: "CAA_FLOATING_COMPOSER_SEND", prompt }, "*");
  }

  function setBusy(value) {
    busy = value;
    input.disabled = busy;
    button.disabled = busy;
    if (!busy) input.focus();
  }

  input.addEventListener("compositionstart", () => { composing = true; });
  input.addEventListener("compositionend", () => { composing = false; });
  input.addEventListener("keydown", (event) => {
    if (!event.isTrusted || event.key !== "Enter" || event.shiftKey || composing || event.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    send(event);
  });
  button.addEventListener("click", (event) => {
    event.preventDefault();
    send(event);
  });
  document.querySelector("form").addEventListener("submit", (event) => event.preventDefault());
  window.addEventListener("message", (event) => {
    if (!event.isTrusted || event.source !== parent) return;
    if (event.data?.type === "CAA_FLOATING_COMPOSER_BUSY" && typeof event.data.busy === "boolean") setBusy(event.data.busy);
    if (event.data?.type === "CAA_FLOATING_COMPOSER_FOCUS") input.focus();
  });
  parent.postMessage({ type: "CAA_FLOATING_COMPOSER_READY" }, "*");
})();
