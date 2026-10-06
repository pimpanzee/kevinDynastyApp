"""Render the GRIDLOCK app icon: a retro pixel-art football on a street wall.

The art is drawn on a pixel grid centred on the ball, so each output can use
the grid size that divides its pixel size evenly (crisp, no resampling):
32 cells for 192/512, 36 cells for Apple's 180. Run from the repo root:

    python3 scripts/make-icons.py
"""
import math
import random

from PIL import Image

ASPHALT = (32, 30, 29)       # --color-text
FENCE = (44, 41, 39)
FENCE_HI = (62, 58, 55)
RED = (236, 48, 19)          # --color-accent
RED_DK = (176, 30, 10)
INK = (14, 13, 12)
LEATHER = (139, 74, 34)
LEATHER_DK = (92, 46, 20)
LEATHER_HI = (184, 105, 47)
SHINE = (232, 150, 86)
WHITE = (243, 242, 242)      # --color-bg
STREAK = (243, 242, 242)
STREAK_DIM = (150, 144, 140)

rng = random.Random(7)
SPLAT_R = [11.6 + rng.uniform(-1.4, 1.4) for _ in range(24)]
SPECKS = [(rng.uniform(-15, 15), rng.uniform(-15, 15)) for _ in range(40)]
DRIPS = [(-7, 4), (-2, 7), (4, 3), (9, 5)]  # (column offset, length past rim)

# The ball lies on the 45-degree diagonal so every edge, seam and stitch is a
# clean pixel staircase. In ball space p = x - y runs tip to tip (lower left to
# upper right) and q = x + y runs across it (upper left to lower right).
TIP = 19       # |p| at the tips
WIDE = 8.5     # |q| at the fattest point


def ball_pq(x, y):
    return x - y, x + y


def in_ball(x, y):
    p, q = ball_pq(x, y)
    if abs(p) > TIP:
        return False
    return abs(q) <= WIDE * (1 - (abs(p) / TIP) ** 1.6) ** 1.4


def splat_radius(theta):
    t = (theta / (2 * math.pi)) % 1 * len(SPLAT_R)
    i = int(t)
    f = t - i
    a, b = SPLAT_R[i], SPLAT_R[(i + 1) % len(SPLAT_R)]
    return a + (b - a) * f


def in_splat(x, y):
    r = math.hypot(x, y)
    if r <= splat_radius(math.atan2(y, x)):
        return True
    for dx, length in DRIPS:
        if abs(x - dx) < 0.9:
            rim = math.sqrt(max(0.0, splat_radius(math.pi / 2) ** 2 - dx * dx))
            if 0 < y <= rim + length:
                return True
    return False


def ball_colour(x, y):
    p, q = ball_pq(x, y)
    # Stripes near each tip.
    if 11 <= abs(p) <= 12:
        return WHITE
    # Laces: a seam along the ball with short cross stitches.
    if abs(p) <= 6 and q == 0:
        return WHITE
    if p in (-4, 0, 4) and q in (-2, 2):
        return WHITE
    # Light from the upper left.
    if q >= 4 or (q >= 3 and abs(p) >= 9):
        return LEATHER_DK
    if q <= -5 and abs(p) <= 6:
        return SHINE if q <= -6 and abs(p) <= 3 else LEATHER_HI
    return LEATHER


def streak(x, y):
    """Speed lines trailing the ball toward the lower left."""
    p, q = ball_pq(x, y)
    for lane, start, end in ((-6, -26, -17), (0, -30, -19), (6, -25, -16)):
        if start <= p <= end and lane <= q <= lane + 1:
            return STREAK if p > (start + end) / 2 else STREAK_DIM
    return None


def cell(x, y):
    """Colour of grid cell whose centre is (x, y) relative to the icon centre."""
    if in_ball(x, y):
        return ball_colour(x, y)
    # One-cell ink outline around the ball.
    if any(in_ball(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
        return INK
    s = streak(x, y)
    if s:
        return s
    if in_splat(x, y):
        return RED_DK if in_splat(x - 1, y - 1) is False else RED
    for sx, sy in SPECKS:
        if math.hypot(x - sx, y - sy) < 0.5 and math.hypot(x, y) > 12:
            return RED
    # Chain-link fence over asphalt.
    xi, yi = int(math.floor(x)), int(math.floor(y))
    if (xi + yi) % 8 == 0 and (xi - yi) % 8 == 0:
        return FENCE_HI
    if (xi + yi) % 8 == 0 or (xi - yi) % 8 == 0:
        return FENCE
    return ASPHALT


def grid(n):
    # Nudge the ball up and right so it and its speed lines sit optically centred.
    cx, cy = n // 2 + 1, n // 2 - 1
    return [[cell(c - cx, r - cy) for c in range(n)] for r in range(n)]


def png(n, scale, path):
    g = grid(n)
    img = Image.new('RGB', (n, n))
    img.putdata([px for row in g for px in row])
    img.resize((n * scale, n * scale), Image.NEAREST).save(path, optimize=True)


def svg(n, path):
    g = grid(n)
    rects = []
    for r, row in enumerate(g):
        c = 0
        while c < n:
            colour = row[c]
            start = c
            while c < n and row[c] == colour:
                c += 1
            if colour != ASPHALT:
                rects.append('<rect x="%d" y="%d" width="%d" height="1" fill="#%02x%02x%02x"/>'
                             % (start, r, c - start, *colour))
    body = '\n  '.join(rects)
    with open(path, 'w') as f:
        f.write('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" '
                'shape-rendering="crispEdges">\n  <rect width="%d" height="%d" fill="#%02x%02x%02x"/>\n  %s\n</svg>\n'
                % (n, n, n, n, *ASPHALT, body))


if __name__ == '__main__':
    png(32, 16, 'public/icon-512.png')
    png(32, 6, 'public/icon-192.png')
    png(36, 5, 'app/apple-icon.png')
    svg(32, 'app/icon.svg')
