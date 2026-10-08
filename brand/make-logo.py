from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
SP='/tmp/claude-0/-home-claude-fretboard/2b200dcc-3ea3-539e-8dcb-32b2ca31cb14/scratchpad/'
f=TTFont(SP+'fonts/U800.ttf');gs=f.getGlyphSet();cmap=f.getBestCmap();hm=f['hmtx']
B=1000  # базовая линия (y вниз)
def glyph(ch,x):
  g=cmap[ord(ch)];pen=SVGPathPen(gs);tp=TransformPen(pen,(1,0,0,-1,x,B));gs[g].draw(tp);return pen.getCommands(),hm[g][0]
TR=-18
x=0;paths=''
d,adv=glyph('d',x);paths+=f'<path d="{d}"/>';x+=adv+TR
# гитарная i: гриф = ножка, голова грифа = точка
ix=x+66;iw=250                    # как у шрифтовой i
nx0,nx1=ix+6,ix+iw-6              # гриф чуть уже
XH=590
neckTop=B-XH
hx,hw=ix-34,iw+68                 # голова расширяется кверху
hy1=neckTop-40                    # зазор = верхний порожек
hy0=B-1060                        # голова выше букв
def shapes():
  return (f'<rect x="{nx0}" y="{neckTop}" width="{nx1-nx0}" height="{XH}" rx="20"/>'
          f'<path d="M{nx0+4},{hy1} L{hx},{hy0+70} Q{hx},{hy0} {hx+70},{hy0} L{hx+hw-70},{hy0} Q{hx+hw},{hy0} {hx+hw},{hy0+70} L{nx1-4},{hy1} Z"/>')
def cuts():
  s=''
  for y in range(neckTop+120,B-60,118):
    s+=f'<rect x="{nx0}" y="{y}" width="{nx1-nx0}" height="15"/>'
  for k in range(3):   # колки по краям головы: 3 слева, 3 справа
    yy=hy0+80+k*125; inset=48+k*14
    s+=f'<circle cx="{hx+inset}" cy="{yy}" r="17"/><circle cx="{hx+hw-inset}" cy="{yy}" r="17"/>'
  return s
def strings():
  s='';n=4
  for k in range(n):
    xx=nx0+42+k*((nx1-nx0-84)/(n-1))
    s+=f'<line x1="{xx}" y1="{neckTop+6}" x2="{xx}" y2="{B-14}" stroke="#fff" stroke-opacity=".6" stroke-width="7" stroke-linecap="round"/>'
  # струны на голове к центру
  return s
x+=hm[cmap[ord('i')]][0]+TR+30
for ch in 'trihh':
  d,adv=glyph(ch,x);paths+=f'<path d="{d}"/>';x+=adv+TR
W=x+20;TOP=hy0-20;H=B+40-TOP
def svg(bg=None,pad=110,glow=True,mono=None):
  fill=mono or 'url(#g)'
  defs=f'''<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6E7BFF"/><stop offset=".55" stop-color="#A06BFF"/><stop offset="1" stop-color="#FF5FCF"/></linearGradient>
<mask id="m" maskUnits="userSpaceOnUse" x="-600" y="-600" width="{W+1200}" height="2600"><g fill="#fff">{paths}{shapes()}</g><g fill="#000">{cuts()}</g></mask>
<filter id="glow" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="36"/></filter></defs>'''
  bgr=f'<rect x="{-pad}" y="{TOP-pad}" width="{W+2*pad}" height="{H+2*pad}" fill="{bg}"/>' if bg else ''
  body=f'<rect x="-300" y="-300" width="{W+600}" height="2000" fill="{fill}" mask="url(#m)"/>'
  g=f'<g filter="url(#glow)" opacity=".85">{body}</g>' if glow else ''
  return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{-pad} {TOP-pad} {W+2*pad} {H+2*pad}">{defs}{bgr}{g}{body}<g mask="url(#m)">{strings()}</g></svg>'
def icon(bg='#0C0A24'):
  # иконка: монограмма «di» с гитарной i
  d,_=glyph('d',0)
  x0,x1=-10,hx+hw+10; y0,y1=hy0-10,B+20; w,h=x1-x0,y1-y0; side=max(w,h)*1.28; ox=x0-(side-w)/2; oy=y0-(side-h)/2
  defs=f'''<defs><linearGradient id="g" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#6E7BFF"/><stop offset=".6" stop-color="#A06BFF"/><stop offset="1" stop-color="#FF5FCF"/></linearGradient>
<radialGradient id="bgg" cx=".3" cy=".2" r="1"><stop offset="0" stop-color="#241E66"/><stop offset="1" stop-color="{bg}"/></radialGradient>
<mask id="m" maskUnits="userSpaceOnUse" x="{ox}" y="{oy}" width="{side}" height="{side}"><g fill="#fff"><path d="{d}"/>{shapes()}</g><g fill="#000">{cuts()}</g></mask>
<filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="42"/></filter></defs>'''
  body=f'<rect x="{ox}" y="{oy}" width="{side}" height="{side}" fill="url(#g)" mask="url(#m)"/>'
  return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{ox} {oy} {side} {side}">{defs}<rect x="{ox}" y="{oy}" width="{side}" height="{side}" fill="url(#bgg)"/><g filter="url(#glow)" opacity=".9">{body}</g>{body}<g mask="url(#m)">{strings()}</g></svg>'
O=SP+'logo/'
open(O+'ditrihh-logo.svg','w').write(svg())
open(O+'ditrihh-logo-dark.svg','w').write(svg(bg='#0C0A24'))
open(O+'ditrihh-logo-white.svg','w').write(svg(glow=False,mono='#ffffff'))
open(O+'ditrihh-logo-flat.svg','w').write(svg(glow=False,pad=10))
open(O+'ditrihh-icon.svg','w').write(icon())
