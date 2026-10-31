"""Export cards + art from the Hood Sorcery workspace into this repo.

Run from the repo root:  python tools/export_data.py [path-to-workspace]
Default workspace = the folder that contains this repo (../).

- data/cards.json        <- card-generator/data/Hood_Sorcery_SpellDeck_v3.10.xlsx, sheet "Deck"
- assets/cards/*.webp    <- card-generator/V310_HS_Spells_Dark_ByElement/*.png (resized)
- assets/crews/*.png     <- Docs/Playmat/assets/characters/cutouts
- assets/wheel/*.png     <- Docs/Playmat/assets/wheel/cutouts
- assets/elements/*.png  <- Docs/Playmat/assets/elements
- assets/card_back.webp  <- card-generator/playingcards_io/hood_sorcery_card_back.png

Needs: openpyxl, Pillow.
"""
import json
import sys
from pathlib import Path

import openpyxl
from PIL import Image

REPO = Path(__file__).resolve().parent.parent
WS = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else REPO.parent

ELEM = {"🔥": "fire", "💧": "water", "🌪️": "wind", "🌪": "wind", "🌱": "earth", "🪨": "earth"}


def export_cards():
    wb = openpyxl.load_workbook(WS / "card-generator/data/Hood_Sorcery_SpellDeck_v3.10.xlsx", read_only=True, data_only=True)
    rows = list(wb["Deck"].iter_rows(values_only=True))
    head = rows[0]
    cards = []
    art = {p.name.split("_")[0]: p for p in (WS / "card-generator/V310_HS_Spells_Dark_ByElement").glob("HS3-P*.png")}
    for r in rows[1:]:
        if not r or not r[0]:
            continue
        d = dict(zip(head, r))
        cid = d["ID"]
        cards.append({
            "id": cid,
            "name": d["Name"],
            "start": ELEM[d["Start"].strip()],
            "end": ELEM[d["End"].strip()],
            "len": int(d["Length"]),
            "atk": int(d["Attack"]),
            "blk": int(d["Block"]),
            "img": f"assets/cards/{cid}.webp" if cid in art else None,
        })
    assert len(cards) == 72, len(cards)
    (REPO / "data/cards.json").write_text(json.dumps(cards, indent=1, ensure_ascii=False), encoding="utf-8")
    return art


def resize(src, dst, width, fmt=None):
    dst.parent.mkdir(parents=True, exist_ok=True)
    im = Image.open(src)
    h = round(im.height * width / im.width)
    im = im.resize((width, h), Image.LANCZOS)
    if fmt == "webp":
        im.convert("RGB").save(dst, "WEBP", quality=82)
    else:
        im.save(dst, optimize=True)


def export_art(art):
    for cid, p in art.items():
        resize(p, REPO / f"assets/cards/{cid}.webp", 300, "webp")
    resize(WS / "card-generator/playingcards_io/hood_sorcery_card_back.png", REPO / "assets/card_back.webp", 300, "webp")
    for p in (WS / "Docs/Playmat/assets/characters/cutouts").glob("*.png"):
        resize(p, REPO / "assets/crews" / p.name, 220)
    for p in (WS / "Docs/Playmat/assets/wheel/cutouts").glob("*.png"):
        resize(p, REPO / "assets/wheel" / p.name, 200)
    for p in (WS / "Docs/Playmat/assets/elements").glob("*.png"):
        resize(p, REPO / "assets/elements" / p.name, 64)


if __name__ == "__main__":
    export_art(export_cards())
    print("exported to", REPO)
