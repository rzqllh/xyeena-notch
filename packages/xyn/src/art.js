import { superellipse } from './geometry.js';

const star=(x,y,s=1)=>`<path d="M${x} ${y-9*s} Q${x+2*s} ${y-2*s} ${x+9*s} ${y} Q${x+2*s} ${y+2*s} ${x} ${y+9*s} Q${x-2*s} ${y+2*s} ${x-9*s} ${y} Q${x-2*s} ${y-2*s} ${x} ${y-9*s}" />`;
const accessories={
  standard:'',
  shield:`<g class="accessory-shield"><path d="M259 159 L292 173 L290 205 Q280 226 258 236 Q237 223 228 205 L228 173 Z" fill="url(#BID-ward)" stroke="#dce8ff" stroke-width="3"/><path d="M258 171 L281 181 L280 202 Q273 216 258 225 Q243 215 239 202 L239 181 Z" fill="none" stroke="#ffffff" stroke-opacity=".5" stroke-width="2"/>${star(258,193,.65)}</g>`,
  visor:`<g><rect x="118" y="134" width="124" height="53" rx="25" fill="#121e31" stroke="#5da8ff" stroke-width="3.5"/><path d="M128 144 Q179 129 231 145" stroke="#b4e8ff" opacity=".4" fill="none" stroke-width="4"/><ellipse cx="152" cy="163" rx="10" ry="7" fill="#6ad3ff"/><ellipse cx="209" cy="163" rx="10" ry="7" fill="#6ad3ff"/></g>`,
  crown:`<g><path d="M131 56 L136 24 L157 41 L181 15 L204 41 L228 23 L231 56 Z" fill="url(#BID-gold)" stroke="#fff0ba" stroke-width="2"/><rect x="131" y="52" width="100" height="12" rx="5" fill="#d79448"/><path d="M180 27 L190 42 L180 55 L170 42 Z" fill="#899fff" stroke="#e9f1ff" stroke-width="1.5"/></g>`,
  headset:`<g><path d="M88 168 C76 77 126 49 181 49 C246 49 282 92 271 170" fill="none" stroke="#203c73" stroke-width="11"/><path d="M93 164 C86 91 130 57 181 57 C243 57 269 102 266 167" fill="none" stroke="#5aaaff" stroke-width="4"/><rect x="78" y="138" width="22" height="58" rx="10" fill="#192641" stroke="#79bbff" stroke-width="4"/><rect x="263" y="138" width="22" height="58" rx="10" fill="#192641" stroke="#79bbff" stroke-width="4"/></g>`,
  beanie:`<g><path d="M107 101 C117 41 155 28 184 28 C231 28 251 56 251 106 Z" fill="#4c90e4" stroke="#a2d0ff" stroke-width="3"/><path d="M109 99 Q180 79 250 99 L251 119 Q184 110 106 120 Z" fill="#3472d1" stroke="#a2d0ff" stroke-width="3"/><circle cx="183" cy="25" r="15" fill="#f6f9ff"/><path d="M138 68 Q183 44 223 69" stroke="#91c5ff" stroke-width="3" fill="none"/></g>`,
  santa:`<g><path d="M100 106 C106 49 137 26 173 35 Q204 33 241 70 L259 80 Q278 84 280 103 Q262 121 248 108 Q172 87 101 116 Z" fill="#df4960" stroke="#ffadb0" stroke-width="2"/><path d="M100 110 Q178 89 251 107" stroke="#f4f5f8" stroke-width="19" stroke-linecap="round" fill="none"/><circle cx="272" cy="107" r="17" fill="#ffffff"/></g>`,
  witch:`<g><path d="M157 18 Q181 25 219 96 L132 97 Q146 44 157 18 Z" fill="#5834a5" stroke="#a882ff" stroke-width="2"/><ellipse cx="181" cy="100" rx="113" ry="16" fill="#6340be" stroke="#ae86ff" stroke-width="2"/><path d="M145 82 L212 82 L222 98 L132 98 Z" fill="#f2a35a"/><rect x="174" y="81" width="17" height="17" rx="3" fill="#dce1f9"/></g>`,
  glasses:`<g fill="none" stroke="#bd8b52" stroke-width="4"><circle cx="147" cy="163" r="19"/><circle cx="213" cy="163" r="19"/><path d="M166 161 Q180 153 194 161 M126 158 L111 152 M233 158 L248 152"/></g>`,
  sunglasses:`<g><rect x="123" y="146" width="46" height="33" rx="13" fill="#171c2c" stroke="#777f92" stroke-width="3"/><rect x="193" y="146" width="46" height="33" rx="13" fill="#171c2c" stroke="#777f92" stroke-width="3"/><path d="M169 155 Q181 151 193 155" stroke="#8f98b7" fill="none" stroke-width="4"/></g>`,
  scarf:`<g><path d="M119 218 Q179 236 244 215 L239 243 Q181 267 119 239 Z" fill="#bf354f" stroke="#f8a9b2" stroke-width="2"/><path d="M231 227 L255 249 L247 283 L225 269 Z" fill="#df4b64" stroke="#ffc9b8" stroke-width="2"/><path d="M240 244 L259 253 M228 259 L251 270" stroke="#ffe6dc" stroke-width="4"/></g>`,
  bow:`<g transform="translate(234 94)"><ellipse cx="-15" cy="-5" rx="16" ry="13" fill="#ff9cc4"/><ellipse cx="14" cy="-5" rx="16" ry="13" fill="#ff9cc4"/><circle cx="0" cy="-5" r="8" fill="#e85c97"/></g>`
};
const eyes={
  dot:`<ellipse cx="151" cy="163" rx="8" ry="10.8"/><ellipse cx="208" cy="163" rx="8" ry="10.8"/>`,
  look:`<ellipse cx="155" cy="159" rx="8" ry="10.8"/><ellipse cx="212" cy="159" rx="8" ry="10.8"/>`,
  wide:`<ellipse cx="151" cy="162" rx="8.7" ry="12"/><ellipse cx="208" cy="162" rx="8.7" ry="12"/>`,
  happy:`<path d="M139 164 Q151 146 163 164 M196 164 Q208 146 220 164" fill="none" stroke="#18151c" stroke-width="7" stroke-linecap="round"/>`,
  flat:`<path d="M143 164 H160 M200 164 H217" fill="none" stroke="#18151c" stroke-width="7" stroke-linecap="round"/>`,
  tired:`<path d="M141 162 Q152 166 162 162 M198 162 Q209 166 219 162" fill="none" stroke="#18151c" stroke-width="7" stroke-linecap="round"/>`,
  sleep:`<path d="M141 159 Q151 175 161 159 M199 159 Q209 175 219 159" fill="none" stroke="#18151c" stroke-width="5" stroke-linecap="round"/>`,
  focused:`<path d="M146 156 L155 166 L164 156 M199 156 L208 166 L217 156" stroke="#18151c" stroke-width="5" fill="none" stroke-linejoin="round"/>`,
  wink:`<path d="M142 163 Q151 148 162 163" stroke="#18151c" stroke-width="7" stroke-linecap="round" fill="none"/><ellipse cx="208" cy="163" rx="8" ry="11"/>`,
  heart:`<path d="M151 169 C135 159 139 150 148 153 Q153 154 151 158 Q158 150 163 156 Q167 162 151 169 Z M209 169 C193 159 197 150 206 153 Q211 154 209 158 Q216 150 221 156 Q225 162 209 169 Z" fill="#ea4d88"/>`,
  spiral:`<path d="M152 160 C160 159 161 169 152 171 C138 175 134 157 145 150 C160 138 177 160 161 177 M210 160 C218 159 219 169 210 171 C196 175 192 157 203 150 C218 138 235 160 219 177" fill="none" stroke="#18151c" stroke-width="4" stroke-linecap="round"/>`
};
const badges={
  none:'',
  dots:`<rect x="0" y="0" width="55" height="30" rx="15" fill="var(--accent)" stroke="#172034" stroke-width="4"/><g fill="#fff"><circle cx="17" cy="15" r="3.5"/><circle cx="28" cy="15" r="3.5"/><circle cx="39" cy="15" r="3.5"/></g>`,
  question:`<circle cx="16" cy="16" r="17" fill="var(--accent)" stroke="#172034" stroke-width="4"/><text x="16" y="24" fill="#fff" font-size="23" font-weight="800" text-anchor="middle">?</text>`,
  alert:`<circle cx="16" cy="16" r="17" fill="var(--accent)" stroke="#172034" stroke-width="4"/><path d="M16 8 V18" stroke="#fff" stroke-width="4" stroke-linecap="round"/><circle cx="16" cy="24" r="2.4" fill="#fff"/>`,
  spark:`<g fill="var(--accent)">${star(10,13,.8)}${star(35,0,.55)}</g>`,
  search:`<circle cx="16" cy="13" r="10" fill="none" stroke="var(--accent)" stroke-width="5"/><path d="M23 21 L32 30" stroke="var(--accent)" stroke-width="5" stroke-linecap="round"/>`,
  heart:`<path d="M17 30 C-5 15 8 -2 17 10 C26 -2 40 15 17 30 Z" fill="var(--accent)"/>`,
  clock:`<circle cx="16" cy="16" r="16" fill="var(--accent)"/><path d="M16 6 V16 L23 20" fill="none" stroke="#fff" stroke-width="3"/>`,
  upload:`<path d="M16 4 L27 15 H20 V28 H12 V15 H5 Z" fill="var(--accent)"/>`
};
export const eyeMarkup=(style)=>eyes[style]??eyes.dot;
export const badgeMarkup=(kind)=>badges[kind]??'';
export const accessoryMarkup=(name,id)=> (accessories[name]??'').replaceAll('BID',id);
export function mascotArt(id){
  const shell=superellipse(180,176,133,112,2.7,80);
  const face=superellipse(180,164,105,83,2.8,80);
  return `<svg viewBox="0 0 360 320" class="guardian-svg" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="${id}-title"><title id="${id}-title">Xyeena guardian lion mascot</title>
  <defs>
    <radialGradient id="${id}-gold" cx="36%" cy="12%" r="98%"><stop stop-color="#ffeac1"/><stop offset=".36" stop-color="#f9c779"/><stop offset=".75" stop-color="#ecaa58"/><stop offset="1" stop-color="#c67b3c"/></radialGradient>
    <linearGradient id="${id}-mane" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ffe5ad"/><stop offset=".49" stop-color="#ffc879"/><stop offset="1" stop-color="#dc9352"/></linearGradient>
    <radialGradient id="${id}-face" cx="35%" cy="20%" r="90%"><stop stop-color="#fff"/><stop offset=".6" stop-color="#fff9f1"/><stop offset="1" stop-color="#dfdfec"/></radialGradient>
    <linearGradient id="${id}-ward" x1="0" y1="0" x2=".9" y2="1"><stop stop-color="#eef8ff" stop-opacity=".85"/><stop offset="1" stop-color="#659ef6" stop-opacity=".75"/></linearGradient>
    <linearGradient id="${id}-shield" x1=".2" y1="0" x2=".9" y2="1"><stop stop-color="#fffdf3"/><stop offset=".6" stop-color="#e3efff"/><stop offset="1" stop-color="#879ae6"/></linearGradient>
    <radialGradient id="${id}-glow"><stop stop-color="var(--accent)" stop-opacity=".36"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></radialGradient>
    <filter id="${id}-blur"><feGaussianBlur stdDeviation="9"/></filter>
  </defs>
  <ellipse cx="180" cy="269" rx="120" ry="29" fill="url(#${id}-glow)" filter="url(#${id}-blur)" opacity=".8"/>
  <ellipse cx="180" cy="284" rx="78" ry="10" fill="#111522" opacity=".25" />
  <g class="greet-ring" fill="none" stroke="var(--accent)" stroke-width="2"><ellipse cx="180" cy="166" rx="130" ry="94"/></g>
  <g class="intro-rig"><g class="float-rig"><g class="gaze-rig">
    <g class="ears"><circle cx="91" cy="87" r="27" fill="#edaa61"/><circle cx="269" cy="87" r="27" fill="#edaa61"/><circle cx="91" cy="87" r="17" fill="#f6d5c1"/><circle cx="269" cy="87" r="17" fill="#f6d5c1"/></g>
    <path d="${shell}" fill="url(#${id}-gold)" stroke="#ffd4a1" stroke-width="2"/>
    <path d="M96 101 C80 149 86 200 119 237 Q81 224 62 190 Q49 141 91 108 Z" fill="#d99250" opacity=".43"/>
    <path d="M264 101 C281 149 275 200 241 237 Q285 226 299 190 Q315 147 264 101 Z" fill="#e7a45e" opacity=".62"/>
    <path d="M96 108 C120 67 154 50 181 43 C205 53 243 72 265 109 L244 119 Q213 89 180 81 Q147 89 116 120 Z" fill="url(#${id}-mane)" stroke="#ffe2b1" stroke-width="1.5"/>
    <path d="M159 59 L180 28 L202 58 L181 91 Z" fill="url(#${id}-gold)"/>
    <path d="M107 199 Q92 226 124 246 L143 248" stroke="#ffc976" stroke-width="10" stroke-linecap="round" opacity=".55" fill="none"/>
    <path d="M254 199 Q266 224 239 245 L216 248" stroke="#ffc976" stroke-width="10" stroke-linecap="round" opacity=".55" fill="none"/>
    <path d="${face}" fill="url(#${id}-face)" />
    <ellipse cx="122" cy="182" rx="16" ry="8" fill="#f2a8ae" opacity=".2"/><ellipse cx="239" cy="182" rx="16" ry="8" fill="#f2a8ae" opacity=".2"/>
    <g class="eye-pair" fill="#18151c" data-eyes>${eyes.dot}</g>
    <g class="upload-gateway"><ellipse cx="180" cy="138" rx="70" ry="10" fill="#111a2b" stroke="var(--accent)" stroke-width="4"/><path d="M180 72 L202 100 L180 126 L158 100 Z" fill="url(#${id}-shield)" opacity=".7"/></g>
    <g class="right-paw"><ellipse cx="274" cy="230" rx="18" ry="17" fill="#fff6e6" stroke="#f3c682" stroke-width="3" /></g>
    <ellipse cx="87" cy="232" rx="19" ry="17" fill="#fff6e6" stroke="#f3c682" stroke-width="3"/>
    <g class="main-shield"><path d="M180 213 L207 226 L204 254 Q195 272 180 279 Q165 273 155 254 L153 226 Z" fill="url(#${id}-shield)" stroke="#fff1ca" stroke-width="3"/><path d="M180 221 L199 231 L196 252 Q190 265 180 270 Q170 266 164 252 L162 231 Z" stroke="#bd9b69" stroke-width="2" fill="none"/><path d="M180 231 L180 259" stroke="#e2c99a" stroke-width="2"/></g>
    <g class="accessory" data-accessory></g>
    <g class="guardian-badge" data-badge></g>
    <g class="celebration" fill="#f8ce80">${star(73,86,.65)}${star(288,64,.95)}${star(312,121,.55)}</g>
  </g></g></g>
  <g class="upload-document" transform="translate(165 8)"><path d="M0 0 H24 L32 9 V41 H0 Z" fill="#ecf7ff" stroke="var(--accent)" stroke-width="2"/><path d="M24 0 V9 H32" fill="none" stroke="#7ca7f8" stroke-width="2"/><path d="M7 18 H25 M7 26 H22" stroke="#7092c0" stroke-width="2" stroke-linecap="round"/></g>
  </svg>`;
}
