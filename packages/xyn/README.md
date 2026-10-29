# @xyeena/xyn

Canvas 2D lion rig traced from the *Xyeena Mascot Concept* sheet.

- `src/lion-canvas.js` - the rig (`LivingLionRig`, same public API as before + `setVariant`, `setTimeline`, `squash`, `hop`)
- `demo/index.html` - live concept sheet (serve the package root, e.g. `npx serve .`, then open `/demo/`)
- Variants rendered on canvas: standard, visor, crown, headset, shield (others fall back to standard on canvas, SVG art still defines them)

Motion approach (from Louis-CFM/coucou `design/prototype`, MIT): keyframe tweens for gestures, damped springs for continuous motion, head lags eyes, squash & stretch about the ground point, parallax layers for head turn, small particle system. No Mochi artwork is used.

`npm test` → 14 tests.
