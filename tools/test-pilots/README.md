# X-Wing test pilots

Sixteen pilot files for checking two open items from `PLAN.md` in the game itself. They are built on the game's own `ROOKIE.PLT` (the 1705-byte layout of the 1998 version), with each tour's progress, last-slot marker and operation scores filled in the way the editor writes them. The file name is the pilot name.

Regenerate them with `node tools/make-test-pilots.js` (see `tools/make-test-pilots.js`).

These are best-effort constructions. Back up your real pilots before copying these in. If the game rejects or crashes on a file, note which one: that is also a result.

## How to test

1. Copy the `.PLT` files into the game's pilot folder.
2. Start the game and select each pilot in turn.
3. For each one, look at the Tour of Duty screen and note the next mission the game offers and whether the number of operations completed looks right.
4. Quit the game, copy the files back to a separate folder, and in the editor open the original, press **Compare**, and choose the game-saved copy. The Raw bytes panel shows whether the game rewrote bytes 642, 643 or 647.

## Group 1: bytes 642 and 647

All five are Tour 1 with 5 operations done. The per-tour progress bytes say 5 in every file; only bytes 642 and 647 (which the editor treats as two copies of "operations completed in the current tour") differ.

| Pilot | What differs | What to look at |
|---|---|---|
| `T1BOTH` | 642 and 647 both 5 | Control. The next mission should be 6. |
| `T1B642` | only 642 holds 5 | Does the next mission change? |
| `T1B647` | only 647 holds 5 | Same question. |
| `T1SPLIT` | 642 says 2, 647 says 8 | Which one does the game follow? |
| `T1ZERO` | 642 and 647 both 0 | Does the game still show 5 done? |

If all five look identical in the game, the game does not read 642 or 647 and rebuilds the value from the per-tour bytes.

## Group 2: Tours 4 and 5

Earlier tours are marked Complete (with their medals). Each pilot is Active in the tour named.

| Pilot | State | What to look at |
|---|---|---|
| `T4O3` | Tour 4, 3 operations done | Does the next mission match the count? |
| `T4O5` | Tour 4, 5 done | Next is the 6A/6B choice. |
| `T4O6A` | Tour 4, 6 done, flew 6A | Does it offer operation 7? |
| `T4O6B` | Tour 4, 6 done, flew 6B | Same, with the b version flown. |
| `T4O19` | Tour 4, 19 done | One operation left. |
| `T4DONE` | Tour 4 complete | Shown as complete? |
| `T5O3` | Tour 5, 3 operations done | Does the next mission match the count? |
| `T5O10` | Tour 5, 10 done | Next is the 11A/11B choice. |
| `T5O11A` | Tour 5, 11 done, flew 11A | Does it offer operation 12? |
| `T5O11B` | Tour 5, 11 done, flew 11B | Same, with the b version flown. |
| `T5DONE` | Tour 5 complete | Shown as complete? |

## What the results settle

- Whether the game uses bytes 642 and 647 at all, and which one wins if they disagree.
- Whether the last-slot marker the editor writes for Tours 4 and 5 (a slot position, with the a or b version of a pair) makes the game offer the right next mission.
- What bytes 642, 643 and 647 hold after the game saves a Tour 5 pilot (step 4 above).
