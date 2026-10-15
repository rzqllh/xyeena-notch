# Third-party notices — Xyeena Island 1.0 alpha source candidate

This desktop MVP contains original Xyeena app source and its original icon. **Only explicitly attributed MIT motion mathematics from Coucou is adapted; no Mochi/Coucou protected brand, artwork, characters, sounds, or other restricted media are included.**

Tauri 2, Vite, TypeScript and their resolved dependencies are third-party components installed by the user's package managers. Their respective licenses remain applicable to any future redistributed binary. Before an installer/release is bundled, gather notices for the **actual locked dependency tree** and retain notices in the distribution.

## Reference only: Coucou

Upstream: https://github.com/Louis-CFM/coucou
Reviewed commit: `71b773f08101237e1ec950efdaee17a626c830e6`
Upstream code license: MIT, copyright © 2026 Louis Raillé.
Additional restricted brand and asset conditions: `LICENSE-ASSETS.md` in Coucou's upstream repository.

The mathematical motion module is adapted as documented below, with copyright and license retained. No Coucou/Mochi restricted assets are used.

## Coucou motion mathematics — adapted under MIT (Island 0.3.0)

- Original file: `windows/src/core/anim.ts` at upstream commit `71b773f08101237e1ec950efdaee17a626c830e6`.
- Original copyright: Copyright (c) 2026 Louis Raillé. MIT License.
- Adapted code: `src/core/motion.mjs` (cubic Bézier, numerical damped-spring integration and tracked interpolation).
- The upstream copyright and MIT license conditions are retained via this notice and the original license text in `licenses/COUCOU-CODE-MIT.txt`.
- The Island UI, visuals, logo, text, sounds, and window application code are not copied from Coucou; no Coucou/Mochi restricted assets are included.
- This is not an endorsement or an official Coucou derivative/release.

## Xyeena Guardian and Fold character provenance

The original `Xyeena Guardian` lion mascot custom element (`packages/xyeena-mascot/src/guardian.js`) and `Xyeena Fold` vector definitions are original Xyeena source; no third-party character assets or Coucou/Mochi restricted artwork, audio, or animations are included. The *geometry/window* motion engine continues to use properly attributed MIT mathematics from Coucou as described above.

Free asset research in `docs/MASCOT-ASSET-RESEARCH.md` lists Kenney and Rive references. These are **not** bundled or licensed as part of the Xyeena executable merely by linking to them.

## Additional desktop dependencies

- Tauri official Clipboard Manager plugin (`@tauri-apps/plugin-clipboard-manager` / `tauri-plugin-clipboard-manager`): MIT or Apache-2.0, as published by the Tauri Programme. Only text read/write are exposed in the desktop capability manifest; all other clipboard functions remain denied.
- Microsoft Windows GSMTC and Core Audio APIs are used via Rust `windows` crate. Master volume changes affect the default system output; media player repeat/shuffle/seek may be unsupported by specific apps. No Coucou code is copied for either integration.
- Before redistribution, collect actual dependency licenses and include the final locked BOM. This is **source** distribution and does not represent a signed Windows binary.
