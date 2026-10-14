/**
 * Original Xyeena Guardian character study: a soft golden lion with ivory face,
 * pink ears, layered mane and a metallic shield, based on the owner's concept.
 * Canvas 2D, not Coucou/Mochi artwork. No network or background polling.
 */
export const LION_PALETTE = Object.freeze({
  goldLight:'#FFE7AB',gold:'#ECA957',goldDeep:'#BD713E',
  innerEar:'#C78074',ivory:'#FFF7EB',ink:'#252129',ice:'#CEE6FF',blue:'#6D96E5'
});
export const clamp=(v,a,b)=>Number.isFinite(v)?Math.min(b,Math.max(a,v)):0;
const blend=(a,b,t)=>a+(b-a)*t;
/** Pointer and face are in the SAME logical coordinate space. */
export function lionGazeTarget(pointer,face,{deadZone=7,rangeX=210,rangeY=185}={}){
  if(!pointer||!face||![pointer.x,pointer.y,face.x,face.y].every(Number.isFinite))return {x:0,y:0};
  const dx=pointer.x-face.x,dy=pointer.y-face.y,d=Math.hypot(dx,dy);
  if(d<=deadZone)return {x:0,y:0};
  const f=clamp((d-deadZone)/Math.max(1,d),0,1);
  return {x:clamp(dx*f/rangeX,-1,1),y:clamp(dy*f/rangeY,-1,1)};
}
/** OS physical pixels -> WebView client logical pixels, including negative monitor origins. */
export function physicalPointerToCss(pointer,origin,scale){
  if(!pointer||!origin||![pointer.x,pointer.y,origin.x,origin.y,scale].every(Number.isFinite)||scale<=0)return null;
  return {x:(pointer.x-origin.x)/scale,y:(pointer.y-origin.y)/scale};
}
const gradient=(c,a,b,d,e,stops)=>{const g=c.createLinearGradient(a,b,d,e);for(const [pos,color] of stops)g.addColorStop(pos,color);return g;};
function oval(c,x,y,rx,ry,fill){c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fillStyle=fill;c.fill();}
function path(c,commands,fill){
  c.beginPath();for(const [op,...a] of commands){
    if(op==='M')c.moveTo(...a);else if(op==='L')c.lineTo(...a);
    else if(op==='Q')c.quadraticCurveTo(...a);else if(op==='C')c.bezierCurveTo(...a);
    else if(op==='Z')c.closePath();
  }c.fillStyle=fill;c.fill();
}
export class IdentityLionRig {
  constructor(){
    this.eye={x:0,y:0};this.head={x:0,y:0};this.target={x:0,y:0};
    this.time=0;this.motion=true;this.emotion='idle';
  }
  setPointer(pointer,face,options){this.target=lionGazeTarget(pointer,face,options);}
  setGaze(x,y){this.target={x:clamp(x,-1,1),y:clamp(y,-1,1)};}
  setReducedMotion(on){this.motion=!on;if(on){this.head={x:0,y:0};this.eye={...this.target};}}
  setEmotion(state){
    this.emotion=['idle','working','thinking','question','finished','error','sleeping'].includes(state)?state:'idle';
  }
  advance(dt){
    dt=clamp(dt,0,.05);this.time+=dt;
    const eyes=this.motion?1-Math.exp(-15*dt):1;
    const head=this.motion?1-Math.exp(-4.5*dt):1;
    for(const key of ['x','y']){
      this.eye[key]=blend(this.eye[key],this.target[key],eyes);
      this.head[key]=blend(this.head[key],this.motion?this.target[key]:0,head);
    }
  }
  /** Draw in local 320×320 design space, scales without changing layout. */
  draw(c,width=320,height=320){
    if(!c||typeof c.save!=='function')throw new TypeError('CanvasRenderingContext2D required');
    if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return;
    const s=Math.min(width,height)/320,t=this.motion?this.time:0;
    c.save();c.translate((width-320*s)/2,(height-320*s)/2);c.scale(s,s);
    const breathing=this.motion?1.3*Math.sin(t*1.9):0;
    const blinking=this.emotion==='sleeping'||this.motion&&(t%5.1>4.95||t%8.3>8.16);
    // Ground contact glow kept subtle in compact scale.
    c.save();c.filter='blur(12px)';oval(c,160,287,110,15,'rgba(64,97,180,.26)');c.restore();
    c.save();c.translate(0,breathing);
    const gold=c.createRadialGradient(112,80,8,164,190,171);
    [[0,'#FFF0C3'],[.44,'#F3C17B'],[.8,'#D58E4F'],[1,'#AE6846']].forEach(([a,b])=>gold.addColorStop(a,b));
    oval(c,160,186,127,109,gold);
    oval(c,70,190,51,86,gradient(c,38,111,112,256,[[0,'#FFEBC0'],[.6,'#DEA05F'],[1,'#AA6547']]));
    oval(c,250,190,51,86,gradient(c,275,101,208,263,[[0,'#FFF0CA'],[.6,'#E7A961'],[1,'#AD6747']]));
    // Ears behind forelock.
    for(const side of [-1,1]){
      const x=160+side*73;
      oval(c,x,111,41,43,gradient(c,x-22,76,x+20,151,[[0,'#FFF4D2'],[1,'#D9975B']]));
      oval(c,x,114,25,27,'#D99E88');oval(c,x,121,18,18,'#BB7A72');
    }
    // Face rig only. The body, shadow and shield stay anchored.
    c.save();c.translate(160,176);
    c.rotate(this.motion?this.head.x*.064:0);
    c.transform(1,this.motion?this.head.y*.025:0,0,1,0,0);c.translate(-160,-176);
    const sideGold=(left)=>gradient(c,left?34:282,96,left?122:198,257,
      [[0,'#FFE1A1'],[.7,'#DEA05B'],[1,'#AD6948']]);
    path(c,[['M',89,83],['C',30,111,35,232,63,253],['Q',87,261,115,238],['L',115,122],['Z']],sideGold(true));
    path(c,[['M',231,83],['C',290,111,285,232,257,253],['Q',233,261,205,238],['L',205,122],['Z']],sideGold(false));
    const mask=c.createRadialGradient(125,148,14,167,199,151);
    [[0,'#FFFFFF'],[.56,'#FFF9EF'],[.86,'#F5E7D6'],[1,'#E7D3BE']].forEach(([at,color])=>mask.addColorStop(at,color));
    oval(c,160,189,91,78,mask);
    // Centered downward tuft with two curved mane plates.
    path(c,[['M',72,124],['Q',90,75,134,72],['Q',144,51,160,55],['Q',175,53,187,72],['Q',233,76,248,124],
      ['Q',215,103,187,103],['L',160,120],['L',133,103],['Q',104,103,72,124],['Z']],
      gradient(c,162,52,156,135,[[0,'#FFE9AF'],[.62,'#F3BE76'],[1,'#CE8A4F']]));
    path(c,[['M',119,75],['Q',143,78,160,117],['Q',176,79,201,75],['Q',180,63,160,55],['Q',139,61,119,75],['Z']],
      gradient(c,155,53,165,121,[[0,'rgba(255,252,226,.8)'],[1,'rgba(211,138,78,.3)']]));
    const ex=this.eye.x*5.4,ey=this.eye.y*3.8;
    for(const x of [122,198]){
      if(blinking){
        c.beginPath();c.moveTo(x-10,189+ey);c.quadraticCurveTo(x,194+ey,x+10,189+ey);
        c.strokeStyle='#32252C';c.lineWidth=5;c.lineCap='round';c.stroke();
      }else if(this.emotion==='finished'||this.emotion==='working'){
        c.beginPath();c.moveTo(x-11+ex,193+ey);c.quadraticCurveTo(x+ex,178+ey,x+11+ex,193+ey);
        c.strokeStyle='#252129';c.lineWidth=6;c.lineCap='round';c.stroke();
      }else oval(c,x+ex,189+ey,9.4,13.2,'#251F27');
    }
    c.restore();
    // Symmetric original shield, with light silver and pale blue enamel.
    path(c,[['M',160,240],['L',188,254],['L',186,281],['Q',179,298,160,308],
      ['Q',141,298,134,281],['L',132,254],['Z']],
      gradient(c,131,246,188,309,[[0,'#FFF4CE'],[.4,'#DFA559'],[.8,'#BF7C42'],[1,'#FBE0A4']]));
    path(c,[['M',160,249],['L',180,259],['L',177,282],['Q',173,291,160,297],
      ['Q',147,291,143,282],['L',140,259],['Z']],
      gradient(c,144,251,181,299,[[0,'#FAFBFF'],[.5,'#DBE8F9'],[1,'#7898C5']]));
    path(c,[['M',160,254],['L',175,263],['L',173,282],['Q',169,290,160,295],['Z']],
      gradient(c,159,255,176,295,[[0,'rgba(255,255,255,.85)'],[1,'rgba(100,148,220,.12)']]));
    c.restore();c.restore();
  }
}
