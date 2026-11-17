// Music Window — send links/tabs to a dedicated Chrome window.
//
// How the music window is found:
//   1. The window ID remembered this browser session (storage.session).
//   2. After a Chrome restart, window IDs change, so we match against a saved
//      snapshot of the music window's tab URLs (storage.local).
//   3. Failing that, the window where most tabs are music sites.
//   4. Failing that, a new window is created and becomes the music window.

const MUSIC_HOSTS = [
  "bandcamp.com", "soundcloud.com", "music.youtube.com", "open.spotify.com",
  "mixcloud.com", "discogs.com", "nts.live", "music.apple.com", "beatport.com",
  "boomkat.com", "juno.co.uk", "ra.co", "last.fm", "rateyourmusic.com",
  "dublab.com", "kexp.org", "bleep.com", "hhv.de", "whatpeopleplay.com",
];

const MENU_OPEN_LINK = "open-link-in-music";
const MENU_MOVE_TAB = "move-tab-to-music";
const MENU_SET_WINDOW = "set-music-window";

// ---------- setup ----------

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_OPEN_LINK,
      title: "Open link in Music window",
      contexts: ["link"],
    });
    chrome.contextMenus.create({
      id: MENU_MOVE_TAB,
      title: "Move this tab to Music window",
      contexts: ["page"],
    });
    chrome.contextMenus.create({
      id: MENU_SET_WINDOW,
      title: "Set this window as the Music window",
      contexts: ["action"], // right-click the toolbar icon
    });
  });
});

// ---------- entry points ----------

chrome.contextMenus.onClicked.addListener((info, tab) => {
  switch (info.menuItemId) {
    case MENU_OPEN_LINK: return openUrlInMusic(info.linkUrl, tab);
    case MENU_MOVE_TAB: return moveTabToMusic(tab);
    case MENU_SET_WINDOW: return setMusicWindow(tab.windowId);
  }
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  tab ??= (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
  if (!tab) return;
  switch (command) {
    case "move-tab-to-music": return moveTabToMusic(tab);
    case "toggle-music-window": return toggleMusicWindow(tab.windowId);
    case "set-music-window": return setMusicWindow(tab.windowId);
  }
});

// Clicking the toolbar icon moves the current tab.
chrome.action.onClicked.addListener((tab) => moveTabToMusic(tab));

// ---------- Option+click (from content.js) ----------
//
// For real links, content.js sends the URL directly ("open").
// For JS-driven clicks (e.g. tweets on X), it sends "arm" on mousedown; the next
// tab that page opens is moved to the music window. The two events can arrive
// in either order, so we keep a short memory of each.

const ARM_MS = 2000;        // how long an "arm" waits for a new tab
const EARLY_TAB_MS = 1000;  // how long a new tab waits for a late "arm"
const armed = new Map();    // sourceTabId -> time armed
let recentTabs = [];        // [{ tabId, sourceTabId, t }]
const handled = new Set();  // new tabs already moved

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!sender.tab) return;
  if (msg.type === "open") openUrlInMusic(msg.url, sender.tab);
  if (msg.type === "arm") arm(sender.tab.id);
});

chrome.webNavigation.onCreatedNavigationTarget.addListener((d) => onNewTab(d.tabId, d.sourceTabId));
chrome.tabs.onCreated.addListener((tab) => onNewTab(tab.id, tab.openerTabId));

function arm(sourceTabId) {
  const now = Date.now();
  recentTabs = recentTabs.filter((r) => now - r.t < EARLY_TAB_MS);
  const hit = recentTabs.find((r) => r.sourceTabId === sourceTabId);
  if (hit) {
    recentTabs = recentTabs.filter((r) => r.tabId !== hit.tabId);
    return moveNewTab(hit.tabId);
  }
  armed.set(sourceTabId, now);
}

function onNewTab(tabId, sourceTabId) {
  if (sourceTabId == null || handled.has(tabId)) return;
  const now = Date.now();
  if (now - (armed.get(sourceTabId) ?? 0) < ARM_MS) {
    armed.delete(sourceTabId);
    return moveNewTab(tabId);
  }
  if (!recentTabs.some((r) => r.tabId === tabId)) {
    recentTabs.push({ tabId, sourceTabId, t: now });
  }
}

async function moveNewTab(tabId) {
  handled.add(tabId);
  try {
    await moveTabToMusic(await chrome.tabs.get(tabId));
  } catch {} // tab already closed
}

// ---------- actions ----------

async function openUrlInMusic(url, sourceTab) {
  if (!url) return;
  const win = await findMusicWindow(sourceTab?.windowId);
  if (win) {
    await chrome.tabs.create({ windowId: win.id, url, active: false });
    await remember(win.id);
    flash("✓");
  } else {
    const created = await chrome.windows.create({ url, focused: false });
    await remember(created.id);
    flash("new");
  }
}

async function moveTabToMusic(tab) {
  if (!tab) return;
  const win = await findMusicWindow(tab.windowId);
  if (win?.id === tab.windowId) return flash("—"); // already in the music window

  if (win) {
    await chrome.tabs.move(tab.id, { windowId: win.id, index: -1 });
    await remember(win.id);
    flash("✓");
  } else {
    const created = await chrome.windows.create({ tabId: tab.id, focused: false });
    await remember(created.id);
    flash("new");
  }
}

async function toggleMusicWindow(currentWindowId) {
  const win = await findMusicWindow();
  if (!win) return flash("?");

  if (win.id === currentWindowId) {
    // Already in the music window: jump back to where we came from.
    const { returnWindowId } = await chrome.storage.session.get("returnWindowId");
    if (returnWindowId != null) {
      try { await chrome.windows.update(returnWindowId, { focused: true }); } catch {}
    }
  } else {
    await chrome.storage.session.set({ returnWindowId: currentWindowId });
    await chrome.windows.update(win.id, { focused: true });
  }
}

async function setMusicWindow(windowId) {
  await remember(windowId);
  flash("♪");
}

// ---------- finding the music window ----------

async function findMusicWindow(excludeWindowId) {
  // 1. Remembered this session.
  const { musicWindowId } = await chrome.storage.session.get("musicWindowId");
  if (musicWindowId != null) {
    try { return await chrome.windows.get(musicWindowId); } catch {}
  }

  const windows = (await chrome.windows.getAll({ populate: true, windowTypes: ["normal"] }))
    .filter((w) => w.id !== excludeWindowId && !w.incognito);
  if (!windows.length) return null;

  // 2. Matches the saved snapshot of the music window's tabs (survives restarts).
  const { musicUrls = [] } = await chrome.storage.local.get("musicUrls");
  const saved = new Set(musicUrls);
  let best = pickBest(windows, (tabs) => {
    const hits = tabs.filter((u) => saved.has(u)).length;
    return hits >= Math.min(3, saved.size) ? hits : 0;
  });

  // 3. Mostly music sites.
  best ??= pickBest(windows, (tabs) => {
    const hits = tabs.filter(isMusicUrl).length;
    return hits >= 2 && hits / tabs.length >= 0.5 ? hits : 0;
  });

  if (best) await remember(best.id);
  return best;
}

function pickBest(windows, scoreFn) {
  let best = null, bestScore = 0;
  for (const w of windows) {
    const urls = w.tabs.map((t) => t.url || t.pendingUrl || "");
    const score = scoreFn(urls);
    if (score > bestScore) { best = w; bestScore = score; }
  }
  return best;
}

function isMusicUrl(url) {
  try {
    const host = new URL(url).hostname;
    return MUSIC_HOSTS.some((d) => host === d || host.endsWith("." + d));
  } catch {
    return false;
  }
}

// Remember the window for this session and snapshot its URLs for after restarts.
async function remember(windowId) {
  await chrome.storage.session.set({ musicWindowId: windowId });
  const tabs = await chrome.tabs.query({ windowId });
  const urls = tabs
    .map((t) => t.url || t.pendingUrl || "")
    .filter((u) => u.startsWith("http"));
  await chrome.storage.local.set({ musicUrls: urls.slice(0, 500) });
}

// ---------- feedback ----------

function flash(text) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color: "#1da0c3" });
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), 1500);
}
