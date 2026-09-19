from pathlib import Path
from collections import deque

from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / "public" / "icons"
SOURCE = ROOT / "recipe-app-icon.png"


def remove_outer_white_background(image: Image.Image) -> Image.Image:
    """Make only edge-connected near-white pixels transparent.

    White details inside the illustration stay intact; the cream rounded border
    is below the near-white threshold and remains opaque.
    """
    image = image.convert("RGBA")
    pixels = image.load()
    width, height = image.size
    queued = deque()
    visited = set()

    def is_outer_white(x: int, y: int) -> bool:
        red, green, blue, _ = pixels[x, y]
        return red >= 250 and green >= 250 and blue >= 250

    for x in range(width):
        queued.extend(((x, 0), (x, height - 1)))
    for y in range(height):
        queued.extend(((0, y), (width - 1, y)))

    while queued:
        x, y = queued.popleft()
        if (x, y) in visited or not is_outer_white(x, y):
            continue
        visited.add((x, y))
        red, green, blue, _ = pixels[x, y]
        pixels[x, y] = (red, green, blue, 0)
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < width and 0 <= ny < height:
                queued.append((nx, ny))
    return image


def make_icon(size: int, filename: str) -> None:
    image = remove_outer_white_background(Image.open(SOURCE))
    image.thumbnail((size, size), Image.Resampling.LANCZOS)
    image.save(ROOT / filename, optimize=True)


make_icon(192, "icon-192.png")
make_icon(512, "icon-512.png")
make_icon(180, "apple-touch-icon.png")
