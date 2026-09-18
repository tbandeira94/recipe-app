from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1] / "public" / "icons"


def make_icon(size: int, filename: str) -> None:
    scale = size / 64
    image = Image.new("RGB", (size, size), "#173f35")
    draw = ImageDraw.Draw(image)
    radius = round(15 * scale)
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill="#173f35")
    draw.rounded_rectangle((17 * scale, 13 * scale, 33 * scale, 51 * scale), radius=3 * scale, fill="#f8f4ec")
    draw.rounded_rectangle((32 * scale, 13 * scale, 47 * scale, 51 * scale), radius=3 * scale, fill="#e35d3f")
    draw.line((32 * scale, 13 * scale, 32 * scale, 51 * scale), fill="#173f35", width=max(1, round(2 * scale)))
    for y in (23, 29):
        draw.line((22 * scale, y * scale, 28 * scale, y * scale), fill="#173f35", width=max(1, round(2 * scale)))
        draw.line((38 * scale, y * scale, 43 * scale, y * scale), fill="#173f35", width=max(1, round(2 * scale)))
    image.save(ROOT / filename, optimize=True)


make_icon(192, "icon-192.png")
make_icon(512, "icon-512.png")
make_icon(180, "apple-touch-icon.png")
