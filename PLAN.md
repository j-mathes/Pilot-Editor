# Pilot Editor: Implementation Plan

A static, framework-free browser app that combines the X-Wing (`.plt`) and TIE Fighter (`.tfr`) pilot editors. Three files only: `index.html`, `app.js`, `styles.css`. It runs from `file://` and from GitHub Pages.

Legacy C# sources, offset docs and sample pilot files are in `reference/X-Wing/` and `reference/TIE-Fighter/` (read-only reference; never modify).

## Findings from the reference projects

- **Formats**
  - X-Wing `.plt`: 1705 bytes (a 3410-byte variant is also accepted by the legacy app).
  - TIE `.tfr`: 3856 bytes = 1928-byte active pilot + 1928-byte backup copy.
  - Sample `TOPACE.PLT` / `IPTOPACE.PLT` are 1706 bytes, which the legacy editor rejects.
- **Encoding:** little-endian throughout. TIE scores are signed 32-bit; everything else is unsigned.
- **Offsets** are hard-coded in long `switch` blocks in the legacy code. The new app expresses them once as data tables.
- **Legacy quirks (do not carry over)**
  - TIE: historic-combat checkbox handlers for missions 2-4 read mission 1's checkbox (copy/paste bug).
  - X-Wing: `WriteData` writes 4 bytes for fields read as 1 or 2 bytes (`PltRookieNum`, `CurrentTour`, `CurrentTourOpsComp`, tour ops-complete), spilling into neighbouring bytes. It also writes `CurrentTourOpsComp` at 647, which is never read.
  - X-Wing: `TotalSurfaceVictories` (1587) and the kills base (1589) carry "may not be reading in correct" TODOs. Verify against real files.
  - TIE: only the first 1928 bytes are edited; the backup half is untouched.
- **Constraint:** Chrome blocks ES modules over `file://`, so `app.js` must be a classic script (no `type="module"`).

## Architecture

- **Binary layer:** `Uint8Array` + `DataView` with `u8/u16/u32/i32` read/write helpers.
- **Game definitions:** one object per game (`XWING`, `TIE`) holding file sizes/extension, enums, field tables (`{key, offset, type, max}`), and repeated-group tables (training, historic missions, NPC kills, tours/battles).
- **Generic parse/serialize:** `parse(bytes, def)` builds a plain pilot object. `serialize(pilot, bytes, def)` writes into a copy of the original bytes so unknown bytes are preserved.
- **Game detection:** by size first (1705/3410 = X-Wing, 3856 = TIE), then extension. Otherwise show a clear error.
- **UI:** generated from the same tables by small render helpers (number inputs, selects, checkbox grids, bitmask checkboxes).

## Feature scope

| Area | X-Wing | TIE Fighter |
|---|---|---|
| Pilot | name (from filename), health, rank, TOD score, experience | name, health, rank, difficulty, battle score, skill, Secret Order rank |
| Training | 4 ships: level completed, best score | 7 ships: next level, level completed, best score |
| Historic combat | 5 groups x 6 missions (complete, score) | 7 ships x 4 missions (complete, score) |
| Campaign | 5 tours: status, ops completed, per-op scores (12/12/14/24/24), current tour | 13 battles: status, last mission completed, per-mission scores (6,5,6,5,5,4,5,6,6,6,7,7,8), secondary/bonus objective bitmasks, active battle |
| Stats | 24 NPC types (victories and captures), surface victories, lasers/missiles, craft lost | ~69 NPC kill counts, total kills/captures, lasers/warheads, craft lost |
| Medals | 5 medals + Kalidor Crescent level | n/a |

Also carried over:
- New blank pilot for either game.
- Derived values: hit percentages, battle total scores, space victory/capture totals.
- Range validation with the legacy max values (e.g. training score 2046820351, victories 65535), shown inline instead of pop-ups.

## File handling

- **Open:** file picker + drag-and-drop via `File.arrayBuffer()`. Nothing is uploaded.
- **Save:** `showSaveFilePicker` (Chromium) can overwrite the opened file in place; otherwise fall back to a `Blob` download.
- **Save As:** always prompts for a new name, which also sets the pilot name.
- **Safety:** unsaved-changes warning; no automatic backup (same as the originals).

## UI

Single page: header toolbar (New X-Wing, New TIE, Open, Save, Save As), status line, and tabs generated for the active game. Plain CSS, dark theme, responsive grids, keyboard friendly.

## Verification (no build step)

- **Round-trip test:** parse then serialize each sample file unedited and expect byte-identical output (throwaway Node script, not part of the deployed app).
- **Spot checks:** change a value, save, and confirm the bytes at the expected offset. Resolve the X-Wing offset TODOs against real files.
- **Manual browser check:** open via `file://`, then confirm GitHub Pages compatibility (relative paths only).

## Delivery order

1. Binary helpers, game tables, generic parse/serialize; tested on samples.
2. UI shell: open, save, new, game detection.
3. Pilot and training tabs for both games.
4. Historic combat and stats tabs.
5. Campaign tabs: X-Wing tours and medals, then TIE battles and objectives.
6. Validation, polish, short README section.

## Open decisions

1. **Output location:** use the repo root `d:\Programming\Copilot\Pilot Editor\` as the app root?
2. **Byte parity with legacy:** write each field at its true width (recommended), or reproduce the legacy 4-byte writes exactly?
3. **TIE backup half (bytes 1928-3855):** leave untouched (legacy behaviour, recommended) or mirror the edited half into it?
4. **1706-byte `.PLT` samples:** reject with a clear message (recommended) or open with a warning? Accept the 3410-byte X-Wing variant as legacy does?
5. **Sample files:** keep them only under `reference/` (recommended) or also copy some into a `samples/` folder for testing?
