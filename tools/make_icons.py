"""生成插件图标（纯标准库，无需 Pillow）"""
import struct
import zlib
import os

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "icons")

BOLT = [(0.60, 0.10), (0.26, 0.55), (0.46, 0.55), (0.39, 0.90), (0.75, 0.42), (0.53, 0.42)]


def inside_poly(x, y, poly):
    inside = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi):
            inside = not inside
        j = i
    return inside


def rounded(x, y, r):
    # 0..1 坐标，圆角方形覆盖率
    cx = min(max(x, r), 1 - r)
    cy = min(max(y, r), 1 - r)
    dx = x - cx
    dy = y - cy
    return (dx * dx + dy * dy) ** 0.5 <= r


def lerp(a, b, t):
    return a + (b - a) * t


def make(size):
    r = 0.23
    rows = []
    for py in range(size):
        row = bytearray([0])
        for px in range(size):
            cov = 0
            white = 0
            for sy in range(3):
                for sx in range(3):
                    x = (px + (sx + 0.5) / 3) / size
                    y = (py + (sy + 0.5) / 3) / size
                    if rounded(x, y, r):
                        cov += 1
                        # 闪电形状
                        if inside_poly(x, y, BOLT):
                            white += 1
            if cov == 0:
                row += bytes([0, 0, 0, 0])
                continue
            t = (py / size) * 0.65 + (px / size) * 0.35
            cr = lerp(79, 124, t)
            cg = lerp(70, 58, t)
            cb = lerp(229, 237, t)
            w = white / 9.0
            cr = lerp(cr, 255, w)
            cg = lerp(cg, 255, w)
            cb = lerp(cb, 255, w)
            row += bytes([int(cr), int(cg), int(cb), int(255 * cov / 9)])
        rows.append(bytes(row))
    raw = b"".join(rows)

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for s in (16, 48, 128):
        with open(os.path.join(OUT, "icon%d.png" % s), "wb") as f:
            f.write(make(s))
        print("icon%d.png" % s)
