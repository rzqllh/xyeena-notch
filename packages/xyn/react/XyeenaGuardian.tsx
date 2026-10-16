'use client';

import { createElement, useEffect, useRef, type CSSProperties } from 'react';
import type { XyeenaGuardian as GuardianElement, XyeenaState, XyeenaVariant } from '../src/index.js';

export interface XyeenaGuardianProps {
  state?: XyeenaState;
  variant?: XyeenaVariant;
  size?: number;
  animated?: boolean;
  interactive?: boolean;
  className?: string;
  style?: CSSProperties;
  onStateChange?: (state: XyeenaState) => void;
  onReady?: (mascot: GuardianElement) => void;
}

/** React bridge for Next.js; the core remains dependency-free and Tauri-friendly. */
export function XyeenaGuardian({
  state='idle',variant='standard',size=260,animated=true,interactive=false,
  className,style,onStateChange,onReady
}:XyeenaGuardianProps) {
  const el=useRef<GuardianElement|null>(null);
  const ready=useRef(false);
  useEffect(()=>{
    let mounted=true;
    // Side effect only on the client. Import is guarded to avoid SSR touching HTMLElement.
    import('../src/guardian.js').then(({defineXyeenaGuardian})=>{
      if(!mounted)return;
      defineXyeenaGuardian();ready.current=true;
      const node=el.current;
      if(node){node.setState(state);node.setVariant(variant);node.setSize(size);node.animated=animated;onReady?.(node);}
    });
    return ()=>{mounted=false;ready.current=false;};
  // The element lifecycle is intentionally installed once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  useEffect(()=>{if(ready.current&&el.current)el.current.setState(state);},[state]);
  useEffect(()=>{if(ready.current&&el.current)el.current.setVariant(variant);},[variant]);
  useEffect(()=>{if(ready.current&&el.current)el.current.setSize(size);},[size]);
  useEffect(()=>{if(ready.current&&el.current)el.current.animated=animated;},[animated]);
  useEffect(()=>{
    const node=el.current;if(!node||!onStateChange)return;
    const handler=(event:Event)=>onStateChange((event as CustomEvent<{to:XyeenaState}>).detail.to);
    node.addEventListener('xyeena-state-change',handler);
    return ()=>node.removeEventListener('xyeena-state-change',handler);
  },[onStateChange]);
  return createElement('xyeena-guardian',{
    ref:el,
    state,variant,size,animated:String(animated),
    ...(interactive?{interactive:''}:{}),className,style
  });
}
