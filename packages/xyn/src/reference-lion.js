/**
 * Xyeena 2.5D reference rig.
 * The lion texture was extracted from the image supplied by the project owner.
 * Facial animation, effects and wardrobe are original Canvas drawings; no
 * Coucou/Mochi artwork, sounds or branding are used.
 */
import { LivingLionRig, clamp } from './lion-canvas.js';
import { STATES } from './states.js';

const TAU = Math.PI * 2;
const centerX = 231;
const centerY = 205;
const eyes = [183, 281];
const smooth = (a,b,dt,speed=8) => a+(b-a)*(1-Math.exp(-Math.max(0,dt)*speed));

function ellipse(ctx,x,y,rx,ry,color){ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,TAU);ctx.fillStyle=color;ctx.fill();}
function stroke(ctx,color,width=4){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke();}
function roundRect(ctx,x,y,w,h,r,fill){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();}
function diamond(ctx,x,y,r,color){ctx.beginPath();ctx.moveTo(x,y-r);ctx.lineTo(x+r*.74,y);ctx.lineTo(x,y+r);ctx.lineTo(x-r*.74,y);ctx.closePath();ctx.fillStyle=color;ctx.fill();}

export class ReferenceLionRig extends LivingLionRig {
  constructor(canvas,options={}){
    super(canvas,options);
    this.entryTime=0;
    this.variantBlend=0;
    this.motionPhase=0;
    this.imageReady=false;
    this.imageFailed=false;
    if(typeof Image !== 'undefined'){
      this.artwork = new Image();
      this.artwork.onload=()=>{this.imageReady=true;this.render();};
      this.artwork.onerror=()=>{this.imageFailed=true;this.render();};
      // Resolved against this module, not against the page's URL. Bundlers may
      // rewrite this import.meta.url asset to an emitted static asset.
      this.artwork.src=new URL('../assets/lion-reference.png',import.meta.url).href;
    }
  }

  setState(state){
    const from=this.state;
    super.setState(state);
    if(from!==state){this.entryTime=0;this.motionPhase=0;}
  }

  setVariant(variant){super.setVariant(variant);this.variantBlend=0;}

  update(dt){
    super.update(dt);
    this.entryTime=Math.min(30,(this.entryTime||0)+dt);
    this.variantBlend=smooth(this.variantBlend,1,dt,11);
  }

  render(){
    if(!this.imageReady){super.render();return;}
    const ctx=this.ctx;
    if(!ctx)return;
    const w=this.canvas.width,h=this.canvas.height;
    ctx.clearRect(0,0,w,h);
    ctx.save();
    const sc=Math.min(w/445,h/405);
    ctx.translate((w-445*sc)/2,(h-405*sc)/2);
    ctx.scale(sc,sc);

    const t=this.reducedMotion?0:this.time;
    const state=this.state;
    const conf=STATES[state]??STATES.idle;
    const busy=['working','thinking','searching','upload'].includes(state);
    const sleepy=['sleeping','yawn','rate_limit'].includes(state);
    const happy=['finished','greeting','proud','dancing'].includes(state)||this.emoteName==='salute';
    const tilt=state==='question'?Math.sin(t*2)*.024:state==='thinking'?Math.sin(t*1.1)*.015:0;
    const bounce=this.reducedMotion?0:(happy?Math.abs(Math.sin(t*4.2))*-4.3:busy?Math.sin(t*2.8)*1.35:Math.sin(t*1.8)*1.9);
    const squeeze=this.reducedMotion?0:Math.sin(t*(sleepy?1:1.85))*.0055;
    const responseYaw=this.reducedMotion?0:this.headYaw*.035;
    const responseX=this.reducedMotion?0:this.headYaw*4.0;
    const responseY=this.reducedMotion?0:this.headPitch*2.2;

    // Grounding glow and contact shadow never move with the face.
    const glow=ctx.createRadialGradient(centerX,355,9,centerX,355,170);
    glow.addColorStop(0,'rgba(74,108,255,.30)');
    glow.addColorStop(.45,'rgba(76,85,255,.12)');
    glow.addColorStop(1,'rgba(76,85,255,0)');
    ellipse(ctx,centerX,353,160,30,glow);

    ctx.save();
    ctx.translate(centerX+responseX,centerY+responseY+bounce);
    ctx.rotate(responseYaw+tilt);
    ctx.scale(1+squeeze*.45,1-squeeze);
    ctx.translate(-centerX,-centerY);
    ctx.drawImage(this.artwork,0,0,445,405);

    // Eyes are drawn above the eye-free face plate so they can blink, look,
    // smile or focus independently while the lion retains its 3D-style texture.
    const lookX=this.eyeGazeX*5.7;
    const lookY=this.eyeGazeY*3.5;
    const blinking=(this.isBlinking&&!this.reducedMotion)||sleepy;
    for(const [i,x] of eyes.entries()){
      const ex=x+lookX,ey=216+lookY;
      if(this.variant==='visor')continue;
      ctx.beginPath();
      if(happy||state==='love'){
        ctx.moveTo(ex-12,ey+5);ctx.quadraticCurveTo(ex,ey-12,ex+12,ey+5);
        stroke(ctx,'#211b21',5.1);
      }else if(state==='wink'&&i===1||blinking){
        ctx.moveTo(ex-11,ey+1);ctx.quadraticCurveTo(ex,ey+4,ex+11,ey+1);
        stroke(ctx,'#211b21',4.5);
      }else if(state==='annoyed'||state==='error'){
        ellipse(ctx,ex,ey,11,15,'#211b21');
        ctx.beginPath();ctx.moveTo(ex-12,ey-20+(i?-5:5));ctx.lineTo(ex+12,ey-20+(i?5:-5));stroke(ctx,'#6b4038',3);
      }else if(state==='dizzy'){
        ctx.arc(ex,ey,10.5,0,TAU*1.4);stroke(ctx,'#2b2429',3);
      }else{
        const width=state==='surprised'||state==='question'?12.7:11.5;
        ellipse(ctx,ex,ey,width,16.6,'#211b21');
      }
    }
    if(this.variant==='visor'){
      roundRect(ctx,122,176,218,82,32,'#17233b');
      roundRect(ctx,129,182,204,68,27,'#15223c');
      const glass=ctx.createLinearGradient(127,184,333,252);
      glass.addColorStop(0,'rgba(48,111,175,.30)');glass.addColorStop(.5,'rgba(61,107,165,.14)');glass.addColorStop(1,'rgba(10,13,30,.8)');
      roundRect(ctx,129,182,204,68,27,glass);
      for(const ex of [190,270]){
        ellipse(ctx,ex,215,8.5,13.5,'#7dd8ff');
        ellipse(ctx,ex,214,17,22,'rgba(69,161,255,.07)');
      }
      ctx.beginPath();ctx.moveTo(148,191);ctx.quadraticCurveTo(205,171,310,191);stroke(ctx,'rgba(146,214,255,.48)',2.4);
    }
    this.drawWardrobe(ctx,t);
    ctx.restore();

    this.drawStatus(ctx,conf,state,t);
    if(this.emoteName==='salute'&&!this.reducedMotion){
      const p=Math.min(1,this.emoteTime/Math.max(.001,this.emoteDuration));
      if(p<.85)this.drawSpark(ctx,centerX,75,16+18*p,conf.color,(1-p)*.85);
    }
    ctx.restore();
  }

  drawWardrobe(ctx,t){
    const variant=this.variant;
    if(variant==='standard')return;
    const alpha=this.reducedMotion?1:Math.max(.1,this.variantBlend);
    ctx.save();ctx.globalAlpha=alpha;
    if(variant==='crown'){
      const gold=ctx.createLinearGradient(164,57,299,118);
      gold.addColorStop(0,'#fff1bb');gold.addColorStop(.4,'#eeb55d');gold.addColorStop(1,'#be7a40');
      ctx.beginPath();ctx.moveTo(170,112);ctx.lineTo(160,66);ctx.lineTo(192,84);ctx.lineTo(231,34);ctx.lineTo(263,81);ctx.lineTo(299,61);ctx.lineTo(290,110);ctx.closePath();ctx.fillStyle=gold;ctx.fill();stroke(ctx,'#ffe4a1',4);
      diamond(ctx,230,77,16,'#9682ff');diamond(ctx,230,74,8,'#e7daff');
    }else if(variant==='headset'){
      ctx.beginPath();ctx.arc(231,216,165,Math.PI*1.15,Math.PI*1.85);stroke(ctx,'#304877',15);
      ctx.beginPath();ctx.arc(231,216,165,Math.PI*1.14,Math.PI*1.86);stroke(ctx,'#8ebfff',4);
      roundRect(ctx,54,177,34,97,15,'#21304e');roundRect(ctx,370,177,34,97,15,'#21304e');
      roundRect(ctx,60,184,22,82,12,'#609eff');roundRect(ctx,376,184,22,82,12,'#609eff');
    }else if(variant==='shield'){
      ctx.save();ctx.translate(389,280);ctx.rotate(.12);
      const g=ctx.createLinearGradient(-35,-47,38,47);g.addColorStop(0,'#c7e5ff');g.addColorStop(.55,'rgba(63,124,239,.35)');g.addColorStop(1,'#6685ef');
      ctx.beginPath();ctx.moveTo(0,-46);ctx.lineTo(33,-31);ctx.lineTo(29,13);ctx.quadraticCurveTo(22,35,0,48);ctx.quadraticCurveTo(-22,35,-29,13);ctx.lineTo(-33,-31);ctx.closePath();ctx.fillStyle=g;ctx.globalAlpha=.77;ctx.fill();stroke(ctx,'#d0e5ff',3);ctx.restore();
    }else if(variant==='glasses'||variant==='sunglasses'){
      const dark=variant==='sunglasses';
      for(const x of [183,281]){roundRect(ctx,x-43,179,86,70,24,dark?'rgba(25,34,52,.88)':'rgba(215,234,255,.18)');ctx.beginPath();ctx.roundRect(x-43,179,86,70,24);stroke(ctx,dark?'#202936':'#6d5844',5);}
      ctx.beginPath();ctx.moveTo(225,197);ctx.lineTo(240,197);stroke(ctx,'#6d5844',5);
    }else if(['beanie','santa','witch'].includes(variant)){
      const c=variant==='santa'?'#e76c74':variant==='witch'?'#3a345b':'#99a1c6';
      ctx.beginPath();ctx.moveTo(111,115);ctx.quadraticCurveTo(134,2,231,24);ctx.quadraticCurveTo(322,0,350,115);ctx.closePath();ctx.fillStyle=c;ctx.fill();
      roundRect(ctx,111,105,239,31,16,variant==='santa'?'#fff3e2':'#6d72a0');
      if(variant==='santa')ellipse(ctx,332,29,24,23,'#fff6e8');
    }else if(variant==='scarf'){
      roundRect(ctx,127,309,223,31,17,'#a9adf5');roundRect(ctx,262,325,38,66,14,'#838bdd');
    }else if(variant==='bow'){
      ellipse(ctx,147,113,20,13,'#f3a1bd');ellipse(ctx,188,113,20,13,'#f3a1bd');ellipse(ctx,168,111,9,10,'#f7c2d0');
    }
    ctx.restore();
  }

  drawSpark(ctx,x,y,r,color,alpha=1){
    ctx.save();ctx.globalAlpha=alpha;
    diamond(ctx,x,y,r,color);diamond(ctx,x,y,r*.52,'#fff7f5');ctx.restore();
  }

  drawStatus(ctx,conf,state,t){
    if(state==='idle'||state==='sleeping'||state==='yawn'||state==='wink')return;
    const x=335,y=80;
    const p=this.reducedMotion?1:Math.min(1,this.entryTime*5);
    ctx.save();ctx.globalAlpha=p;
    if(['working','thinking','searching','upload'].includes(state)){
      const bubble=ctx.createLinearGradient(x-30,y-23,x+30,y+23);
      bubble.addColorStop(0,state==='thinking'?'#50447b':'#326fca');
      bubble.addColorStop(1,state==='thinking'?'#7565a3':'#4895ee');
      roundRect(ctx,x-32,y-23,76,45,20,bubble);
      ctx.beginPath();ctx.moveTo(x-13,y+18);ctx.lineTo(x-20,y+31);ctx.lineTo(x+2,y+21);ctx.fillStyle=bubble;ctx.fill();
      const active=Math.floor(t*2.8)%3;
      for(let i=0;i<3;i++)ellipse(ctx,x-10+i*18,y,4.5+(i===active?1.3:0),4.5+(i===active?1.3:0),i===active?'#ffffff':'#b8d9ff');
    }else if(state==='question'||state==='approval'||state==='surprised'){
      ctx.font='bold 54px system-ui,sans-serif';ctx.textAlign='center';ctx.fillStyle=conf.color;ctx.shadowColor=conf.color;ctx.shadowBlur=18;
      ctx.fillText(state==='approval'?'!':'?',x,y+14);
    }else if(['finished','proud','greeting','dancing','love'].includes(state)){
      this.drawSpark(ctx,x,y,15,conf.color,.9);
      this.drawSpark(ctx,x+37,y-17,8,'#ffdf83',.9);
      this.drawSpark(ctx,x-31,y-19,7,'#fff0ae',.85);
    }else if(['error','annoyed','rate_limit'].includes(state)){
      roundRect(ctx,x-23,y-21,49,40,15,'#503342');
      ctx.font='bold 31px system-ui';ctx.textAlign='center';ctx.fillStyle=conf.color;ctx.fillText('!',x,y+9);
    }else if(state==='dizzy'){
      ctx.font='30px system-ui';ctx.fillStyle=conf.color;ctx.fillText('✦',x,y);
    }
    ctx.restore();
  }
}
