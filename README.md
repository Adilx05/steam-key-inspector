# Steam Key Inspector (Chrome Extension, MV3)

Steam Key Inspector detects game/package information from Steam's key-registration response on:

- `https://store.steampowered.com/account/registerkey`

## Features

- Manifest V3 extension with content script injection.
- Safe `window.fetch` interception for calls containing `ajaxregisterkey`.
- Extracts:
  - `purchase_receipt_info.line_items[].line_item_description`
  - package ID when present (`packageid` / `package_id`)
- Injected inline panel under the key input showing:
  - 🎮 Game Name
  - Package ID
  - SteamDB link (`https://steamdb.info/sub/{packageid}`)
- Handles response outcomes:
  - success
  - already owned
  - invalid/unknown key
- Toggle enable/disable persisted via `chrome.storage.local`.
- Copy-to-clipboard button for game name.
- Basic dark/light styling support via `prefers-color-scheme`.

## File Structure

```
steam-key-inspector/
├── manifest.json
├── content.js
├── styles.css
└── README.md
```

## Installation (Developer Mode)

1. Open Chrome and navigate to `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this project folder.

## Usage

1. Open `https://store.steampowered.com/account/registerkey`.
2. Enter and submit a Steam key as normal.
3. The panel under the key field updates automatically with detected game/package data.

## Notes on Safety and Compatibility

- No external libraries.
- No `eval` or dynamic code execution.
- Original network behavior is preserved (`fetch` result always returned untouched).
- Parsing/intercept errors are swallowed intentionally to avoid page breakage.

## Chrome Web Store Readiness

- Uses least-privilege permissions (`storage` + host permission for Steam domain).
- No remote code.
- No obfuscation.
- Single-purpose behavior scoped to the target Steam page.
