# Pilot Editor

**Version 1.5.0**

A browser-based editor for X-Wing (`.plt`) and TIE Fighter (`.tfr`) pilot files. It runs entirely in your browser, so files stay on your computer.

- Live version: https://j-mathes.github.io/Pilot-Editor/
- Source: https://github.com/j-mathes/Pilot-Editor

## Using it

Open the live version, or download the repository and open `index.html` directly (no server or build step). Drop a pilot file on the page, or choose **Open**. The game is detected from the file size.

| Game | Files | Accepted sizes |
|---|---|---|
| X-Wing | `.plt` | 1705 (1998 version), 1706 (original game, 1993 and 1994) and 3410 bytes (Collector's layout stored twice) |
| TIE Fighter | `.tfr` | 3856 bytes (the 1994, 1995 and 1998 versions share it) |

The file label at the top of the page also says which game version a file is for.

## Features

- Pilot, training, historic combat, statistics, tours of duty (X-Wing) or battles (TIE Fighter), and medals (X-Wing). Tours and battles are collapsible cards with a status badge and progress bar; the kill tables can be filtered.
- Undo and redo, highlighting of changed fields, and a Changes panel with per-field Revert. The Changes button counts changes and warnings.
- Limits based on each field's size in the file, plus warnings for suspicious values (for example hits above shots fired, a rank that does not match the score, a medal without its completed tour).
- **Enforce rules** (off by default): edits keep related values consistent with the game rules in one undo step, with a message listing what changed. It covers rank and score, TIE Fighter Secret Order levels, X-Wing tours, medals and the Kalidor Crescent, hits against shots fired, and TIE Fighter battle and kill totals. Rules it cannot enforce stay as warnings.
- Presets (Top Ace, and a reset to a new pilot), bulk actions (including buttons that max the scores), and calculated totals, some with a Sync button. The X-Wing Tour of Duty points can also be kept equal to the total of the recorded operation scores.
- **Compare**: open a second pilot of the same game beside the open one. Only differing fields are listed, with copy arrows in both directions (per field, per group or all), its own Undo and Redo, and a Save button for each side. A raw bytes comparison under it covers every byte, including unknown ones, with ASCII, previous and next difference, go to offset, range selection and byte copies.
- **Raw bytes** view with an ASCII column, go to offset, byte selection (click, shift-click, drag or arrow keys) with the offset, field and value shown above it, filters for rows with data and rows with changes, and bytes that differ from the opened file marked. Bytes the editor does not understand are kept as they are.
- A **Help** panel (button or F1) that describes all of this, including the byte ranges no field maps to.
- Light and dark themes, and keyboard shortcuts: Ctrl+O open, Ctrl+S save, Ctrl+Shift+S save as, Ctrl+Z undo, Ctrl+Y redo, F1 help.
- A copy of each opened file is kept in the browser (Restore), and an optional `.bak` download on the first in-place save.

## Saving

- Chrome and Edge can overwrite the opened file in place. Other browsers download a new copy and never touch the original.
- On save, the second half of the file (the backup copy) is overwritten with the active pilot.

## Known limits

- The 1706-byte X-Wing layout is inferred from sample files: everything from byte 735 on is shifted by one. Check results in the game. Comparing a 1706-byte file with a 1705-byte one compares bytes by offset, so byte copies are switched off for that pair (field copies still work).
- New pilots created by the editor match new pilots made in the game: TIE Fighter in the 1994, 1995 and 1998 versions, and X-Wing in the 1993, 1994 and 1998 versions.
- Presets: Top Ace for X-Wing, two Top Ace presets for TIE Fighter (battles 1 to 10 or 1 to 7), and Reset to new pilot for both.
- TIE Fighter Secret Order values 7 to 9 are described by no document and have no rule, and the highest training level the game allows is unknown. `TRAIN.HGH` (the training high score list) is not opened.
- Compare works on two files of the same game; opening files is switched off while comparing.

## Development

No build step. Tests need Node:

```
node tools/test.js
node tools/ui-smoke.js <path to the jsdom module>
```

`tools/test.js` checks every sample file in `reference/`. `tools/ui-smoke.js` loads the page in jsdom, which you install separately.

The `reference` folder holds earlier editors, notes, documents and sample pilot files from the original projects.

## License

Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International. See [LICENSE](LICENSE).

## Version history

| Version | Date | Changes |
|---|---|---|
| 1.5.0 | 2026-11-10 | Compare: open a second pilot of the same game beside the first in a clean view that lists only the differing fields, with copy arrows in both directions (per field, per group or all), its own Undo and Redo, and a Save button for each side. A Raw bytes panel under it compares every byte, including unknown ones, with ASCII, next and previous difference, go to offset, range selection and byte copies; its title, tools and column header stay in view while scrolling. The normal Raw bytes view gains an ASCII column, go to offset, byte selection with the field and value shown in the header, a frozen offset header and the same layout. |
| 1.4.0 | 2026-11-10 | Enforce rules option (off by default): edits keep related values consistent with the game rules, in one undo step with a message listing what changed. Covers rank and score, TIE Secret Order levels, X-Wing tours and medals, the Kalidor Crescent, weapon hits against shots fired, TIE battle and kill totals. Rules that cannot be enforced stay as warnings, now counted on the Changes button. Clearer Kalidor Crescent wording. |
| 1.3.0 | 2026-11-10 | Help panel (Help button or F1) covering opening and saving, editing, notes for each game, shortcuts and the byte ranges no field maps to. Raw bytes view: tooltips start with the hex and decimal address, and double-clicking a mapped byte jumps to its field. |
| 1.2.2 | 2026-11-10 | TIE Fighter: training hints now match pilots made in the 1994 and 1998 games (next level is the level picked at the start, the pilot file keeps the highest score and highest level completed, only seven craft exist). |
| 1.2.1 | 2026-11-10 | X-Wing: training levels are no longer capped at 8, so pilots that flew past the eight main Proving Ground levels (level 9 and up) load and save unchanged. |
| 1.2.0 | 2026-11-10 | X-Wing: fixes the last-operation marker for Tours 4 and 5 (it is a slot position, set from Operations completed, with a new editable Last completed slot and a warning when it does not match), rank-versus-points, medal-versus-tour and Kalidor Crescent checks, and titles for all five tours, their operations and the historical missions. TIE Fighter: mission titles and the craft flown, rank-versus-score warnings, Secret Order and goal hints, and two Top Ace presets. |
| 1.1.0 | 2026-11-08 | TIE Fighter statistics now match X-Wing: a bordered totals, weapons and losses list beside the kills table. The kills-by-ship-type list flows into two columns and drops to one when the filter leaves a short list. |
| 1.0.0 | 2026-11-08 | First release: X-Wing and TIE Fighter editing, undo and redo, changes panel, warnings, presets, raw hex view, restore of opened files, GitHub Pages link and tooltips. |
