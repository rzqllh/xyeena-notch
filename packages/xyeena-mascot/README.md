# Xyeena Guardian Mascot · 2.5D Reference Rig

A dependency-free Custom Element and optional React bridge for Xyeena Notch.
This version builds on the original project in `xyeena-mascot.zip`.

## Run the playground

```sh
cd xyeena-mascot
python -m http.server 4173  # Windows: py -m http.server 4173
# Open http://localhost:4173/demo/
```

No npm install or build step is required for the browser playground. Run `npm test` with Node 22+ to exercise the engine.

## Use in Tauri / vanilla TypeScript

```js
import { defineXyeenaGuardian } from './src/index.js';
defineXyeenaGuardian();

const lion = document.createElement('xyeena-guardian');
lion.setAttribute('interactive', '');
lion.setSize(180);
document.body.append(lion);
lion.setState('working');
// Real agent event when task completes:
lion.setState('finished');
```

Use the existing React bridge via `react/XyeenaGuardian.tsx` for Next.js.

## State & motion

- **Visual identity:** cropped and manually cleaned illustration from the **user-supplied reference image**, stored in `assets/lion-reference.png`. Eyes were removed from the static texture and drawn as live Canvas elements.
- **Rendering:** `ReferenceLionRig` is selected by default in the existing `<xyeena-guardian>` API. Legacy vector `LivingLionRig` remains as image-unavailable fallback.
- **States:** existing 20 supported states; `idle`, `working`, `thinking`, `question`, `finished`, and others use separate expressions / badges. Accessories are overlays: original texture remains recognizable.
- **Motion:** independent pupil motion and damped head lag; body breathing, hover response, blink, status particles, and greeting / upload helper timelines. The animation loop respects reduced-motion and pauses when the document is hidden.
- **Events:** `GuardianController`, `stateForEvent`, and `connectAgentEvents` are unchanged. Only real provider events should represent real jobs; playground controls are simulations.
- **API:** `setState`, `setVariant`, `setSize`, `greet`, `beginUpload`, `setUploadProgress`, `setGaze`, `setGazeFromClient`.

### Important visual boundary

The provided reference is a **single flattened 2D raster artwork**. This implementation can reproduce its original front-facing look and animate eyes / head / body / accessories, but cannot provide truly independent jaw, ears, paws, side/rear views or arbitrary 3D rotation without a separately authored layered illustration or 3D model. The included overlay accessories are approximations rather than extracted 3D objects. A production-quality full 3D rig would require source layer assets or new modeling work.

## References and rights

Coucou's public motion studies were used as inspiration for the idea of deterministic greeting/upload phase timing:

- https://github.com/Louis-CFM/coucou/tree/main/design
- https://github.com/Louis-CFM/coucou/blob/main/design/animations/greeting-v2.html
- https://github.com/Louis-CFM/coucou/blob/main/design/animations/upload-sequence.html

Coucou's software is MIT licensed; its **Mochi character, art, sounds and design files are not** and have not been included in this package. This package contains Xyeena source code plus artwork extracted from the image provided by its owner. Keep the existing source LICENSE.
