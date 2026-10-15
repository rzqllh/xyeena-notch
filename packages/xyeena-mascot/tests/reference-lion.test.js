import test from 'node:test';
import assert from 'node:assert/strict';
import { ReferenceLionRig } from '../src/reference-lion.js';

const fakeContext = () => {
  let drawCalls=0;
  const g={addColorStop(){}};
  const ctx={
    clearRect(){},save(){},restore(){},scale(){},translate(){},rotate(){},
    beginPath(){},ellipse(){},fill(){},stroke(){},moveTo(){},lineTo(){},closePath(){},
    quadraticCurveTo(){},bezierCurveTo(){},arc(){},roundRect(){},transform(){},
    createLinearGradient(){return g;},createRadialGradient(){return g;},
    fillText(){},drawImage(){drawCalls++;},
  };
  return {ctx,get drawCalls(){return drawCalls;}};
};

test('reference artwork loads, renders expressions, and updates wardrobe', async () => {
  const old=globalThis.Image;
  class FakeImage{
    set src(url){this.url=url;queueMicrotask(()=>this.onload?.());}
  }
  globalThis.Image=FakeImage;
  try{
    const ink=fakeContext();
    const canvas={width:0,height:0,style:{},getContext:()=>ink.ctx};
    const lion=new ReferenceLionRig(canvas,{size:140,state:'idle'});
    await new Promise(resolve=>queueMicrotask(resolve));
    assert.equal(lion.imageReady,true);
    assert.match(lion.artwork.url,/lion-reference\.png/);
    assert.ok(ink.drawCalls>0);
    lion.setVariant('headset');lion.setState('working');
    lion.setGaze(1,.5);lion.update(.016);lion.render();
    assert.equal(lion.variant,'headset');
    assert.equal(lion.state,'working');
    assert.ok(lion.eyeGazeX>0);
    lion.setReducedMotion(true);lion.render();
    assert.ok(ink.drawCalls>=3);
    lion.stop();
  }finally{globalThis.Image=old;}
});

test('reference rig safely falls back to vector drawing without browser Image',()=>{
  const old=globalThis.Image;
  globalThis.Image=undefined;
  try{
    const ink=fakeContext();
    const canvas={width:0,height:0,style:{},getContext:()=>ink.ctx};
    const lion=new ReferenceLionRig(canvas,{size:80});
    assert.equal(lion.imageReady,false);
    assert.equal(lion.imageFailed,false);
    lion.setState('finished');lion.render();lion.stop();
  }finally{globalThis.Image=old;}
});
