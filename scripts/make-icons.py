#!/usr/bin/env python3
"""站点图标生成：深蓝聊天气泡 + 白色粗体 SG，全扁平 Discuz 风。

主图 1024px 程序化绘制，逐级 LANCZOS 缩放保证小尺寸清晰：
  src/app/icon.png        256（favicon，圆角透明底）
  src/app/apple-icon.png  180（iOS 全幅底）
  public/logo-mark.png    512（站内品牌备用）
  public/logo-mark.webp   512（同上，轻量）

依赖：Pillow + DejaVu Sans Bold（系统自带）。用法：python3 scripts/make-icons.py
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
BLUE = (0, 86, 179, 255)      # --head-bg
WHITE = (255, 255, 255, 255)
FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

SIZE = 1024
RADIUS = 232
# 圆角方主体（下方留出尾巴空间）
RECT = (28, 28, 996, 908)
# 尾巴：从底边向左下伸出的小三角
TAIL = [(330, 880), (210, 1000), (500, 880)]


def draw_art(size: int, full_bleed: bool) -> Image.Image:
    img = Image.new("RGBA", (size, size), BLUE if full_bleed else (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    s = size / SIZE  # 缩放绘制坐标，保持各尺寸一致

    def xy(pt: tuple[int, int]) -> tuple[float, float]:
        return (pt[0] * s, pt[1] * s)

    if not full_bleed:
        x0, y0, x1, y1 = (c * s for c in RECT)
        d.rounded_rectangle([x0, y0, x1, y1], radius=RADIUS * s, fill=BLUE)
        d.polygon([xy(p) for p in TAIL], fill=BLUE)

    font_size = 1
    font = ImageFont.truetype(FONT_PATH, font_size)
    # 二分找到目标宽度（约 62% 画幅）的字号
    target_w = size * (0.66 if full_bleed else 0.68)
    lo, hi = 1, int(size)
    while lo < hi:
        mid = (lo + hi + 1) // 2
        f = ImageFont.truetype(FONT_PATH, mid)
        w = d.textbbox((0, 0), "SG", font=f)[2]
        if w <= target_w:
            lo = mid
        else:
            hi = mid - 1
    font = ImageFont.truetype(FONT_PATH, lo)
    # 视觉中心略上移（给尾巴让位；全幅版居中）
    cy = size * (0.485 if full_bleed else 0.44)
    d.text((size / 2, cy), "SG", font=font, fill=WHITE, anchor="mm")
    return img


def draw_logo(size: int, fg: tuple, bg: tuple) -> Image.Image:
    """独立 logo：气泡剪影 fg 色画在透明底，字母用 bg 色（正/反白两种配色）"""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    s = size / SIZE
    x0, y0, x1, y1 = (c * s for c in RECT)
    d.rounded_rectangle([x0, y0, x1, y1], radius=RADIUS * s, fill=fg)
    d.polygon([((p[0] * s), (p[1] * s)) for p in TAIL], fill=fg)
    target_w = size * 0.68
    lo, hi = 1, size
    while lo < hi:
        mid = (lo + hi + 1) // 2
        f = ImageFont.truetype(FONT_PATH, mid)
        w = d.textbbox((0, 0), "SG", font=f)[2]
        if w <= target_w:
            lo = mid
        else:
            hi = mid - 1
    font = ImageFont.truetype(FONT_PATH, lo)
    d.text((size / 2, size * 0.44), "SG", font=font, fill=bg, anchor="mm")
    return img


def draw_og() -> Image.Image:
    """1200x630 静态分享图：深蓝底 + 白气泡 logo + 站名（/og.png 兜底）"""
    from PIL import ImageFont as IF

    W, H = 1200, 630
    img = Image.new("RGB", (W, H), (0, 86, 179))
    d = ImageDraw.Draw(img)
    mark = draw_logo(360, WHITE, BLUE)
    img.paste(mark, (90, 135), mark)
    f_title = IF.truetype(FONT_PATH, 110)
    f_sub = IF.truetype("/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc", 46, index=0)
    d.text((500, 200), "SHUAI GAY", font=f_title, fill=WHITE)
    d.text((504, 340), "\u5f00\u653e \u00b7 \u514b\u5236 \u00b7 \u9ad8\u6548", font=f_sub, fill=(207, 224, 242))
    return img


def main() -> None:
    outputs = [
        (ROOT / "src/app/icon.png", draw_art(256, full_bleed=False), {}),
        (ROOT / "src/app/apple-icon.png", draw_art(180, full_bleed=True), {}),
        (ROOT / "public/logo-mark.png", draw_art(512, full_bleed=False), {}),
        (ROOT / "public/logo-mark.webp", draw_art(512, full_bleed=False), {"quality": 88, "method": 6}),
        # 站点 logo：浅底用蓝标，深蓝顶栏用白标；后台上传仍优先
        (ROOT / "public/logo.png", draw_logo(256, BLUE, WHITE), {}),
        (ROOT / "public/logo-reverse.png", draw_logo(256, WHITE, BLUE), {}),
        (ROOT / "public/og.png", draw_og(), {}),
    ]
    for path, img, kw in outputs:
        path.parent.mkdir(parents=True, exist_ok=True)
        img.save(path, **kw)
        print(f"wrote {path.relative_to(ROOT)} {img.size} {path.stat().st_size}B")


if __name__ == "__main__":
    main()
