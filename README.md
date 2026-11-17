# Music Window

A Chrome extension that keeps your music in one window. Send links and tabs to a dedicated "music window" without leaving the page you're on, and jump to it and back with one shortcut.

If you browse Bandcamp, SoundCloud, Discogs and the like while doing other things, you end up with music tabs scattered across every window. Music Window gives them a single home.

## What it does

| Action | How |
| --- | --- |
| Open a link in the music window | <kbd>Option</kbd>+click it (<kbd>Alt</kbd>+click on Windows/Linux), or right-click → **Open link in Music window** |
| Move the current tab to the music window | Click the toolbar icon, press <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>M</kbd>, or right-click the page → **Move this tab to Music window** |
| Jump to the music window, and back again | <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>J</kbd> |
| Choose which window is the music window | Right-click the toolbar icon → **Set this window as the Music window** |

Links open in the background, so your current window keeps focus.

The toolbar icon briefly shows a badge to confirm what happened:

| Badge | Meaning |
| --- | --- |
| `✓` | Sent to the music window |
| `new` | No music window was found, so a new one was created |
| `—` | This tab is already in the music window |
| `♪` | This window is now the music window |
| `?` | No music window to jump to |

## Install

Music Window is not on the Chrome Web Store, so load it unpacked:

1. Clone or download this repository.
2. Open `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the repository folder.

Tabs that were already open need a refresh before <kbd>Option</kbd>+click works in them.

Shortcuts can be changed at `chrome://extensions/shortcuts`. "Set current window as the Music window" has no default shortcut, but you can assign one there.

It should also work in other Chromium browsers (Edge, Brave, Arc), though it has only been used in Chrome.

## How the music window is found

You don't have to set anything up. The extension looks for the music window in this order:

1. **The window it used last** in this browser session.
2. **A saved snapshot of the music window's tabs.** Window IDs change when Chrome restarts, so the extension remembers the URLs that were open in the music window and finds the window that still has them.
3. **The window that is mostly music sites**: at least two music tabs, making up half or more of the window. The list of recognised sites is `MUSIC_HOSTS` at the top of [`background.js`](background.js); edit it to suit your own listening.
4. **Otherwise, a new window** is created and becomes the music window.

If it picks the wrong window, set the right one from the toolbar icon's right-click menu. Incognito windows are never used.

## Option+click on things that aren't links

Some sites open pages with JavaScript instead of real links. A post on X, for example, opens in a new tab when you <kbd>Cmd</kbd>+click it, but there is no link to read a URL from.

For these, the extension replays your click as a <kbd>Cmd</kbd>+click, catches the URL the site tries to open, and opens that in the music window instead, so no tab appears in your current window. If the URL can't be caught, it lets the site open its tab and then moves that tab across, which may flash briefly.

This replay uses the <kbd>Cmd</kbd> key, so it is aimed at macOS. On Windows and Linux, <kbd>Alt</kbd>+click works on ordinary links, but may do nothing on JavaScript-driven elements.

Note that <kbd>Option</kbd>+click normally downloads a link in Chrome. The extension replaces that behaviour.

## Permissions

| Permission | Why it's needed |
| --- | --- |
| `tabs` | Read tab URLs to recognise the music window, and move and create tabs |
| `contextMenus` | Add the right-click menu items |
| `storage` | Remember which window is the music window |
| `webNavigation` | Notice tabs opened by a page, for the click fallback described above |
| Content scripts on all sites | Detect <kbd>Option</kbd>+click on any page |

Nothing leaves your browser. The extension makes no network requests and has no analytics. The only data stored is the music window's ID and a list of its tab URLs, both kept locally in Chrome's extension storage.

## Files

| File | Role |
| --- | --- |
| [`manifest.json`](manifest.json) | Extension manifest (Manifest V3) |
| [`background.js`](background.js) | Service worker: menus, shortcuts, finding the music window, moving tabs |
| [`content.js`](content.js) | Detects <kbd>Option</kbd>+click and tells the service worker what to open |
| [`main-world.js`](main-world.js) | Runs in the page's own JavaScript context to catch `window.open` calls during a replayed click |

There is no build step and there are no dependencies. After editing a file, reload the extension at `chrome://extensions`.
