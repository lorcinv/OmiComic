"""Export the artist's transparent Omi PNG with small mask and contact-point adaptations.

Usage: python scripts/import-home-artwork.py "path/to/omi tm.png"
Requires Pillow. Coordinates are in the original 2355 x 1563 transparent layer.
"""
import argparse
import math
from statistics import median
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageOps

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source', type=Path)
parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'src/assets')
args = parser.parse_args()
source = Image.open(args.source).convert('RGBA')
assert source.size == (2355, 1563), 'Use the original transparent layer, without resizing.'
args.output.mkdir(parents=True, exist_ok=True)
padding = 2

regions = {
    'home-omi': (1200, 0, 2355, 1563),
    'home-omi-peek': (517, 276, 781, 443),
    'home-omi-side': (1117, 881, 1288, 1127),
    'home-omi-signature': (0, 1010, 299, 1260),
}
closures = {
    'home-omi': [(20, 1494), (0, 1533), (0, 1562), (398, 1562)],
    'home-omi-peek': [(73, 148), (112, 150), (150, 150), (186, 149)],
    'home-omi-side': [(32, 73), (30, 140), (82, 155)],
    'home-omi-signature': [(111, 164), (185, 164)],
}

def head_paper(ink, name):
    """Follow the original outer hair line row by row; avoid straight polygon cuts through cheeks."""
    alpha = ink.getchannel('A').load()
    mask = Image.new('L', ink.size, 0)
    draw = ImageDraw.Draw(mask)
    last_row = {'home-omi-peek': 150, 'home-omi-side': 174, 'home-omi-signature': 178}[name]
    for y in range(last_row + 1):
        if name == 'home-omi-signature':
            left, right = 40, 264
        elif name == 'home-omi-peek':
            left, right = 0, 210 if y < 70 else 231
        else:
            left, right = 0, ink.width
        xs = [x for x in range(left, right) if alpha[x, y] > 8]
        if len(xs) < 2:
            continue
        x1, x2 = xs[0], xs[-1]
        if name == 'home-omi-side' and 72 <= y <= 150:
            x1 = min(x1, 35)  # Hidden behind the card's straight edge.
        draw.line((x1, y, x2, y), fill=255)
    mask = mask.filter(ImageFilter.MinFilter(3))
    if name == 'home-omi-side':
        # Overlap the card edge by a fraction of a source pixel instead of leaving an eroded seam.
        draw = ImageDraw.Draw(mask)
        draw.line((34,72,34,150), fill=192)
        draw.line((35,72,35,150), fill=255)
    return mask

def hand_mask(boundary, seeds):
    """Select the enclosed hands, including their full outlines, rather than polygon-cropping them."""
    result = Image.new('L', boundary.size, 0)
    for seed in seeds:
        component = boundary.copy()
        assert component.getpixel(seed) == 0, f'Hand seed is on ink: {seed}'
        ImageDraw.floodfill(component, seed, 128, thresh=0)
        component = component.point(lambda a: 255 if a == 128 else 0)
        area = sum(component.histogram()[1:])
        assert 20 < area < 4000, f'Hand contour is open or seed is misplaced: {seed}, area {area}'
        result = ImageChops.lighter(result, component.filter(ImageFilter.MaxFilter(7)))
    return result

def fill_rows(alpha, box, erode=True):
    """Fill a single silhouette without bridging unrelated objects outside its own box."""
    mask = Image.new('L', alpha.size, 0)
    draw = ImageDraw.Draw(mask)
    pixels = alpha.load()
    for y in range(box[1], box[3]):
        xs = [x for x in range(box[0], box[2]) if pixels[x, y] > 8]
        if len(xs) > 1:
            draw.line((xs[0], y, xs[-1], y), fill=255)
    return mask.filter(ImageFilter.MinFilter(3)) if erode else mask

def leg_air(ink):
    """Keep the narrow space between the two lower legs, following both original contours."""
    pixels = ink.getchannel('A').load()
    samples = []
    for y in range(1390, 1545):
        runs, run = [], []
        for x in range(145, 335):
            if pixels[x, y] > 8:
                run.append(x)
            elif run:
                runs.append(run); run = []
        if run:
            runs.append(run)
        if len(runs) >= 2:
            samples.append((y, runs[-2][-1], runs[-1][0]))
    assert samples and samples[0][0] < 1420
    left_path, right_path = [], []
    first, last = samples[0], samples[-1]
    index = 0
    a, b = samples[-11], samples[-1]
    slopes = ((b[1] - a[1]) / (b[0] - a[0]), (b[2] - a[2]) / (b[0] - a[0]))
    for y in range(first[0], ink.height):
        while index + 1 < len(samples) and samples[index + 1][0] <= y:
            index += 1
        left = samples[index]
        if index + 1 < len(samples):
            right = samples[index + 1]
            t = (y - left[0]) / (right[0] - left[0])
            x1, x2 = left[1] + (right[1] - left[1]) * t, left[2] + (right[2] - left[2]) * t
        else:
            x1, x2 = last[1] + slopes[0] * (y - last[0]), last[2] + slopes[1] * (y - last[0])
        if x2 - x1 > 1:
            left_path.append((x1 + .5,y))
            right_path.append((x2 - .5,y))
    mask = Image.new('L', ink.size, 0)
    high = Image.new('L', (215*4,173*4),0)
    points = left_path + list(reversed(right_path))
    ImageDraw.Draw(high).polygon([((x-120)*4,(y-1390)*4) for x,y in points], fill=255)
    mask.paste(high.resize((215,173),Image.Resampling.LANCZOS),(120,1390))
    return mask

def finish_local_edges(image, ink):
    """Clean only the hand, arm/hair gap and outer shoulder highlighted in the review."""
    alpha = image.getchannel('A')
    for box, size in [((130,500,365,715),5),((330,570,450,760),7),((930,685,1005,825),3)]:
        region = alpha.crop(box)
        opened = region.filter(ImageFilter.MinFilter(size)).filter(ImageFilter.MaxFilter(size)).filter(ImageFilter.GaussianBlur(.25))
        alpha.paste(ImageChops.darker(region,opened),box[:2])
    # Clip the shoulder's paper to the actual outer ink contour, not the filled bounding area.
    ia, gray = ink.getchannel('A').load(), ink.convert('L').load()
    edges = []
    for y in range(685,825):
        xs = [x for x in range(900,1040) if ia[x,y] > 128 and gray[x,y] < 224]
        edges.append(xs[-1] if xs else (edges[-1] if edges else 980))
    edges = [median(edges[max(0,i-5):min(len(edges),i+6)]) for i in range(len(edges))]
    high = Image.new('L',(140*4,140*4),0)
    points = [(0,0)] + [((x-900+.75)*4,i*4) for i,x in enumerate(edges)] + [((edges[-1]-900+.75)*4,140*4),(0,140*4)]
    ImageDraw.Draw(high).polygon(points,fill=255)
    keep = high.resize((140,140),Image.Resampling.LANCZOS)
    alpha.paste(ImageChops.darker(alpha.crop((900,685,1040,825)),keep),(900,685))
    image.putalpha(alpha)
    return image

def clean_main_outline(image):
    """Antialias the silhouette and pull paper back inside the ink, without blurring inner strokes."""
    alpha = image.getchannel('A')
    # Protect the isolated fine hair strands: only adjust edges close to a filled body area.
    near_body = alpha.point(lambda a: 255 if a >= 192 else 0).filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(9))
    smooth = alpha.filter(ImageFilter.MedianFilter(3)).filter(ImageFilter.GaussianBlur(.45))
    smooth = smooth.point(lambda a: max(0,min(255,round((a-12)*255/231))))
    alpha = Image.composite(ImageChops.darker(alpha,smooth),alpha,near_body)
    core = alpha.point(lambda a: 255 if a >= 160 else 0).filter(ImageFilter.MinFilter(3))
    edge = ImageChops.multiply(ImageChops.subtract(alpha,core),near_body)
    # The transparent source is black ink. Paper outside it must not leave a bright fringe.
    rgb = Image.composite(Image.new('RGB',image.size,(0,0,0)),image.convert('RGB'),edge)
    image = rgb.convert('RGBA')
    image.putalpha(alpha)
    return image

def original_side_hand():
    """Recover the complete enclosed palm from the source, including its uncut finger contour."""
    ink = source.crop(regions['home-omi-side'])
    boundary = ink.getchannel('A').point(lambda a: 255 if a > 8 else 0)
    selected = boundary.copy()
    ImageDraw.floodfill(selected,(20,155),128,thresh=0)
    inside = selected.point(lambda a: 255 if a == 128 else 0)
    assert 400 < inside.histogram()[255] < 600, 'The original closed palm must remain intact.'
    paper = Image.new('RGBA',ink.size,(255,255,255,0))
    paper.putalpha(ImageChops.lighter(inside,fill_rows(ink.getchannel('A'),(24,152,47,182))))
    strokes = inside.filter(ImageFilter.MaxFilter(9))
    sd = ImageDraw.Draw(strokes)
    sd.rectangle((0,140,35,180),fill=255)
    sd.rectangle((24,151,47,182),fill=255)
    ink.putalpha(ImageChops.multiply(ink.getchannel('A'),strokes))
    return Image.alpha_composite(paper,ink)

def fit_side_to_card(image):
    """Fit the contact silhouette to the actual 28px card corner, retaining both gripping hands."""
    scale = 4
    offset = (18,2)
    radius = 28 * 2480 / 1440
    center = (35-radius,187-radius)
    def edge(y):
        return 35 if y <= center[1] else center[0] + math.sqrt(max(0,radius**2-(y-center[1])**2))
    def points(path):
        return [((x+offset[0])*scale,(y+offset[1])*scale) for x,y in path]
    high = Image.new('RGBA',(image.width*scale,image.height*scale))
    draw = ImageDraw.Draw(high)
    # Complete the small missing head/face pieces behind the original ink and highlights.
    draw.polygon(points([(34,27),(58,21),(85,22),(91,38),(70,50),(34,55)]),fill=(0,0,0,255))
    draw.polygon(points([(34,65),(49,65),(49,143),(34,143)]),fill=(255,255,255,255))
    # The shirt and skirt follow the circular card edge; no straight triangular tip across it.
    draw.polygon(points([(edge(y)-1,y) for y in range(164,176)] + [(55,175),(55,164)]),fill=(255,255,255,255))
    draw.polygon(points([(edge(y)-1,y) for y in range(175,188)] + [(-9,190),(15,199),(47,199),(55,175)]),fill=(0,0,0,255))
    image = Image.alpha_composite(high.resize(image.size,Image.Resampling.LANCZOS),image)
    keep = Image.new('L',high.size,255)
    kd = ImageDraw.Draw(keep)
    kd.polygon(points([(-18,0),(34.3,0)] + [(edge(y)-.7,y) for y in range(188)] + [(-18,187)]),fill=0)
    # The upper hand overlaps the card. The lower hand is restored separately from its true contour.
    kd.rectangle(points([(24,36),(51,63.5)]),fill=255)
    image.putalpha(ImageChops.multiply(image.getchannel('A'),keep.resize(image.size,Image.Resampling.LANCZOS)))
    # The card contour already clears the empty area left of the cheek and palm.
    # Keep the cheek and sleeve behind the source hand; rectangular erasures would cut holes in them.
    hand = ImageOps.expand(original_side_hand(),border=(18,2,2,2),fill=(0,0,0,0))
    image = Image.alpha_composite(image,hand)
    return image

def feet_mask(ink):
    mask = fill_rows(ink.getchannel('A'), (190, 193, 230, 243), erode=False)
    # The left shoe is partly tucked under the trousers; keep that original visible oval.
    high = Image.new('L', (ink.width * 4, ink.height * 4), 0)
    points = [(94,216),(98,220),(101,225),(106,230),(109,235),(106,241),(100,245),(92,244),(86,239),(83,231),(85,224),(89,219)]
    ImageDraw.Draw(high).polygon([(x*4,y*4) for x,y in points], fill=255)
    return ImageChops.lighter(mask, high.resize(ink.size, Image.Resampling.LANCZOS))

def save_asset(image, name):
    # Breathing room for curve tips prevents tight PNG bounds from clipping antialiasing.
    borders = (18,padding,padding,padding) if name == 'home-omi-side' else padding
    image = ImageOps.expand(image, border=borders, fill=(255,255,255,0))
    if name == 'home-omi-side':
        image = fit_side_to_card(image)
    target = args.output / f'{name}.webp'
    image.save(target, lossless=True, method=6)
    return target

for name, box in regions.items():
    ink = source.crop(box)
    if name == 'home-omi':
        ink.paste((255, 255, 255, 0), (0, 881, 88, 1127))
    if name == 'home-omi-side':
        # A three-pixel adaptation makes the skirt tip meet the card's rounded corner exactly.
        ImageDraw.Draw(ink).line((1,187,4,186), fill=(0,0,0,255), width=1)
    boundary = ink.getchannel('A').point(lambda a: 255 if a > 8 else 0)
    boundary = boundary.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))
    raw_boundary = boundary.copy()
    ImageDraw.Draw(boundary).line(closures[name], fill=255, width=3)
    exterior = ImageOps.expand(boundary, border=1)
    ImageDraw.floodfill(exterior, (0, 0), 128, thresh=0)
    silhouette = exterior.crop((1, 1, ink.width + 1, ink.height + 1)).point(lambda a: 0 if a == 128 else 255)
    paper = Image.new('RGBA', ink.size, (255, 255, 255, 0))
    paper.putalpha(silhouette.filter(ImageFilter.MinFilter(3)))
    if name != 'home-omi':
        paper.putalpha(ImageChops.lighter(paper.getchannel('A'), head_paper(ink, name)))
        if name == 'home-omi-signature':
            paper.putalpha(ImageChops.lighter(paper.getchannel('A'), fill_rows(ink.getchannel('A'), (55,174,240,250))))
            # The torso's right contour is hidden by the badge. A missing drawn edge is not a hole.
            torso = Image.new('L', ink.size, 0)
            draw, alpha = ImageDraw.Draw(torso), ink.getchannel('A').load()
            left = 68
            for y in range(174,218):
                xs = [x for x in range(55,125) if alpha[x,y] > 8]
                if xs:
                    left = xs[0] + 1
                draw.line((left,y,160,y), fill=255)
            paper.putalpha(ImageChops.lighter(paper.getchannel('A'), torso))
    else:
        # Select only the bounded air gap between arm and shirt, following its actual ink contour.
        gap = raw_boundary.crop((320, 570, 520, 770))
        ImageDraw.floodfill(gap, (50, 105), 128, thresh=0)
        gap = gap.point(lambda a: 255 if a == 128 else 0)
        assert 1000 < gap.histogram()[255] < 10000
        # Floating eraser/brush pixels inside this air gap are not part of its bounding contour.
        gap_exterior = ImageOps.expand(gap, border=1)
        ImageDraw.floodfill(gap_exterior, (0, 0), 128, thresh=0)
        gap = gap_exterior.crop((1, 1, gap.width + 1, gap.height + 1)).point(lambda a: 0 if a == 128 else 255)
        negative = Image.new('L', ink.size, 0)
        negative.paste(gap, (320, 570))
        paper.putalpha(ImageChops.subtract(paper.getchannel('A'), negative))
        ink.putalpha(ImageChops.subtract(ink.getchannel('A'), negative))
        paper.putalpha(ImageChops.subtract(paper.getchannel('A'), leg_air(ink)))
    # Do not build a square paper cap at the tight original crop edge.
    paper_alpha, source_alpha = paper.getchannel('A'), ink.getchannel('A')
    pa, ia = paper_alpha.load(), source_alpha.load()
    for y in range(ink.height):
        for x in ([0,1,ink.width-2,ink.width-1] if 2 <= y < ink.height-2 else range(ink.width)):
            pa[x,y] = min(pa[x,y],ia[x,y])
    paper.putalpha(paper_alpha)
    ink.putalpha(source_alpha.point(lambda a: 0 if a <= 2 else a))
    image = Image.alpha_composite(paper, ink)
    if name == 'home-omi':
        image = finish_local_edges(image,ink)
        image = clean_main_outline(image)
    decor = Image.new('RGBA', ink.size)
    decor_boxes = [(214,0,264,72)] if name == 'home-omi-peek' else [(0,135,45,185),(265,35,299,90)] if name == 'home-omi-signature' else []
    for decor_box in decor_boxes:
        decor.paste(ink.crop(decor_box), decor_box[:2])
        image.paste((255,255,255,0), decor_box)
    if decor_boxes:
        save_asset(decor, name + '-decor')
    target = save_asset(image, name)
    if name == 'home-omi-signature':
        seeds = [(89, 157), (107, 143), (204, 158), (208, 174)]
        hands = hand_mask(raw_boundary, seeds)
        hands = ImageChops.lighter(hands, feet_mask(ink))
        foreground = Image.new('RGBA', ink.size)
        foreground.paste(image, (0, 0), hands)
        save_asset(foreground, name + '-front')
    print(name, image.size, target.stat().st_size)
