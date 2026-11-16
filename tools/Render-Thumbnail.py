"""Rasterize captured Canvas commands, preserving the real HUD geometry and timing."""
import json
import math
import re
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'outputs' / 'thumbnail'
DATA = json.loads((OUT / 'commands.json').read_text(encoding='utf-8'))
S = 2
W, H = DATA['width'], DATA['height']


def color(value):
    if value.startswith('#'):
        return (*tuple(int(value[i:i+2], 16) for i in (1, 3, 5)), 255)
    parts = [float(v) for v in re.findall(r'[-+]?(?:\d*\.?\d+)(?:[eE][-+]?\d+)?', value)]
    return (*[int(v) for v in parts[:3]], round(min(1, max(0, parts[3])) * 255))


def interpolate(stops, t):
    t = min(1, max(0, t))
    for i in range(1, len(stops)):
        if t <= stops[i][0]:
            a, b = stops[i-1], stops[i]
            fraction = (t-a[0]) / (b[0]-a[0] or 1)
            ca, cb = color(a[1]), color(b[1])
            return tuple(round(x+(y-x)*fraction) for x, y in zip(ca, cb))
    return color(stops[-1][1])


def font(size, bold=False):
    name = 'segoeuib.ttf' if bold else 'segoeui.ttf'
    return ImageFont.truetype(str(Path('C:/Windows/Fonts') / name), size*S)


def background():
    image = Image.new('RGB', (W*S,H*S))
    pixels = image.load()
    for y in range(H*S):
        for x in range(W*S):
            t = min(1, math.hypot((x/S-W*.5)/(W*.75), (y/S-H*.48)/(H*.9)))
            pixels[x,y] = tuple(round(a+(b-a)*t) for a,b in zip((10,26,37),(2,6,12)))
    d = ImageDraw.Draw(image, 'RGBA')
    for x in range(16,W,32):
        for y in range(16,H,32):
            d.ellipse((x*S,y*S,x*S+S,y*S+S),fill=(73,229,255,24))
    d.text((25*S,14*S),'CIRCUIT ORBIT',font=font(19,True),fill=(208,240,247,255))
    d.text((26*S,40*S),'IMPACT HUD',font=font(9),fill=(73,229,255,190))
    d.text((576*S,19*S),'02',font=font(15),fill=(89,131,150,200))
    for icon in DATA['icons']:
        x,y = icon['x']*S,icon['y']*S
        # Generic desktop file symbols: no names, labels or personal icons.
        box = [(x-7*S,y-9*S),(x+2*S,y-9*S),(x+7*S,y-4*S),(x+7*S,y+9*S),(x-7*S,y+9*S)]
        d.polygon(box,fill=(20,41,55,255),outline=(93,129,147,140),width=S)
        d.line([(x+2*S,y-9*S),(x+2*S,y-4*S),(x+7*S,y-4*S)],fill=(93,129,147,160),width=S)
        d.line((x-3*S,y+1*S,x+3*S,y+1*S),fill=(93,129,147,140),width=S)
        d.line((x-3*S,y+4*S,x+2*S,y+4*S),fill=(93,129,147,100),width=S)
    return image


def path_points(path):
    groups, points = [], []
    for part in path:
        if part[0] == 'move':
            if points: groups.append(points)
            points = [(part[1]*S,part[2]*S)]
        elif part[0] == 'line':
            points.append((part[1]*S,part[2]*S))
        elif part[0] == 'arc':
            _,x,y,r,a,b = part
            count = max(2,math.ceil(abs(b-a)*r*S/2))
            points += [((x+math.cos(a+(b-a)*i/count)*r)*S,(y+math.sin(a+(b-a)*i/count)*r)*S) for i in range(count+1)]
    if points: groups.append(points)
    return groups


def paint(image, command):
    if command['op'] == 'image':
        x,y,w,h = command['rect']
        layer = ASSETS[command['image']].resize((max(1,round(w*S)),max(1,round(h*S))),Image.Resampling.BILINEAR)
        if command.get('alpha',1) != 1:
            layer.putalpha(layer.getchannel('A').point(lambda a: round(a*command['alpha'])))
        image.paste(layer,(round(x*S),round(y*S)),layer)
        return
    style = command['style']
    d = ImageDraw.Draw(image,'RGBA')
    if command['op'] == 'rect':
        x,y,w,h = command['rect']
        if isinstance(style,str):
            d.rectangle((x*S,y*S,(x+w)*S,(y+h)*S),fill=color(style))
        else:
            _,_,r0,cx,cy,r1 = style['args']
            left,top = max(0,int(x*S)),max(0,int(y*S))
            right,bottom = min(image.width,math.ceil((x+w)*S)),min(image.height,math.ceil((y+h)*S))
            if right <= left or bottom <= top: return
            layer = Image.new('RGBA',(right-left,bottom-top))
            pixels = layer.load()
            for yy in range(bottom-top):
                for xx in range(right-left):
                    t = (math.hypot((xx+left)/S-cx,(yy+top)/S-cy)-r0)/(r1-r0 or 1)
                    pixels[xx,yy] = interpolate(style['stops'],t)
            if image.mode == 'RGBA': image.alpha_composite(layer,(left,top))
            else: image.paste(layer,(left,top),layer)
        return
    groups = path_points(command['path'])
    if command['op'] == 'fill':
        for points in groups: d.polygon(points,fill=color(style))
        return
    width = max(1,round(command['width']*S))
    if command.get('blur',0)>0 and groups:
        all_points = [p for group in groups for p in group]
        pad = math.ceil(command['blur']*S*2)
        left,top = int(min(p[0] for p in all_points))-pad,int(min(p[1] for p in all_points))-pad
        right,bottom = math.ceil(max(p[0] for p in all_points))+pad+1,math.ceil(max(p[1] for p in all_points))+pad+1
        glow = Image.new('RGBA',(right-left,bottom-top))
        gd = ImageDraw.Draw(glow)
        alpha = color(style)[3] if isinstance(style,str) else 160
        for points in groups: gd.line([(x-left,y-top) for x,y in points],fill=(*color(command['shadow'])[:3],alpha),width=width)
        glow = glow.filter(ImageFilter.GaussianBlur(command['blur']*S*.45))
        image.paste(glow,(left,top),glow)
        d = ImageDraw.Draw(image,'RGBA')
    for points in groups:
        if isinstance(style,str):
            if len(points)>1: d.line(points,fill=color(style),width=width,joint='curve')
        elif len(points)>1:
            x0,y0,x1,y1 = style['args']
            for i in range(40):
                a,b = i/40,(i+1)/40
                d.line(((x0+(x1-x0)*a)*S,(y0+(y1-y0)*a)*S,(x0+(x1-x0)*b)*S,(y0+(y1-y0)*b)*S),fill=interpolate(style['stops'],(a+b)/2),width=width)


ASSETS = []
for asset in DATA.get('assets',[]):
    image = Image.new('RGBA',(asset['width']*S,asset['height']*S))
    for command in asset['commands']: paint(image,command)
    ASSETS.append(image)
base = background()
frames = []
for i,commands in enumerate(DATA['frames']):
    image = base.copy()
    for command in commands: paint(image,command)
    frames.append(image.resize((W,H),Image.Resampling.LANCZOS))
    if i % 30 == 0: print(f'Rendered frame {i}/{len(DATA["frames"])}',flush=True)
# A short dissolve at the end masks the state reset when the thumbnail loops.
first = frames[0].copy()
for i in range(8):
    frames[-8+i] = Image.blend(frames[-8+i],first,(i+1)/8)
for i,image in enumerate(frames): image.save(OUT / f'frame-{i:03d}.png')
frames[35].save(ROOT / 'thumbnail.jpg',quality=92,subsampling=0)
print('Thumbnail JPG and animation frames ready',flush=True)
