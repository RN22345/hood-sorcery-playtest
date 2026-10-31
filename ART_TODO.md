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
| **Corners (P1)** corner tiles | `assets/ui/zone_corner.svg` (flat SVG, one for all corners) | 3–4 painted street corner tiles in the card-art style | ~600×300 |
| **Corners** location cards (Laundromat, Rooftop, Bodega, Precinct, Subway Grate, Old Church…) | SVG icons `assets/locations/*.svg` + text strip (6 in the game) | ~12 painted location cards with an element lean | card size, or a 600×120 strip |
| **Run It Up (P4)** | Fold / Call / Raise text buttons, red "Stakes ×N" box | chip/stake tokens | 64×64 |
| Sounds / music | **CC0 packs in use** (the lo-fi music is a stand-in: it doesn't say hood / sorcery / gangs; wanted: a darker boom-bap / street-noir theme with an occult hook, plus a tenser loop for the last rounds) (Kenney Casino/Impact/Interface/Jingles, Organic Wooshes, Open Lo-Fi; `assets/audio/CREDITS.md`) | an original Hood Sorcery theme + signature stingers (Wheel, Vein, win) | mp3/ogg |
| **Corners** claim marker | coloured name chip | marker per crew colour (4) | 64×64 |
| **Hold the Block (P2)** Block tile | `assets/ui/zone_block.svg` (flat SVG) | painted Block / Vein corner tile | ~600×300 |
| **Posted Up (P15)** Spot tiles | `zone_corner/tunnel/lot.svg` (flat SVG) | 3 painted Spot tiles | ~600×300 |
| **Posted Up** rich-Spot marker | gold "★ rich" badge + glow | Vein glow / rich marker | 64×64 |
| **Call Out (P16)** | text only | call-out token / icon | 64×64 |
| Trigger Thumb token | gold dots | token art (d6 side / SPENT side) exists in print kit `Print - Player Pieces`; needs a web export | 64×64 |
| d6 rolls | CSS dice that tumble and land (`.die`) | dice art matching the print kit | 64×64 |
| Table / menu backgrounds | `assets/ui/table_bg.svg`, `menu_bg.svg` (flat SVG, made for this build) | painted table texture and title-screen street scene | 1920×1080, < 300 KB |
| Logo / title | Gelasio text with glow over `assets/ui/vein.svg` sigil | Hood Sorcery wordmark | SVG/PNG, ~1200×300 |
| Social preview (link card) | none | 1280×640 PNG for GitHub / chat link previews | 1280×640 |

Keep web files small: webp or optimised png, under ~150 KB each.
