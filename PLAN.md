# Pilot Editor: Implementation Plan

A static, framework-free browser app that combines the X-Wing (`.plt`) and TIE Fighter (`.tfr`) pilot editors. Plain HTML, CSS and classic `<script>` files split by responsibility, with one file per game. It runs from `file://` and from GitHub Pages.

Legacy C# sources, offset docs and sample pilot files are in `reference/X-Wing/` and `reference/TIE-Fighter/` (read-only reference; never modify).

## Findings from the reference projects

- **Formats**
  - X-Wing `.plt`: 1705 bytes (a 3410-byte variant with a duplicate second half also exists, e.g. `RUSTY.PLT`).
  - TIE `.tfr`: 3856 bytes = 1928-byte active pilot + 1928-byte backup half. In `TOPACE.TFR` the halves are identical; in `test.tfr` they differ.
  - Sample `TOPACE.PLT`, `IPTOPACE.PLT` and `TOPACE.BAK` are 1706 bytes, which the legacy editor rejects. Phase 0 showed the extra byte is not at the end: everything from byte 735 on sits one byte later than in 1705-byte files (the extra byte is somewhere in the all-zero range 649-734). The app opens them with a +1 shift from offset 735 and says so in a banner. The 35 premade pilots in `reference/X-Wing/Pilot Files` (the original game's wingmen: Skywalker, Solo, Antilles and so on) are all 1706 bytes and fit that layout: Tour 1 status at 736, no operations done, last-operation markers 0xFF, training levels 8, 8, 8, 0, and nothing stored in Tours 4 and 5. So the 1706-byte layout is the original game's format, and the 1705-byte one is the Collector's CD-ROM. Their rookie numbers are 16500, 33000, 49500 and 65535.
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
  - X-Wing: the stats and historic-combat reads and writes are nested inside other loops, so they run repeatedly.\n  - X-Wing: the training level boxes have a maximum of 8, so opening a pilot with level 9 throws \"Value of '9' is not valid for 'Value'\". The Collector's guide says the Proving Ground has eight main levels but can be flown past them, so the web editor has no cap of 8 (limit 255) and keeps whatever the file holds.
- **Verified in phase 0 (against the samples)**
  - Per-tour block at 743-750 (one byte per tour, 8 slots): the index of the last completed operation, 0xFF when none (`ROOKIE.PLT`: all 0xFF; `TOPACE.PLT`: 11, 11, 13; `RUSTY.PLT`: 5 with 6 operations done). The legacy editor never updates it, which is why edited files such as `RUSTY1.PLT` have stale 0xFF values and why a user's Tour 5 repairs with the legacy editor sent the game to the wrong missions. It is a slot position, not a count: for Tours 4 and 5 it points at the slot of the operation flown (see `NOKSP.PLT` below), and the new app sets it from Operations completed.
  - `NOKSP.PLT` (a real save from the GOG 1998 version, submitted by a player; its Tours 1 to 3 are empty and its Tour 5 was hand-edited with the legacy editor):
    - Tour 4 was played naturally: status Complete, operations completed 20, last completed slot 23, and exactly one version of each choice pair (6a/6b, 8a/8b, 12a/12b, 16a/16b) holds a score while the other is 0. This confirms the interleaved slot order (1-5, 6a, 6b, 7, ...) and that the pairs share one operation count.
    - Operations completed counts each pair once and tops out at 20; the marker counts slots (0 to 23). Tour 5 there shows 24 operations and marker 0, left by the edits.
  - Tour status is at 735-739 and operations completed at 751-755 in 1705-byte files (`x-wing.txt`'s 736/752 matches the 1706-byte layout, not the 1705 one).
  - The current-tour operation count is stored at both 642 and 647 (`TOPACE.PLT` 0x0E and 0x0E; `RUSTY.PLT` 6 and 6). The legacy read at 643 was wrong, and its 4-byte writes zeroed bytes 641-643 and 648 (0xFF) in files like `RUSTYx.PLT`.
  - TIE "last mission completed" is 8 in every finished battle, whatever its mission count (`NEWACE10.TFR`, `TOPACE10.TFR`), so the legacy maximum of 8 is correct and 8 means finished. Secondary and bonus objectives are bitmasks (0xFF when all set; counts per battle are not reliable from the samples).
  - TIE training-completed values seen: 0, 2, 4, 6. Missile Boat historic scores at 328 are used by the legacy code and show plausible values in `Tester2.tfr`.
  - TIE pilots made in the game (`reference/TIE-Fighter/Pilot Files/1994`, version 2.0, 11/28/94): `RUSTY-1.TFR` is brand new and differs from all zeros in only 13 bytes: difficulty 1 and twelve training bytes (90 to 101) at 2; its backup half is identical. `RUSTY-2.TFR`, after finishing level 1 and quitting in level 2, differs only in the first craft's score (2430); the next-level and completed bytes did not change. The training run is a looping course whose levels get harder each lap.
  - `RUSTY-3.TFR` (basic TIE Fighter, started at level 3, finished levels 3 and 4, got the training badge) differs from `RUSTY-1.TFR` in three fields only: next level 0 to 2, completed 2 to 4, score 5650 (the backup half is untouched). Reading: "completed" is the highest level completed, starting at 2 so that levels 1 to 3 can be chosen, and 4 means the badge; "next level" counts from 0 and followed the level chosen at the start. This also fits the older `RUSTY` pilots (done 6 and next 0 for the first craft, done 4 and next 2 for the others) and the owner's notes (2 not completed, 4 certificate). Inferred from three pilots, so the editor labels say so.
  - Owner: there are only 7 craft. The other five training slots (next level 36 to 40, score 70 to 89, completed 97 to 101) are room for expansion craft that never shipped; the game still fills the completed bytes with 2 in a new pilot, so the editor keeps them as they are.
  - `Pilot Files/1998/LUKE-1.tfr` is a new TIE Fighter pilot from the 1998 version. Its backup half (the pilot as created) is identical to the 1994 `RUSTY-1.TFR` and to the editor's blank pilot, so both versions create the same new pilot. Its active half differs in one byte, the first craft's next-level byte (2): confirmed by the owner: level 3 was picked in the training menu before any level was flown, so the byte is written at selection.
  - `LUKE-2.tfr` (same pilot, level 7 completed, quit in level 8) differs from `LUKE-1.tfr` in the active half only: completed byte 2 to 7 and the first craft's score 0 to 29530. The next-level byte stayed 2, and the backup half did not change. So the completed byte holds the level number last completed (a start at level 3 and finishing 3 to 7 gives 7), and the score is the running total of the run. The owner confirms the pilot file keeps the highest score and the highest level completed (replaying a lower level does not lower it); each run is logged separately in `TRAIN.HGH`. The level cap is unknown and will not be tested; the editor only warns above 20 (completed) and 21 (next level) and accepts any value up to 255.
  - `TRAIN.HGH` (`Pilot Files/1994/TRAIN.HGH`, 128 bytes; `Pilot Files/1998/train.hgh`, 380 bytes) is a high-score list sorted by score, one record per run: name (zero-padded), score as u32 little-endian, level the run ended in (u8), one pad byte. The 1994 record is 16 bytes (name 10, score at 10, level at 14, 8 records) and the 1998 record is 38 bytes (name 32, score at 32, level at 36, 10 records). Matches: `RUSTY` 5650 level 5 and `RUSTY` 2430 level 2 (the two `RUSTY` runs), `LUKE` 29530 level 8. The shipped entries have a zero where the first letter should be (`?arry`, `?eter`, `?ucky`, `?im`, `?dward`, `?ade`). Not part of the pilot file, so the editor does not read it.
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
| `js/core/state.js` | Pilot state, original snapshot, undo/redo, change list, optional rules and keep-in-step calculations, byte patches |
| `js/core/rules.js` | Helpers for the games' "Enforce rules" hooks (rank and score, hits and fired) |
| `js/core/compare.js` | Compare two pilots of one game: fields grouped like the sections, differences, and copy between them |
| `js/core/files.js` | Open, Save, Save As, drag-and-drop, game detection, backup handling |
| `js/ui/widgets.js` | Number field, enum select, mission grid, bitmask checklist, list |
| `js/ui/sections.js` | Renderers for the section types: fields, matrix, list, cards |
| `js/ui/shell.js` | Header, sidebar, error banner, changes drawer, shortcuts |
| `js/ui/help.js` | Help dialog: computes the unmapped byte ranges for each game |
| `js/ui/diff.js` | Compare view: two pilots side by side with copy buttons, its own undo history |
| `js/games/xwing.js`, `js/games/tie.js` | One definition per game; each registers itself with `PilotEditor.games` |
| `js/app.js` | Wires everything together; loaded last |

- **Game definition contract:** file extension, accepted sizes, editable byte range, enums with display labels, field and group tables (`{key, offset, type, signed, max}`), a `sections` list, per-game presets, a `theme` entry (display name, short label, accent colors, icon), and optional hooks: `onChange(id, value, api)` for linkage rules that always apply, `enforce(id, value, api)` for the optional "Enforce rules" checks, `autoUpdate(id, value, api, autos)` for optional keep-in-step calculations, `copyWith(id)` for fields that Compare copies together, `warnings(get)` for soft checks, and a `derived` table of read-only totals that may carry a `sync` button and an `auto` checkbox.
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

- **Layout:** header toolbar (New X-Wing, New TIE, Open, Save, Save As, Close) with a persistent pilot summary, a left sidebar of sections, and one scrolling panel. No nested tabs.
- **Sections per game:** Pilot, Training, Historic Combat, Stats, Campaign, plus Medals (X-Wing only) and Raw/Hex (both).
  - **Historic Combat:** a ship-by-mission matrix (TIE) or group-by-mission matrix (X-Wing) replaces the 7 and 5 inner tabs.
  - **Stats:** a searchable, sortable list of NPC kill and capture counts; weapon accuracy shown as a bar with a percentage.
  - **Campaign (TIE):** 13 collapsible battle cards with a status badge and a progress bar, "Secondary" and "Bonus" objective labels, "Last mission completed" limited to 0-8 (8 = finished, as the games use it), and an Active Battle selector (legacy has none).
  - **Campaign (X-Wing):** 5 tour cards with a status control and progress bar, correct 6A/6B-style operation labels, and only one Active tour at a time, kept in sync with the current tour.
  - **Raw/Hex:** a hex view of the file with an ASCII column, a fixed header of offsets `00` to `0F` above the scrolling bytes, and bytes that differ from the opened file marked. Click a byte (or its ASCII character), shift-click, drag or use the arrow keys to select; the offset, field and value show above the bytes. Go to offset takes hex or decimal, and two filters show only the rows with data (a byte other than `00`) and/or only the rows with changes. Hovering a byte shows its address in hex and decimal and its field; double-clicking a mapped byte jumps to that field (opening a collapsed card or clearing a table filter).
- **Widgets:** number fields select on focus, clamp, show min/max in a tooltip and never throw on out-of-range loads (they show a warning chip); enum selects show full names (e.g. "Rebel Cruiser (CNVYR)"); TIE training-completed shows labelled options with unknown values still editable; the bitmask checklist clears a flag when unchecked.
- **Workflow helpers:**
  - Undo/redo, grouped per edit.
  - Fields that differ from the original are highlighted, and a Changes drawer lists old and new values with a per-field revert.
  - Bulk actions: complete all, clear all, reset section, and buttons that max scores to the usual limit (X-Wing: 999,999 for training best scores, each tour's operation scores and historic combat; TIE Fighter: the game's limit of 2,046,820,351 for training best scores, each battle's mission scores and historic combat). In Tours 4 and 5 only one slot of each a/b pair is set (the one already scored, else the first). Each is undoable.
  - Per-game presets ("Rookie", "Top Ace"), based on the sample files.
  - Derived values shown beside the editable ones (battle totals, space totals, TIE total kills versus the per-type sum) with a Sync button where a stored value can follow them: TIE total kills, the X-Wing Kalidor Crescent, and the X-Wing Tour of Duty points (total of the recorded operation scores). The game's own points do not always equal that total (`NOKSP.PLT` stores 35,470 against 604,606 recorded), so it is a convenience. A **Keep equal** checkbox beside it (remembered in the browser, off by default) recalculates the points after every operation score edit in the same undo step; switching it on sets the points to the total once. Compare copies and byte copies do not trigger it. Never silent.
- **Shortcuts:** Ctrl+O, Ctrl+S, Ctrl+Z, Ctrl+Y, F1 (help).
- **Compare** (toolbar button, same game only): a body class `diff-mode` hides the sidebar, Changes drawer and every toolbar control except Undo, Redo, Theme and Help; the page shows one table of field, left value, copy arrows, right value, with only the differing fields by default, a filter, per-group and copy-all buttons, and a Save button per side. The right file is a second state, so copies are ordinary undo steps; Undo and Redo follow a small history of which side each copy changed. Copies use `state.assign` (exact values, no `onChange` sync, no rules); a game's `copyWith(id)` adds partner fields (X-Wing operations completed with last completed slot). Unmapped bytes are not compared in the field table, but the **Raw bytes** panel under it (always shown; its title, tools and two-row column header with the file names and `00` to `0F` offset labels form one sticky block that stays under the top bar while the page scrolls) shows both files byte by byte with an ASCII column, highlights differing bytes, jumps between blocks of differences, goes to an offset, can show only the rows with differences and/or only the rows with data, selects a range by click, shift-click, drag or arrow keys, and copies the selected bytes either way. `state.patchBytes` applies a byte copy as one undo step: bytes owned by a field set that field, other bytes are kept as `raw:<offset>` overlay values (listed in Changes as unmapped bytes, reverted by Revert all, applied in `toBytes`). Only the pilot part is compared (the backup half of a two-half file is rewritten on save); files with different layouts (1706 against 1705 bytes) are compared by offset with a note and byte copies off. The right file is closed with Done (asks if it has unsaved changes); opening files is refused while comparing.
- **Enforce rules** (toolbar checkbox, off by default, remembered in the browser): when on, an edit that breaks a game rule also sets the related field, in the same undo step, and a banner lists what was adjusted. Rules live in each game's `enforce(id, value, api)` hook (helpers in `js/core/rules.js`) and follow the warnings: rank and score (rank sets the score to its minimum or just under the next rank; score sets the rank; ranks below the first points-based one, Lieutenant in X-Wing, are kept), X-Wing tour Complete to ops and medal, a medal to its tour Complete, and medal cleared to Incomplete, Kalidor Crescent raised (never lowered) to the highest level the operation scores qualify for, hits not above fired, TIE battle Done to last mission 8, TIE kills by type to total kills, TIE Secret Order levels 1 to 6 (score thresholds from the guide: a level raises the score, a lower score lowers the level; levels 7 to 9 have no rule; the missions-with-secondary-goals requirement is only a warning, counted as ticked secondary goals, because goals cannot be mapped to missions, and no goals are ticked for the user). The guide's rules hold in the game-made samples (`RUSTY`, `RUSTY (2)`, `RUSTY2`, `RUSTY3`, `TOPACE7`, `TOPACE10`); `NEWACE1.TFR` (Secret Order 6 with a score of 100,000) does not. Existing mismatches in an opened file are left alone. Rules that cannot be enforced stay as warnings, shown as a count on the Changes button, a ! beside the field and the Warnings list; the banner after an enforced edit repeats the ones still open on the fields involved, and a file opened with enforcement on says its existing warnings are unchanged.
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

Status: version 1.5.0 is published at https://github.com/j-mathes/Pilot-Editor and on GitHub Pages (https://j-mathes.github.io/Pilot-Editor/). Phases 0-6 are implemented and pass `node tools/test.js` (119 checks) and the jsdom page check `node tools/ui-smoke.js <path to jsdom>` (25 checks). The version number changes only when the owner says so.

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
  - [x] Help panel (Help button or F1): opening and saving, editing, per-game notes, shortcuts, and the byte ranges no field maps to, computed from the field tables (`js/ui/help.js`).
  - [ ] Screen-reader and contrast pass on the tables and both themes.

### Still open

- [ ] Check the 642/647 current-tour bytes in the game (the 1706-byte layout is now confirmed by the original pilots).
- [x] How Tours 4 and 5 store the a/b operations: settled by `NOKSP.PLT` (interleaved slots, one version of each pair scored, operations completed counts a pair once, the last completed slot is a slot position). An AI chat answer with different offsets (0x4D, 0x194 and so on) contradicted the verified layout and was not used.
- [ ] Test the new Operations completed behaviour for Tours 4 and 5 in the game (set the operations and last slot, check the next mission loads correctly), and look at what 642, 643 and 647 hold for a Tour 5 save, since `NOKSP.PLT` shows 23, 24 and 23 after hand edits.
- [x] The new-pilot values now match pilots created in the game: X-Wing from `ROOKIE.PLT` and the original premade pilots (training levels 0, markers 0xFF), TIE Fighter from `RUSTY-1.TFR` (difficulty 1, twelve 2s, nothing else; a test compares them field by field).
- [x] TIE training bytes: a finished level moves the completed byte and the next-level byte (see `RUSTY-3.TFR`). `RUSTY-2.TFR` (level 1 finished, quit in level 2) shows the next-level byte records the level chosen at the start, not the levels completed.
- [ ] Optional action to set a tour's status and operations count from its scored operations (see `TOPACE.PLT` Tour 4), and one to fill scores for completed items.
- [ ] A "Rookie" preset built from `ROOKIE.PLT`.
- [x] TIE rules from the strategy guide: mission titles on every score row, rank-versus-score warnings, hints for rank, Secret Order and battle order, dimmed objective boxes beyond the known goal counts, and two Top Ace presets (battles 1-10 and 1-7) that reproduce the original samples' objective masks.\n- [x] X-Wing rules from the offsets document and the strategy guide: soft rank-versus-score warnings with the guide's thresholds, medal-versus-tour-completion warnings, medal and proving ground hints, tour, operation and historical mission titles, "Flight Cadet" and "Flight Officer" rank names, and a read-only "highest level your mission scores qualify for" for the Kalidor Crescent with a Sync button. Health value 2 is now labelled "Killed".
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
