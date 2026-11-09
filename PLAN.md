# Pilot Editor: Implementation Plan

A static, framework-free browser app that combines the X-Wing (`.plt`) and TIE Fighter (`.tfr`) pilot editors. Plain HTML, CSS and classic `<script>` files split by responsibility, with one file per game. It runs from `file://` and from GitHub Pages.

Legacy C# sources, offset docs and sample pilot files are in `reference/X-Wing/` and `reference/TIE-Fighter/` (read-only reference; never modify).

## Findings from the reference projects

- **Formats**
  - X-Wing `.plt`: 1705 bytes (a 3410-byte variant with a duplicate second half also exists, e.g. `RUSTY.PLT`).
  - TIE `.tfr`: 3856 bytes = 1928-byte active pilot + 1928-byte backup half. In `TOPACE.TFR` the halves are identical; in `test.tfr` they differ.
  - Sample `TOPACE.PLT`, `IPTOPACE.PLT` and `TOPACE.BAK` are 1706 bytes, which the legacy editor rejects. Phase 0 showed the extra byte is not at the end: everything from byte 735 on sits one byte later than in 1705-byte files (the extra byte is somewhere in the all-zero range 649-734). The app opens them with a +1 shift from offset 735 and says so in a banner.
  - In the TIE samples the second half differs from the first in many files (a few to ~200 bytes), so it is a stale backup, not always a mirror.- **Encoding:** little-endian throughout. TIE scores are signed 32-bit; everything else is unsigned.
- **Offsets** are hard-coded in long `switch` blocks in the legacy code. The new app expresses them once as data tables.
- **Source authority:** `XW95PLT.LST` (a Universal Game Editor module) matches the legacy C# offsets and resolves the old TODOs: surface victories at 1587, kills from 1589, captures from 1637, lasers at 1685/1689/1693 (32-bit), missiles at 1697/1699/1701 (16-bit), craft lost at 1703. Prefer it, the C# code and the sample files over `x-wing.txt`, whose hex table is hand-typed and off by one against the code (and differs between its two copies).
- **Tours:** tours 4 and 5 are 20 operations with 4 A/B choice pairs each, giving 24 slots. Tour 3 has 14 operations (`PFE.TXT` and code; `x-wing.txt` says 13).
- **TIE mapping notes:**
  - Missile Boat historic scores sit at 328, which the mapping lists as "Empty" but the code reads.
  - Lasers at 1908 and 1912 are labelled "word" but are 32-bit.
  - Training-completed values: 2 = not completed, 3 = unknown, 4 = certificate.
  - Historic medals (bronze, silver, gold) depend on how many of the 4 missions are complete; thresholds are undocumented.
  - The file has 8 historic slots per ship (4 used) and 8 mission slots per battle (fewer used).
  - Unknown regions are preserved: 12-28, 36-41, 70-89, 97-135, 650-985 (secondary objectives at 913, bonus at 933 per code) and 1770-1907.
- **Legacy quirks (do not carry over)**
  - TIE: historic-combat checkbox handlers for missions 2-4 read mission 1's checkbox (copy/paste bug).
  - TIE: the `TrainingLevelComp` validation key does not match the grid column, so that column is never validated.
  - TIE: unchecking a secondary or bonus objective never clears its flag.
  - Both: opening a wrong-size file replaces the buffer before checking its size, and out-of-range bytes crash the load.
  - X-Wing: `WriteData` writes 4 bytes for fields read as 1 or 2 bytes (`PltRookieNum`, `CurrentTour`, `CurrentTourOpsComp`, tour ops-complete), spilling into neighbouring bytes. It also writes `CurrentTourOpsComp` at 647, which is never read.
  - X-Wing: the stats and historic-combat reads and writes are nested inside other loops, so they run repeatedly.
- **Verified in phase 0 (against the samples)**
  - Per-tour block at 743-750 (one byte per tour, 8 slots): the index of the last completed operation, 0xFF when none (`ROOKIE.PLT`: all 0xFF; `TOPACE.PLT`: 11, 11, 13; `RUSTY.PLT`: 5 with 6 operations done). The legacy editor never updates it, which is why edited files such as `RUSTY1.PLT` have stale 0xFF values. The new app keeps it equal to operations completed minus one.
  - Tour status is at 735-739 and operations completed at 751-755 in 1705-byte files (`x-wing.txt`'s 736/752 matches the 1706-byte layout, not the 1705 one).
  - The current-tour operation count is stored at both 642 and 647 (`TOPACE.PLT` 0x0E and 0x0E; `RUSTY.PLT` 6 and 6). The legacy read at 643 was wrong, and its 4-byte writes zeroed bytes 641-643 and 648 (0xFF) in files like `RUSTYx.PLT`.
  - TIE "last mission completed" is 8 in every finished battle, whatever its mission count (`NEWACE10.TFR`, `TOPACE10.TFR`), so the legacy maximum of 8 is correct and 8 means finished. Secondary and bonus objectives are bitmasks (0xFF when all set; counts per battle are not reliable from the samples).
  - TIE training-completed values seen: 0, 2, 4, 6. Missile Boat historic scores at 328 are used by the legacy code and show plausible values in `Tester2.tfr`.
  - 3410-byte X-Wing files: `RUSTY.PLT` has identical halves, `RUSTYx.PLT` does not.
- **Constraint:** Chrome blocks ES modules over `file://`, so all scripts must be classic scripts (no `type="module"`).
- **Not readable by tooling (may be supplied later as text or CSV):** the three TIE PDFs, `Offsets.xlsx`, `xw95plt.mdl`, `GAMEDAT.UGE`, and the zip, rar and chm archives.

## Architecture

All scripts share one global `PilotEditor` namespace and load in a fixed order: core, ui, games, then `app.js`.

| File | Responsibility |
|---|---|
| `index.html`, `styles.css` | Page shell and styling |
| `js/core/binary.js` | `u8/u16/u32/i32` read/write helpers over `Uint8Array` + `DataView` |
| `js/core/codec.js` | Generic `parse(bytes, def)` and `serialize(pilot, bytes, def)`; writes into a copy of the original bytes so unknown bytes are preserved; every field is written at its true width |
| `js/core/state.js` | Pilot state, original snapshot, undo/redo, change list |
| `js/core/files.js` | Open, Save, Save As, drag-and-drop, game detection, backup handling |
| `js/ui/widgets.js` | Number field, enum select, mission grid, bitmask checklist, list |
| `js/ui/sections.js` | Renderers for the section types: fields, matrix, list, cards |
| `js/ui/shell.js` | Header, sidebar, error banner, changes drawer, shortcuts |
| `js/games/xwing.js`, `js/games/tie.js` | One definition per game; each registers itself with `PilotEditor.games` |
| `js/app.js` | Wires everything together; loaded last |

- **Game definition contract:** file extension, accepted sizes, editable byte range, enums with display labels, field and group tables (`{key, offset, type, signed, max}`), a `sections` list, per-game presets, a `theme` entry (display name, short label, accent colors, icon), and three optional hooks: `derive(pilot)` for read-only totals, `warnings(pilot)` for soft checks, `onChange(path, pilot)` for linkage rules.
- **Isolation:** game-specific logic lives only in `js/games/`. The core and UI never name a ship, tour or battle; if they need to behave differently per game, that becomes a hook.
- **Game detection:** by size first (1705/1706/3410 = X-Wing, 3856 = TIE), then extension. Otherwise show a clear error and keep the current pilot.
- **State:** `{game, data}`; opening a file of the other game replaces it after an unsaved-changes prompt.
- **UI:** generated from the same tables by the widget and section helpers.

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
- Range validation, shown inline instead of pop-ups (see Validation).

## UI modernization

- **Layout:** header toolbar (New X-Wing, New TIE, Open, Save, Save As) with a persistent pilot summary, a left sidebar of sections, and one scrolling panel. No nested tabs.
- **Sections per game:** Pilot, Training, Historic Combat, Stats, Campaign, plus Medals (X-Wing only) and Raw/Hex (both).
  - **Historic Combat:** a ship-by-mission matrix (TIE) or group-by-mission matrix (X-Wing) replaces the 7 and 5 inner tabs.
  - **Stats:** a searchable, sortable list of NPC kill and capture counts; weapon accuracy shown as a bar with a percentage.
  - **Campaign (TIE):** 13 collapsible battle cards with a status badge and a progress bar, "Secondary" and "Bonus" objective labels, "Last mission completed" limited to 0-8 (8 = finished, as the games use it), and an Active Battle selector (legacy has none).
  - **Campaign (X-Wing):** 5 tour cards with a status control and progress bar, correct 6A/6B-style operation labels, and only one Active tour at a time, kept in sync with the current tour.
  - **Raw/Hex:** a read-only hex view of the file with a changed-bytes diff against the original, to help with the unknown regions.
- **Widgets:** number fields select on focus, clamp, show min/max in a tooltip and never throw on out-of-range loads (they show a warning chip); enum selects show full names (e.g. "Rebel Cruiser (CNVYR)"); TIE training-completed shows labelled options with unknown values still editable; the bitmask checklist clears a flag when unchecked.
- **Workflow helpers:**
  - Undo/redo, grouped per edit.
  - Fields that differ from the original are highlighted, and a Changes drawer lists old and new values with a per-field revert.
  - Bulk actions: complete all, clear all, max all, reset section (each undoable).
  - Per-game presets ("Rookie", "Top Ace"), based on the sample files.
  - Derived values shown beside the editable ones (battle totals, space totals, TIE total kills versus the per-type sum) with a "Sync totals" button; tour or battle status can optionally be set from the operations count. Never silent.
- **Shortcuts:** Ctrl+O, Ctrl+S, Ctrl+Z, Ctrl+Y.
- **Game identity** (so it is always clear which game's pilot is open):
  - **Start screen:** with no file loaded there is no game theme. Two cards, "X-Wing (.plt)" and "TIE Fighter (.tfr)", each have Open and New buttons; dropping a file anywhere detects the game.
  - **Theme:** the app sets `data-game="xwing"` or `data-game="tie"` on `<body>`. `styles.css` swaps CSS variables under that attribute only, so no layout code branches on the game. Rebel accent (orange and blue) for X-Wing, Imperial accent (green and gray) for TIE.
  - **Cues that don't rely on color:** a header badge ("X-Wing Pilot" or "TIE Fighter Pilot"), the page title and favicon, and a file chip showing name, extension and size (e.g. "RUSTY.plt, 1705 bytes"). Icons are simple original glyphs or SVGs, with no Lucasfilm logos or artwork.
  - **Wording from the definition:** sidebar sections and terms come from the game definition (Medals and Tours for X-Wing; Battles and Secret Order for TIE; Tour of Duty and Operations versus Battle and Missions; "Dead" versus "Killed").
  - **Detection feedback:** a brief banner on open ("Detected X-Wing pilot, 1705 bytes"), a warning when extension and size disagree (e.g. a `.plt` file of 3856 bytes), and a note when a trailing byte in a 1706-byte file is preserved.
  - **Switching games:** opening the other game's file confirms first if there are unsaved changes. The theme changes only after the new file loads successfully; a failed open keeps the current look.
- **Style:** plain CSS, dark theme with a light option, responsive grids, real labels and a sensible focus order.

## Validation

- **Hard limits** come from the field width in the file, so a value cannot corrupt neighbouring bytes. Legacy caps stay only where they are real game limits (e.g. TIE scores at 2046820351).
- **Soft, non-blocking warnings:** hits greater than shots fired, two active tours, a complete tour with unscored operations, and rank versus score only if thresholds can be found in the samples.
- The legacy "show validation pop-ups" checkbox and modal messages are dropped.
- X-Wing score limits above 999999 (the `PFE.TXT` UI limit) get a soft warning, not a hard stop.

## File handling

- **Open:** file picker + drag-and-drop via `File.arrayBuffer()`. Nothing is uploaded. Validate size and game before replacing any state; on failure keep the current pilot and show an inline banner naming the expected sizes.
- **Open snapshot:** store the original bytes in IndexedDB (last ~20 files, keyed by name and hash). A "Restore original" menu entry brings them back and survives a reload.
- **Open warnings:** warn when the two halves of a 3856-byte TIE file or 3410-byte X-Wing file differ, because saving will overwrite the second half. Preserve a trailing extra byte (1706-byte X-Wing files) on save.
- **Save:** where a file handle exists (Chromium, via `showOpenFilePicker`), write in place; otherwise download a new file, which never overwrites the original. On the first in-place save of a session, offer a `.bak` download of the original (checkbox, on by default).
- **Save As:** always writes a new file and sets the pilot name.
- **Mirror on save:** copy the edited half into the duplicate half (TIE bytes 0-1927 to 1928-3855; the 3410-byte X-Wing variant, first half to second).
- **Pilot name:** editable, not just taken from the filename.
- **Safety:** unsaved-changes warning on close and when opening another file.

## Verification (no build step)

- **Round-trip test:** parse then serialize each sample file unedited and expect byte-identical output (throwaway Node script that loads the scripts with `vm`; not part of the deployed app). Run it per game against that game's samples.
- **Spot checks:** change a value, save, and confirm the bytes at the expected offset.
- **Behaviour checks:**
  - Undo restores the exact original bytes.
  - A wrong-size file leaves the previous pilot intact and shows a banner.
  - Checking then unchecking an objective clears its flag.
  - A crafted out-of-range file warns instead of crashing.
  - After saving, the second half equals the first.
- **Manual browser check:** open via `file://`, then confirm GitHub Pages compatibility (relative paths only). Include a keyboard-only pass and a 360px-wide viewport.

## Delivery order

Status: phases 0-6 are implemented and pass `node tools/test.js` (54 checks) and the jsdom page check `node tools/ui-smoke.js <path to jsdom>` (11 checks). Not yet done: a visual and keyboard pass in a real browser, the GitHub Pages check, the rank-versus-score warning, and the README section.

0. **Verification script (done):** `tools/test.js` loads the browser scripts into a `vm` context and checks every sample. The one-off probe scripts used to settle the open points are removed.
1. **Core and shell:** binary helpers, codec, game registry (with stub game files), detection, open, save, new, banner errors, dirty tracking.
2. **State:** original snapshot, undo/redo, modified highlighting, Changes drawer, IndexedDB snapshots.
3. **Widgets:** number, enum, mission grid, bitmask, list.
4. **Game definitions and sections:** `xwing.js` and `tie.js` can be built in parallel. Pilot and training first, then historic combat and stats, then campaign (X-Wing tours and medals, TIE battles and objectives), then Raw/Hex.
5. **Helpers:** bulk actions, presets, derived-value sync.
6. **Validation:** hard limits and soft warnings.
7. **Polish:** themes, keyboard and screen-reader support, help panel, tooltips (noting which regions are unknown and preserved), short README section.

## Decisions made

- **Output location:** the repo root `d:\Programming\Copilot\Pilot Editor\` is the app root (assumed; confirm if you want a subfolder).
- **Byte parity with legacy:** write each field at its true width, not the legacy 4-byte writes.
- **Backup half:** mirror the edited half into the duplicate half on save, with an open-time warning when they differ.
- **1706-byte `.PLT` samples:** accepted with a +1 shift from offset 735 (see Findings); the app shows a banner saying the layout is inferred. The 3410-byte X-Wing variant is accepted too.
- **Sample files:** keep them under `reference/` only (assumed; copy a few into a `samples/` folder if you want them deployed or tested from there).
- **Layout:** sidebar sections, multiple classic scripts, one file per game.
- **Unreadable reference files:** skipped for now; the PDFs and `Offsets.xlsx` may be added later as text or CSV.

## Open points

1. **Preset contents:** define "Rookie" and "Top Ace" from the samples (`ROOKIE.PLT`, `TOPACE.PLT`, `TOPACE.TFR`).
2. **Rank versus score warning:** drop it if the samples give no thresholds.
3. **Derived sync:** prompted, never silent, unless you ask otherwise.
