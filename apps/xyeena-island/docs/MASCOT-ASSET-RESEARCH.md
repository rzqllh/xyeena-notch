# Original Xyeena mascot and free-source research

Reviewed 13 October 2026. Sources below are inspiration or possible licensed ingredients, **not bundled in this repository**. See `THIRD_PARTY_NOTICES.md` for the code actually reused. Keep a distinct final mascot and visually separate the Xyeena brand from any upstream assets.

## Shortlist

| Source | Style / strengths | Source license | Direct use decision |
| --- | --- | --- | --- |
| [Kenney Shape Characters](https://kenney.nl/assets/shape-characters) | 2D geometric faces and hands; flexible modular combinations | CC0 1.0 (per asset page) | Safest free ingredient; **not automatically animated**; adapt to original rig only if selected |
| [Kenney Mini Characters](https://kenney.nl/assets/mini-characters) | 3D animated miniature humanoids | CC0 1.0 | Free, but mismatched to Xyeena's unobtrusive desktop format |
| [Rive AI Orb Mascot](https://rive.app/community/files/28088-53050-ai-orb-mascot/) | Reactive orb with multiple states, animation state machine | CC BY (page label) | Study design principles; don't adopt art as exclusive Xyeena identity |
| [Rive Responsive Mascots](https://rive.app/community/files/24673-46114-responsive-mascots/) | Facial rig, responsiveness, skins | CC BY (page label) | Study rig/interaction; no asset bundled |
| [Rive Mascot by animatedom](https://rive.app/community/files/11319-21638-mascot/) | Bone-driven animated character | CC BY (page label) | Technical rig reference; distinct final character required |
| [LottieFiles free animations](https://lottiefiles.com/page/license) | Wide selection of animated illustrations | Lottie Simple License; restrictions | Not preferred for core Xyeena identity; terms are not equivalent to CC0/MIT |

Official [Kenney FAQ](https://kenney.nl/support) confirms free commercial use and optional attribution for its CC0 asset-page releases. Official [Rive runtime docs](https://github.com/rive-app/help-center/blob/master/runtimes/overview.md) confirm MIT for runtimes; **every Rive animation has its own license**. Free LottieFiles downloads have different distribution/derivative conditions and the site also has separate creator plan terms. Review exact asset license before packaging.

## Xyeena Fold — original v0.5 experimental companion

- Current implementation: `src/core/mascot.mjs` (original SVG path + state mapping) and compositor CSS animations in `src/style.css`.
- No downloaded mascot assets or character animations from Coucou, Kenney, Rive or Lottie are included.
- Faceted folded silhouette, asymmetrical geometry and small typographic footprint. It is **not** a round white creature, has no costumes, and avoids copying upstream facial expressions/gesture sequences.
- States derive only from known inputs: `idle`, `playing` (Windows media session), `listening` (explicit meeting timer), `working` (selected Xyeena run snapshot), `attention` (DEBUG run). The character does not pretend to detect microphones, meetings or background agents.
- Transforms/opacity are CSS compositor-friendly; hidden state prevents DOM visibility. `prefers-reduced-motion` and the local reduced-motion setting disable animation.
- Original face/art may be iterated independently; final artwork should be reviewed at 24 px, 48 px and ~96 px before committing to a brand mascot.

## Future path for premium-fluid motion without copying anyone

Create original shape/body/facial rigs in Rive; define state machine inputs `mode`, `working`, `attention`, `playback`, `idle`, `pointerX`, `pointerY`. Use the MIT-licensed Rive web runtime and explicit state changes; do not copy Rive Community mascots directly. Keep WebView2 idle frame budget low and stop animations when hidden/suspended. Build a measurable 60/120 Hz Windows acceptance test (P50/P95 frame intervals and dropped frame counts), not just spring unit tests.

## Credits rule

On-screen About/Credits and packaged `THIRD_PARTY_NOTICES.md` must explain attribution for any reused MIT/CC BY code or art. CC0 credit can still be included voluntarily. Don't claim an externally sourced mascot or animation is wholly original.
