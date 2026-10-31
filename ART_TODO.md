# Art status

What the site uses today, and what is a placeholder. Source art lives in the Hood Sorcery workspace
(`Docs/Playmat/assets/`, `card-generator/`); `tools/export_data.py` resizes it into `assets/`.

## In use (real art)

| Asset | File(s) | From |
|---|---|---|
| 72 spell cards | `assets/cards/HS3-P01…P72.webp` (300 px) | `card-generator/V310_HS_Spells_Dark_ByElement/` |
| Card back | `assets/card_back.webp` (opponents' hands, deck counter) | `card-generator/playingcards_io/hood_sorcery_card_back.png` |
| 4 crew standees | `assets/crews/P1_fire.png` … `P4_wind.png` | `Docs/Playmat/assets/characters/cutouts/` |
| 8 Wheel sectors | `assets/wheel/1_SWAP_MEET.png` … | `Docs/Playmat/assets/wheel/cutouts/` |
| 4 element badges | `assets/elements/*.png` | `Docs/Playmat/assets/elements/` |
| Fonts | Gelasio (headings), Noto Sans (body) via Google Fonts | same as print |

## Missing: placeholders in use

| Needed for | Placeholder now | What to make | Size |
|---|---|---|---|
| **Corners (P1)** corner tiles | dark panel with the name "Corner A/B/C" | 3–4 street corner tiles (or one generic) | ~600×300 |
| **Corners** location cards (Laundromat, Rooftop, Bodega, Precinct, Subway Grate, Old Church…) | gold-edged text strip under the corner name (6 in the game) | ~12 location cards with an element lean | card size, or a 600×120 strip |
| **Run It Up (P4)** | Fold / Call / Raise text buttons, red "Stakes ×N" box | chip/stake tokens | 64×64 |
| Logo | Gelasio text logo with glow (title screen) | Hood Sorcery wordmark | ~1200×200, transparent |
| Sounds | synthesized in the browser (`ui/fx.js`) | short SFX set: card, lock, flip, coin, hit, Wheel tick, win | < 30 KB each |
| **Corners** claim marker | coloured name chip | marker per crew colour (4) | 64×64 |
| **Hold the Block (P2)** Block tile | panel named "The Block" | one Block / Vein corner tile | ~600×300 |
| **Posted Up (P15)** Spot tiles | panels "Corner", "Tunnel", "Lot" | 3 Spot tiles (street corner, subway tunnel, empty lot) | ~600×300 |
| **Posted Up** rich-Spot marker | gold "★ rich" badge + glow | Vein glow / rich marker | 64×64 |
| **Call Out (P16)** | text only | call-out token / icon | 64×64 |
| Trigger Thumb token | gold dots | token art (d6 side / SPENT side) exists in print kit `Print - Player Pieces`; needs a web export | 64×64 |
| d6 rolls | numbers in text | dice faces 1–6 | 48×48 |
| Table background | CSS gradient | dark street/table texture | 1920×1080, < 300 KB |
| Logo / title | text in Gelasio | Hood Sorcery wordmark | SVG/PNG |
| Social preview (link card) | none | 1280×640 PNG for GitHub / chat link previews | 1280×640 |

Keep web files small: webp or optimised png, under ~150 KB each.
