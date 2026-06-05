#!/usr/bin/env python3
"""墨笺 InkNote — 图标生成脚本
使用: python3 tools/gen-icons.py
输出: icons/icon16.png, icon48.png, icon128.png
"""

from PIL import Image, ImageDraw
import os, shutil

def create_inknote_icon(size, output_path):
    """Create InkNote icon - warm paper-toned with ink blue note symbol"""
    img = Image.new('RGBA', (size, size), (245, 240, 228, 255))  # warm paper
    draw = ImageDraw.Draw(img)
    c = size / 128.0

    ink_blue = (25, 65, 115)
    accent = (45, 110, 185)

    # Paper body
    margin = int(22 * c)
    pw = size - 2 * margin
    ph = size - 2 * margin

    draw.rounded_rectangle(
        [margin, margin, margin + pw, margin + ph],
        radius=int(8 * c),
        fill=(255, 252, 245, 255),
        outline=(210, 200, 185, 255),
        width=max(1, int(1.5 * c))
    )

    # Blue ruling lines (信纸横线)
    line_color = (170, 195, 225, 160)
    lx1 = margin + int(18 * c)
    lx2 = margin + pw - int(16 * c)
    line_top = int(46 * c)
    line_bottom = margin + ph - int(18 * c)
    line_spacing = int(14 * c)

    y = line_top
    while y <= line_bottom:
        draw.line([(lx1, y), (lx2, y)], fill=line_color, width=max(1, int(1.2 * c)))
        y += line_spacing

    # Vertical red margin line (传统信纸红色竖线)
    red_line_x = int(34 * c) + margin
    draw.line(
        [(red_line_x, line_top), (red_line_x, line_bottom)],
        fill=(210, 120, 120, 140),
        width=max(1, int(1.5 * c))
    )

    # Ink dot (墨点) top-left
    dot_cx = margin + int(20 * c)
    dot_cy = margin + int(20 * c)
    draw.ellipse(
        [dot_cx - int(10*c), dot_cy - int(10*c), dot_cx + int(10*c), dot_cy + int(10*c)],
        fill=(*ink_blue, 220)
    )

    # Ink splatters
    for sx, sy, sr, sa in [
        (dot_cx + 14, dot_cy - 6, 4, 160),
        (dot_cx + 22, dot_cy + 4, 3, 120),
        (dot_cx - 5, dot_cy + 14, 3, 140),
        (dot_cx + 8, dot_cy + 18, 2, 100),
    ]:
        draw.ellipse([sx - sr, sy - sr, sx + sr, sy + sr], fill=(*ink_blue, sa))

    # Stylized diamond (folded corner marker)
    diamond_x = margin + pw - int(32 * c)
    diamond_y = margin + int(16 * c)
    d_size = int(12 * c)
    draw.polygon([
        (diamond_x, diamond_y - d_size),
        (diamond_x + d_size, diamond_y),
        (diamond_x, diamond_y + d_size),
        (diamond_x - d_size, diamond_y)
    ], fill=accent, outline=(*ink_blue, 200))

    # Pen nib at bottom-right
    nib_cx = margin + pw - int(14 * c)
    nib_cy = margin + ph - int(14 * c)
    nib_len = int(18 * c)
    draw.line(
        [(nib_cx - nib_len//2, nib_cy + nib_len//2),
         (nib_cx + nib_len//2, nib_cy - nib_len//2)],
        fill=ink_blue,
        width=max(2, int(3 * c))
    )
    draw.line(
        [(nib_cx + nib_len//2, nib_cy - nib_len//2),
         (nib_cx + nib_len//2 + int(5*c), nib_cy - nib_len//2 - int(5*c))],
        fill=accent,
        width=max(1, int(2*c))
    )

    img = img.resize((size, size), Image.LANCZOS)
    img.save(output_path, 'PNG')


if __name__ == '__main__':
    icons_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'icons')
    os.makedirs(icons_dir, exist_ok=True)

    for size, name in [(16, 'icon16.png'), (48, 'icon48.png'), (128, 'icon128.png')]:
        path = os.path.join(icons_dir, name)
        create_inknote_icon(size, path)
        print(f'✅ {name} ({size}x{size})')

    print('🎉 图标生成完成！')
