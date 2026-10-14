export const guardianStyles = `
:host{--accent:#7c9fff;display:inline-block;contain:layout style;position:relative;width:var(--mascot-size,260px);height:auto;aspect-ratio:360/320;vertical-align:middle;isolation:isolate;color-scheme:light dark}
*,*::before,*::after{box-sizing:border-box}
.guardian-svg{width:100%;height:100%;display:block;overflow:visible}
.float-rig{transform-origin:180px 172px;animation:xyeena-float 3.5s ease-in-out infinite;will-change:transform}
.gaze-rig{transform:translate(var(--look-x,0px),var(--look-y,0px));transition:transform .24s ease-out}
.intro-rig{transform-origin:180px 172px;transform:translateY(calc((1 - var(--intro-rise,1))*45px)) rotate(var(--intro-tilt,0rad));opacity:var(--intro-rise,1)}
.greet-ring{opacity:0;transform-box:fill-box;transform-origin:center;transform:scale(.5);pointer-events:none}
.right-paw{transform-origin:262px 225px;transform:rotate(calc(var(--paw,0)*-36deg)) translateY(calc(var(--paw,0)*-12px));}
.guardian-badge{transform:translate(84px,82px);transition:opacity .18s,transform .3s cubic-bezier(.19,.85,.21,1.35);transform-box:fill-box;opacity:1}
.guardian-badge:empty{opacity:0}
.eye-pair{transform-origin:180px 163px;animation:xyeena-blink 8.2s ease-in-out infinite}
.accessory{transition:opacity .16s}
.main-shield{transform-origin:180px 244px;transition:filter .36s}
.celebration{opacity:0;transition:opacity .25s}
.upload-gateway,.upload-document{opacity:0;pointer-events:none}
.upload-gateway{transform-origin:180px 138px;transform:scaleY(.2);transition:transform .3s,opacity .3s}
.upload-document{transform-origin:180px 26px;transform:translateY(-45px) scale(1);transition:transform .5s cubic-bezier(.22,.9,.28,1),opacity .22s}
:host([state="working"]) .float-rig,:host([state="thinking"]) .float-rig,:host([state="searching"]) .float-rig{animation-duration:2.2s}
:host([state="thinking"]) .gaze-rig{animation:xyeena-ponder 2.8s ease-in-out infinite}
:host([state="question"]) .float-rig{animation:xyeena-tilt 3s ease-in-out infinite}
:host([state="error"]) .float-rig,:host([state="annoyed"]) .float-rig{animation:xyeena-shudder .34s ease-in-out 2}
:host([state="sleeping"]) .float-rig,:host([state="yawn"]) .float-rig{animation:xyeena-breathe 4s ease-in-out infinite}
:host([state="dancing"]) .float-rig{animation:xyeena-dance 1.1s ease-in-out infinite}
:host([state="finished"]) .celebration,:host([state="proud"]) .celebration,:host([state="greeting"]) .celebration{opacity:1}
:host([state="finished"]) .main-shield,:host([state="approval"]) .main-shield{filter:drop-shadow(0 0 10px var(--accent))}
:host([state="dizzy"]) .gaze-rig{animation:xyeena-tilt 1.5s ease-in-out infinite}
:host([data-greeting="true"]) .float-rig,:host([data-uploading="true"]) .float-rig{animation:none}
:host([data-greeting="true"]) .greet-ring{opacity:calc(1 - var(--ring,0));transform:scale(calc(.65 + var(--ring,0)*1.6));}
:host([data-greeting="true"]) .main-shield{filter:drop-shadow(0 0 calc(var(--crest,0)*15px) var(--accent))}
:host([data-uploading="true"]) .upload-gateway{opacity:1;transform:scaleY(calc(.3 + var(--gateway,0)*.8))}
:host([data-uploading="true"]) .upload-document{opacity:var(--document,1);transform:translateY(calc((1 - var(--document,1))*115px - 22px)) scale(calc(.4 + var(--document,1)*.6))}
:host([data-uploading="true"]) .main-shield{filter:drop-shadow(0 0 calc(4px + var(--charge,0)*20px) var(--accent))}
:host([state="upload"]) .guardian-badge{opacity:.7}
@keyframes xyeena-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
@keyframes xyeena-blink{0%,20%,20.8%,62%,62.8%,100%{transform:scaleY(1)}20.4%,62.4%{transform:scaleY(.1)}}
@keyframes xyeena-ponder{0%,100%{transform:translateX(0)}50%{transform:translateX(2.5px)}}
@keyframes xyeena-tilt{0%,100%{transform:rotate(-2deg)}50%{transform:rotate(3deg)}}
@keyframes xyeena-shudder{0%,100%{transform:translateX(0)}25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}
@keyframes xyeena-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.015,.985)}}
@keyframes xyeena-dance{0%,100%{transform:rotate(-5deg) translateY(0)}50%{transform:rotate(5deg) translateY(-12px)}}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}.float-rig,.gaze-rig,.intro-rig{transform:none!important}.greet-ring,.upload-document{display:none!important}}
`;
