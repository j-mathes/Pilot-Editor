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
  - Per-tour block at 743-750 (one byte per tour, 8 slots): the index of the last completed operation, 0xFF when none (`ROOKIE.PLT`: all 0xFF; `TOPACE.PLT`: 11, 11, 13; `RUSTY.PLT`: 5 with 6 operations done). The legacy editor never updates it, which is why edited files such as `RUSTY1.PLT` have stale 0xFF values and why a user's Tour 5 repairs with the legacy editor sent the game to the wrong missions. It is a slot position, not a count: for Tours 4 and 5 it points at the slot of the operation flown (see `NOKSP.PLT` below), and the new app sets it from Operations completed.
  - `NOKSP.PLT` (a real save from the GOG 1998 version, submitted by a player; its Tours 1 to 3 are empty and its Tour 5 was hand-edited with the legacy editor):
    - Tour 4 was played naturally: status Complete, operations completed 20, last completed slot 23, and exactly one version of each choice pair (6a/6b, 8a/8b, 12a/12b, 16a/16b) holds a score while the other is 0. This confirms the interleaved slot order (1-5, 6a, 6b, 7, ...) and that the pairs share one operation count.
    - Operations completed counts each pair once and tops out at 20; the marker counts slots (0 to 23). Tour 5 there shows 24 operations and marker 0, left by the edits.
  - Tour status is at 735-739 and operations completed at 751-755 in 1705-byte files (`x-wing.txt`'s 736/752 matches the 1706-byte layout, not the 1705 one).
  - The current-tour operation count is stored at both 642 and 647 (`TOPACE.PLT` 0x0E and 0x0E; `RUSTY.PLT` 6 and 6). The legacy read at 643 was wrong, and its 4-byte writes zeroed bytes 641-643 and 648 (0xFF) in files like `RUSTYx.PLT`.
  - TIE "last mission completed" is 8 in every finished battle, whatever its mission count (`NEWACE10.TFR`, `TOPACE10.TFR`), so the legacy maximum of 8 is correct and 8 means finished. Secondary and bonus objectives are bitmasks (0xFF when all set; counts per battle are not reliable from the samples).
  - TIE training-completed values seen: 0, 2, 4, 6. Missile Boat historic scores at 328 are used by the legacy code and show plausible values in `Tester2.tfr`.
  - 3410-byte X-Wing files: `RUSTY.PLT` has identical halves, `RUSTYx.PLT` does not.
- **Constraint:** Chrome blocks ES modules over `file://`, so all scripts must be classic scripts (no `type="module"`).
- **Offsets document (contents of `Offsets.xlsx`, pasted by the owner; partial):**
  - Agrees with the code for offsets 2, 3, 4, 8, 10-12, 38-53 and 134-137. Names offset 8 "Rookie number" (Novice, Officer, Veteran, Ace, Top Ace; cut-offs not given), health value 2 "Killed", and calls training the "proving ground" (8 levels; level 8 earns a craft's flight badge).
  - Rank: Cadet start; Officer after about 5 proving ground levels plus a few missions; Lieutenant after all original training missions or 50,000 TOD points; Captain 100,000; Commander 250,000; General 500,000 (points "without dying").
  - Medals: Corellian Cross, Mantooine Medallion, Star of Alderaan, Shield of Yavin and Talons of Hoth are awarded for completing Tours 1 to 5 (bytes 10-14).
  - Kalidor Crescent levels need a score in a different Tour of Duty mission each: 10,000, 12,000, 14,000, 16,000, 18,000 and 20,000.
- **TIE Fighter Collector's CD-ROM strategy guide** (`Tie_Fighter_Collectors_Guide_text.pdf`, text extracted outside the repository; the PDF is in `.gitignore`):
  - All 13 battles and their mission titles; the mission counts (6, 5, 6, 5, 5, 4, 5, 6, 6, 6, 7, 7, 8) match the code. Battles 8 to 10 came with Defender of the Empire and 11 to 13 with Imperial Pursuit. Order of play: battles 1 to 4 in any order, then 5 and/or 6, 7, 8 and/or 9, 10, 11 and/or 12, 13.
  - Ranks by accumulated score: Officer 20,000, Lieutenant 50,000, Captain 100,000, Commander 250,000, General 500,000. The Secret Order has six levels (20,000 / 50,000 / 100,000 / 250,000 / 400,000 / 800,000 points, needing 2 / 4 / 6 / 9 / 12 / 15 missions with secondary goals), while the file stores values 0 to 9.
  - Each mission has primary, optional secondary and optional bonus goals. Secondary goals raise the Secret Order rank; bonus goals add score. The objective bytes are bitmasks counted goal by goal, not one bit per mission. The original Top Ace pilots (`TOPACE7`, `TOPACE10`, with every goal of battles 1 to 7 or 1 to 10 done) give the goal counts: secondary 5, 4, 4, 3, 5, 3, 2, 2, 3, 3 and bonus 6, 4, 5, 2, 5, 4, 4, 4, 6, 5; battles 11 to 13 are unknown.
  - Historic combat is the Combat Chamber: four missions per craft, with the missile boat's four added by Defender of the Empire.
- **X-Wing: The Official Strategy Guide** (`XWing_Guide_text.pdf`, text extracted outside the repository; the PDF is in `.gitignore`). It is the original game's guide, so it covers three tours (12, 12 and 14 operations) and three craft, not the Collector's Edition's Tours 4 and 5 or the B-Wing:
  - Rank names: Flight Cadet, Flight Officer, Lieutenant, Captain, Commander, General. Accumulated scores: Flight Officer 20,000, Lieutenant 50,000, Captain 100,000, Commander 250,000, General 500,000.
  - Kalidor Crescent: awarded for a score in a single mission; main medal 10,000, then Bronze Cluster 12,000, Silver Talons 14,000, Silver Scimitar 16,000, Golden Wings 18,000, Diamond Eyes 20,000. Whether each level needs a different mission is only stated in the offsets document, which the editor follows.
  - Medals for completing tours: Corellian Cross (first), Mantooine Medallion (second), Star of Alderaan (third). One Flight Badge per craft for finishing the proving ground; one battle patch per historical mission.
  - Titles for the three tours, their 38 operations, and the 18 X, Y and A-wing historical missions, now used as labels.
- **X-Wing Collector's CD-ROM: The Official Strategy Guide (1995)** (text extracted outside the repository; the PDF is in `.gitignore`). It adds the expansions to the original guide:
  - Tour 4 "Imperial Pursuit" and Tour 5 "B-wing", each with 20 numbered operations and 24 slots. The choice operations are 6, 8, 12 and 16 in Tour 4 and 11, 14, 17 and 20 in Tour 5, with `a` and `b` versions. The editor's slot order (1-5, 6a, 6b, 7, and so on) comes from the legacy editor; the guide does not say how the file stores the choice operations. All 48 titles are used as labels in that order.
  - Six B-Wing historical missions and six Bonus missions, now used as labels, plus the B-wing as a fourth proving ground craft with its own flight badge and battle patch.
  - Tour ribbons for Tours 4 and 5 and the Talons of Hoth and Shield of Yavin medals sit together in the medals case, which fits the offsets document pairing them with Tours 5 and 4. Rank and Kalidor Crescent scores are the same as in the original guide.
- **"Chopping Block" articles** (`chopbloc.pdf`, `chopbloc2.pdf`; Game Developer magazine, February and April/May 1995, text extracted outside the repository). Part 1 is the primary source for the pilot file table that `Tie Fighter Mapping.txt` grew from; part 2 covers mission file structures, which the editor does not need:
  - Confirms the 3,856-byte file (active pilot, then a backup written by the Personal Datapad), the craft order (TIE Fighter, Interceptor, Bomber, Advanced, Gunboat, Defender) and that the original game's Secret Order values run from 0 (None) to 6 (Emperor's Hand), matching the guide's six levels. Values 7 to 9 are described by no document.
  - Mission file names give the craft and role for every mission of battles 1 to 7, now shown beside the mission titles.
- **Not readable by tooling (may be supplied later as text or CSV):** `xw95plt.mdl`, `GAMEDAT.UGE`, and the zip, rar and chm archives.

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
- [x] **Manual browser check (done):** opened via `file://` and from GitHub Pages (relative paths only), with a visual pass, a keyboard-only pass, a narrow viewport and saving.

## Delivery order

Status: version 1.1.0 is published at https://github.com/j-mathes/Pilot-Editor and on GitHub Pages (https://j-mathes.github.io/Pilot-Editor/). Phases 0-6 are implemented and pass `node tools/test.js` (55 checks) and the jsdom page check `node tools/ui-smoke.js <path to jsdom>` (13 checks). The version number changes only when the owner says so.

- [x] **0. Verification script:** `tools/test.js` loads the browser scripts into a `vm` context and checks every sample. The one-off probe scripts used to settle the open points are removed.
- [x] **1. Core and shell:** binary helpers, codec, game registry, detection, open, save, new, banner errors, dirty tracking.
- [x] **2. State:** original snapshot, undo/redo, modified highlighting, Changes drawer, IndexedDB snapshots.
- [x] **3. Widgets:** number, enum, mission grid, bitmask, list.
- [x] **4. Game definitions and sections:** `xwing.js` and `tie.js`, including Raw/Hex. Statistics use a table beside a bordered list in both games; the TIE kills list flows into two columns and drops to one when the filter leaves 12 rows or fewer.
- [x] **5. Helpers:** bulk actions, a "Top Ace" preset per game, "Reset to new pilot", derived-value sync.
- [x] **6. Validation:** hard limits and soft warnings, shown inline.
- [ ] **7. Polish:**
  - [x] Light and dark themes, responsive layout, keyboard shortcuts.
  - [x] Tooltips on every button, dropdown and input (checked by the page test), with hints on the less obvious fields.
  - [x] README with the version and version history, LICENSE (CC BY-NC-SA 4.0), and a footer with version, GitHub Pages and source links.
  - [x] Publish to GitHub and enable GitHub Pages.
  - [x] Manual browser, keyboard and narrow-viewport pass.
  - [ ] Help panel, including notes on which byte regions are unknown and preserved.
  - [ ] Screen-reader and contrast pass on the tables and both themes.

### Still open

- [ ] Check the 1706-byte X-Wing layout (+1 shift from byte 735) and the 642/647 current-tour bytes in the game.
- [x] How Tours 4 and 5 store the a/b operations: settled by `NOKSP.PLT` (interleaved slots, one version of each pair scored, operations completed counts a pair once, the last completed slot is a slot position). An AI chat answer with different offsets (0x4D, 0x194 and so on) contradicted the verified layout and was not used.
- [ ] Test the new Operations completed behaviour for Tours 4 and 5 in the game (set the operations and last slot, check the next mission loads correctly), and look at what 642, 643 and 647 hold for a Tour 5 save, since `NOKSP.PLT` shows 23, 24 and 23 after hand edits.
- [ ] Confirm the values of a new blank pilot against a pilot created in each game.
- [ ] Optional action to set a tour's status and operations count from its scored operations (see `TOPACE.PLT` Tour 4), and one to fill scores for completed items.
- [ ] A "Rookie" preset built from `ROOKIE.PLT`.
- [x] TIE rules from the strategy guide: mission titles on every score row, rank-versus-score warnings, hints for rank, Secret Order and battle order, dimmed objective boxes beyond the known goal counts, and two Top Ace presets (battles 1-10 and 1-7) that reproduce the original samples' objective masks.\n- [x] X-Wing rules from the offsets document and the strategy guide: soft rank-versus-score warnings with the guide's thresholds, medal-versus-tour-completion warnings, medal and proving ground hints, tour, operation and historical mission titles, "Flight Cadet" and "Flight Officer" rank names, and a read-only "level the recorded scores support" for the Kalidor Crescent with a Sync button. Health value 2 is now labelled "Killed".
- [x] The TIE Fighter strategy guide, the offsets document and the two Chopping Block articles have been supplied as text and used.
- [ ] Optional workflow that runs `node tools/test.js` on each push.

## Decisions made

- **Output location:** the repo root `d:\Programming\Copilot\Pilot Editor\` is the app root (assumed; confirm if you want a subfolder).
- **Byte parity with legacy:** write each field at its true width, not the legacy 4-byte writes.
- **Backup half:** mirror the edited half into the duplicate half on save, with an open-time warning when they differ.
- **1706-byte `.PLT` samples:** accepted with a +1 shift from offset 735 (see Findings); the app shows a banner saying the layout is inferred. The 3410-byte X-Wing variant is accepted too.
- **Sample files:** keep them under `reference/` only (assumed; copy a few into a `samples/` folder if you want them deployed or tested from there).
- **Layout:** sidebar sections, multiple classic scripts, one file per game.
- **Form layout:** Pilot and Medals are vertical lists with each label next to its control; Statistics place a table beside a bordered "weapons and losses" list; block headings (and filter boxes) share one heading row so borders line up.
- **Publishing:** the repository is public with the `reference` folder as committed, including third-party tools and documents.
- **Versioning:** the version appears in `README.md` (heading and history table) and `index.html` (meta tag and footer). It changes only with the owner's permission.
- **Unreadable reference files:** `xw95plt.mdl`, `GAMEDAT.UGE` and the archives are skipped; the strategy guides and offsets document were supplied as text and are used.

## Open points

1. **Preset contents:** "Top Ace" is built from the `TOPACE` samples. A "Rookie" preset from `ROOKIE.PLT` is still to do.
2. **Rank versus score warning:** done for X-Wing using the offsets document. TIE Fighter has no rank thresholds yet.
3. **Derived sync:** prompted, never silent, unless you ask otherwise.
