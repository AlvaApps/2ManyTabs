// Option+click → send to the Music window.
//
// - Clicking a real link: we cancel the click (which would otherwise download the
//   link) and open its URL in the music window.
// - Clicking something that isn't a link (e.g. a tweet on X, which opens a tab via
//   JavaScript on Cmd+click): main-world.js replays the click as a Cmd+click and
//   captures the URL the site tries to open, without letting it open. We then
//   open that URL in the music window — no tab ever appears in this window.
// - If capturing fails, we fall back to letting the site open its tab and having
//   the background script move it (may flash briefly).

(() => {
  const isCombo = (e) =>
    e.isTrusted && e.button === 0 && e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey;

  function linkUrl(e) {
    for (const el of e.composedPath()) {
      if (el.tagName === "A" && typeof el.href === "string" && /^https?:/i.test(el.href)) {
        return el.href;
      }
    }
    return null;
  }

  const send = (msg) => {
    try { chrome.runtime.sendMessage(msg); } catch {} // extension was reloaded; page needs refresh
  };

  // Result from main-world.js. Only accepted while we're waiting on our own
  // replay (which is synchronous), so the page can't fake one.
  let awaiting = false;
  let result = null;
  document.addEventListener("music-window:result", (e) => {
    if (awaiting) result = e.detail;
  }, true);

  window.addEventListener("click", (e) => {
    if (!isCombo(e)) return;
    e.preventDefault();
    e.stopImmediatePropagation();

    const url = linkUrl(e);
    if (url) return send({ type: "open", url });

    // Not a link: ask main-world.js to replay it as Cmd+click and capture the URL.
    const target = e.composedPath()[0] || e.target;
    awaiting = true;
    result = null;
    try {
      target.dispatchEvent(new CustomEvent("music-window:replay", {
        bubbles: true,
        composed: true,
        detail: JSON.stringify({
          detail: e.detail,
          screenX: e.screenX, screenY: e.screenY,
          clientX: e.clientX, clientY: e.clientY,
        }),
      }));
    } finally {
      awaiting = false;
    }

    if (result) send({ type: "open", url: result });
    else send({ type: "arm" }); // fallback: move whatever tab the site opened
  }, true);
})();
