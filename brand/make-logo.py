# Логотип ditrihh: шрифт Russo One, гриф гитары на первой «i»
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
import os,sys
SP=os.path.dirname(os.path.abspath(__file__))+'/'
FONT=os.environ.get('FONT',SP+'fonts/RussoOne.ttf')  # шрифт Russo One (OFL) — скачать с fonts.google.com
O=os.environ.get('OUT',SP+'logo/')
f=TTFont(FONT);gs=f.getGlyphSet();cmap=f.getBestCmap();hm=f['hmtx']
B=1000; TR=12
def glyph(ch,x):
  g=cmap[ord(ch)];pen=SVGPathPen(gs);tp=TransformPen(pen,(1,0,0,-1,x,B));gs[g].draw(tp);return pen.getCommands(),hm[g][0]
x=0;paths=''
d,adv=glyph('d',x);paths+=f'<path d="{d}"/>';x+=adv+TR
# гитарная i (у Russo One ножка 95…270, высота 510)
ix=x+95+10; iw=175; XH=540
nx0,nx1=ix,ix+iw
neckTop=B-XH
hx,hw=ix-30,iw+60
hy1=neckTop-36
hy0=B-905
def shapes():
  return (f'<rect x="{nx0}" y="{neckTop}" width="{iw}" height="{XH}" rx="10"/>'
          f'<path d="M{nx0+2},{hy1} L{hx},{hy0+56} Q{hx},{hy0} {hx+56},{hy0} L{hx+hw-56},{hy0} Q{hx+hw},{hy0} {hx+hw},{hy0+56} L{nx1-2},{hy1} Z"/>')
def cuts():
  s=''
  for y in range(neckTop+100,B-50,100):
    s+=f'<rect x="{nx0}" y="{y}" width="{iw}" height="12"/>'
  for k in range(3):
    yy=hy0+62+k*92; inset=40+k*11
    s+=f'<circle cx="{hx+inset}" cy="{yy}" r="13"/><circle cx="{hx+hw-inset}" cy="{yy}" r="13"/>'
  return s
def strings():
  s='';n=3
  for k in range(n):
    xx=nx0+38+k*((iw-76)/(n-1))
    s+=f'<line x1="{xx}" y1="{neckTop+6}" x2="{xx}" y2="{B-12}" stroke="#fff" stroke-opacity=".6" stroke-width="6" stroke-linecap="round"/>'
  return s
x+=320+TR+20
for ch in 'trihh':
  d,adv=glyph(ch,x);paths+=f'<path d="{d}"/>';x+=adv+TR
W=x;TOP=hy0-20;H=B+30-TOP
GR='<stop offset="0" stop-color="#6E7BFF"/><stop offset=".55" stop-color="#A06BFF"/><stop offset="1" stop-color="#FF5FCF"/>'
def svg(bg=None,pad=100,glow=True,mono=None):
  fill=mono or 'url(#g)'
  defs=f'''<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0">{GR}</linearGradient>
<mask id="m" maskUnits="userSpaceOnUse" x="-600" y="-600" width="{W+1200}" height="2600"><g fill="#fff">{paths}{shapes()}</g><g fill="#000">{cuts()}</g></mask>
<filter id="glow" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="30"/></filter></defs>'''
  bgr=f'<rect x="{-pad}" y="{TOP-pad}" width="{W+2*pad}" height="{H+2*pad}" fill="{bg}"/>' if bg else ''
  body=f'<rect x="-300" y="-300" width="{W+600}" height="2000" fill="{fill}" mask="url(#m)"/>'
  g=f'<g filter="url(#glow)" opacity=".85">{body}</g>' if glow else ''
  st='' if mono else f'<g mask="url(#m)">{strings()}</g>'
  return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{-pad} {TOP-pad} {W+2*pad} {H+2*pad}">{defs}{bgr}{g}{body}{st}</svg>'
def icon(bg='#0C0A24'):
  d,_=glyph('d',0)
  x0,x1=0,hx+hw; y0,y1=hy0,B; w,h=x1-x0,y1-y0; side=max(w,h)*1.3; ox=x0-(side-w)/2; oy=y0-(side-h)/2
  defs=f'''<defs><linearGradient id="g" x1="0" y1="1" x2="1" y2="0">{GR}</linearGradient>
<radialGradient id="bgg" cx=".3" cy=".2" r="1"><stop offset="0" stop-color="#241E66"/><stop offset="1" stop-color="{bg}"/></radialGradient>
<mask id="m" maskUnits="userSpaceOnUse" x="{ox}" y="{oy}" width="{side}" height="{side}"><g fill="#fff"><path d="{d}"/>{shapes()}</g><g fill="#000">{cuts()}</g></mask>
<filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="34"/></filter></defs>'''
  body=f'<rect x="{ox}" y="{oy}" width="{side}" height="{side}" fill="url(#g)" mask="url(#m)"/>'
  return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{ox} {oy} {side} {side}">{defs}<rect x="{ox}" y="{oy}" width="{side}" height="{side}" fill="url(#bgg)"/><g filter="url(#glow)" opacity=".9">{body}</g>{body}<g mask="url(#m)">{strings()}</g></svg>'
os.makedirs(O,exist_ok=True)
open(O+'ditrihh-logo.svg','w').write(svg())
open(O+'ditrihh-logo-dark.svg','w').write(svg(bg='#0C0A24'))
open(O+'ditrihh-logo-white.svg','w').write(svg(glow=False,mono='#ffffff'))
open(O+'ditrihh-logo-flat.svg','w').write(svg(glow=False,pad=10))
open(O+'ditrihh-icon.svg','w').write(icon())
