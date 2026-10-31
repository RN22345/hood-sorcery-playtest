# Classic (SRD v3.10.20)

The printed game, and the **control group**: every other mode is compared against it.

**Goal.** Four crews fight over one Vein for 8 rounds. When it closes, the crew with the **least damage** takes it.

## The round

1. **Spin.** The Wheel lands on a sector; its effect applies to everyone this round.
2. **Cast** (secret, all at once). Lay **1–3 cards** in a row. You may commit 1 or 2 ready **Trigger Thumbs**.
3. **Flip.** Everyone reveals. Each committed Thumb rolls a d6.
4. **Rank.** Everyone is ranked on ATK and on BLK. Your row (ATK rank) and column (BLK rank) on the Damage Matrix give your damage.
5. **Refill** back to 8 cards.

## The line: 8 fingers

Total length minus matched seams must be **8 or less**. A seam matches when one card ends on the element the next card starts on:
fire–fire or wind–wind **+1 ATK**, water–water or earth–earth **+1 BLK**, and **−1 length**.

## Trigger Thumbs (2 per game)

| Roll | 1 | 2 | 3–4 | 5 | 6 |
|---|---|---|---|---|---|
| Effect | −1/−1 | nothing | +1/+1 | +2/+2 | −1 damage this round |

## Damage Matrix (4 players)

| | BLK 1st | 2nd | 3rd | 4th |
|---|---|---|---|---|
| **ATK 1st** | 0 | 0 | 0 | 1 |
| **2nd** | 0 | 0 | 1 | 1 |
| **3rd** | 0 | 1 | 1 | 2 |
| **4th** | 1 | 1 | 2 | 2 |

**Ties:** shorter line, then higher other total, then a roll-off. **Resolution order:** ties → Mugged/Sabotage rotate → matrix → Bleeding → Thumb 6.

## Wheel

Swap Meet (pass 2 left) · Flip the Script (keep or swap ATK/BLK) · The Turf (line 10, up to 4 cards) · Clean Kit (Thumb 1 = nothing) ·
Bleeding (last on ATK +1, last on BLK +1) · Cuffed (line 6) · Mugged (ATK ranks rotate) · Sabotage (BLK ranks rotate).

**End:** least damage wins. Ties: less damage in the last round, then higher ATK + BLK in the last round, then a roll-off.

## Run It Up (P4 modifier): playtest guesses (flagged)

After casting and before the flip, every crew picks at once: **Fold**, **Call** or **Raise**.
- **Stakes:** one raise doubles this round's matrix damage, two or more raises make it ×4.
- **Fold:** you skip the ranking and take a flat **1 damage** (`foldCost`). The rest are ranked with the
  matrix for their number (3- and 2-player matrices). If only one crew stays in, it takes nothing.
- Bleeding, Thumb 6, Call Out and Pass the Tab apply as usual (Bleeding is not multiplied).
- With naive bots, games end around **×2.5 the damage** of plain Classic: try a lower fold cost or ×2 max.

### Lead card (house rules *Show lead card* and *Lead card: hide ATK/BLK*, Classic only): playtest guesses

Both switch Run It Up on. While the fold / call / raise pick is open, you also see the **first card of every rival's
line** (the card leading it; order matters for seams, so this also hints at the seam order). The rest of their line stays
face down; your own line is shown in full. *Show lead card*: the full card plus a "Lead: ATK a · BLK b · length" readout,
so you have real numbers to bet on. *Lead card: hide ATK/BLK*: the number strip is covered ("ATK ? · BLK ?", and the
tooltip omits them), so only name, elements and length are known. Ticking both means the hidden version. Lead cards are
display info only (`viewFor` adds `lead` / `leadHide` during the pick); bots ignore them. Open: first card vs a chosen
card, and whether other modes could use it (Posted Up has several Spots, so it's Classic-only for now).

