# Pilot Editor

**Version 1.0.0**

A browser-based editor for X-Wing (`.plt`) and TIE Fighter (`.tfr`) pilot files. It runs entirely in your browser, so files stay on your computer.

- Live version: https://j-mathes.github.io/Pilot-Editor/
- Source: https://github.com/j-mathes/Pilot-Editor

## Using it

Open the live version, or download the repository and open `index.html` directly (no server or build step). Drop a pilot file on the page, or choose **Open**. The game is detected from the file size.

| Game | Files | Accepted sizes |
|---|---|---|
| X-Wing | `.plt` | 1705, 1706 and 3410 bytes |
| TIE Fighter | `.tfr` | 3856 bytes |

## Features

- Pilot, training, historic combat, statistics, tours of duty (X-Wing) or battles (TIE Fighter), and medals (X-Wing).
- Undo and redo, highlighting of changed fields, and a Changes panel with per-field Revert.
- Limits based on each field's size in the file, plus warnings for suspicious values (for example hits above shots fired).
- Presets, bulk actions, and totals with a Sync button.
- A raw hex view that marks bytes that differ from the opened file. Bytes the editor does not understand are kept as they are.
- A copy of each opened file is kept in the browser (Restore), and an optional `.bak` download on the first in-place save.

## Saving

- Chrome and Edge can overwrite the opened file in place. Other browsers download a new copy and never touch the original.
- On save, the second half of the file (the backup copy) is overwritten with the active pilot.

## Known limits

- The 1706-byte X-Wing layout is inferred from sample files: everything from byte 735 on is shifted by one. Check results in the game.
- The values for a new pilot are a best-effort blank, not taken from the game.
- Only a "Top Ace" preset exists for each game.

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
| 1.0.0 | 2026-11-08 | First release: X-Wing and TIE Fighter editing, undo and redo, changes panel, warnings, presets, raw hex view, restore of opened files, GitHub Pages link and tooltips. |
