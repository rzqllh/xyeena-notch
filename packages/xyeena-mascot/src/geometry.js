/** Parametric superellipse; one body shell for every expression/mode. */
export function superellipse(cx,cy,rx,ry,exponent=2.8,steps=64) {
  const n=Math.max(2,Math.min(6,exponent)), out=[];
  for(let i=0;i<=steps;i++) {
    const a=i*Math.PI*2/steps;
    const co=Math.cos(a),si=Math.sin(a);
    const x=cx+rx*Math.sign(co)*Math.abs(co)**(2/n);
    const y=cy+ry*Math.sign(si)*Math.abs(si)**(2/n);
    out.push(`${i?'L':'M'}${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return out.join(' ')+' Z';
}
