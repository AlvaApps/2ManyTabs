// Runs in the page's own JavaScript world (needed to intercept window.open).
//
// content.js asks us to replay an Option+click as a Cmd+click. While the replay
// runs, we capture any tab the site tries to open — via window.open() or by
// script-clicking a link — and report its URL back instead of letting it open.
// Everything here is synchronous, so content.js gets the answer immediately.

(() => {
  window.addEventListener("music-window:replay", (req) => {
    const target = req.target;
    const init = JSON.parse(req.detail);
    let captured = null;

    const capture = (url) => {
      try {
        const abs = new URL(url, location.href).href;
        if (!captured && /^https?:/i.test(abs)) captured = abs;
      } catch {}
    };

    const replay = new MouseEvent("click", {
      ...init,
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      button: 0,
      buttons: 0,
      metaKey: true,
    });

    // Catch window.open(...)
    const realOpen = window.open;
    window.open = function (url) {
      if (url != null && url !== "") capture(String(url));
      return null; // same as a blocked popup; sites handle this
    };

    // Catch the site creating a link and clicking it.
    const grabLinkClick = (e) => {
      if (e === replay) return;
      for (const el of e.composedPath()) {
        if (el.tagName === "A" && typeof el.href === "string" && el.href) {
          capture(el.href);
          e.preventDefault();
          e.stopImmediatePropagation();
          return;
        }
      }
    };
    window.addEventListener("click", grabLinkClick, true);

    try {
      target.dispatchEvent(replay);
    } finally {
      window.open = realOpen;
      window.removeEventListener("click", grabLinkClick, true);
    }

    document.dispatchEvent(new CustomEvent("music-window:result", { detail: captured || "" }));
  }, true);
})();
