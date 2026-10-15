# Xyn — The Lion Guardian

**Xyn is the new name for the Golden Lion / Xyeena Guardian already implemented in Xyeena Notch.** It is a **rebrand of the same character**, not a newly designed mascot, alternative rendering engine, standalone app or second package.

## Identity and existing source

- **Character:** the existing warm golden Lion with ivory face, black oval eyes, pink inner ears, layered mane and central shield. Its artwork, body and behavior remain the same; only its human-facing name changes to **Xyn**.
- **Canonical renderer:** `packages/xyeena-mascot/src/lion-canvas.js` exports the existing `LivingLionRig`. There is **no `XynLionRig` class or alias** and no second Canvas renderer.
- **Custom element:** `packages/xyeena-mascot/src/guardian.js` defines the existing `<xyeena-guardian>`; accessible copy identifies the same character as Xyn.
- **Package:** `@xyeena/mascot` remains private, with the same exports, types, variants, states and event names. `XyeenaGuardian`, `GuardianController`, `LivingLionRig` and `defineXyeenaGuardian` remain stable API names.
- **Application host:** `apps/xyeena-island/` remains the only authoritative native host. The Island already mounts the existing `<xyeena-guardian>` in compact/expanded presentations.

A rename must not reset user preferences, create any new background service, duplicate animation loops, change the Lion silhouette, or introduce an additional window. **Xyn belongs inside the top-screen Island**, never as a detached desktop pet or Perch/Follow mode.

## Global cursor integration is separate

The present `main` branch contains the original on-Island Lion renderer, but an installed Windows-wide cursor-gaze experience is **not accepted**. [PR #5](https://github.com/rzqllh/xyeena-notch/pull/5) contains candidate Win32 `GetCursorPos` integration on the separate Antigravity-recovery line, not a verified feature merged to main.

Preserve the existing `xyeena-guardian.setGazeFromClient` and `LivingLionRig` implementations. Integrate global cursor samples through that interface **only once**, and stop sampling on dormancy/tray hide/dispose. Do not log/store pointer history or collect without a relevant visible Lion. Test DPI scaling, negative-coordinate monitors and focus safety physically on Windows.

**Parallel work:** Antigravity's locally reported `feat/production-recovery-and-ux` commit is not a validated remote input to this PR. Its AI, clipboard, file-drop, layout and provider features are distinct work; do not cherry-pick, overwrite or certify them as part of mascot naming.

## Release and acceptance

Brand-only approval requires one unchanged renderer and the existing package/custom-element contract, passing source/CI tests, plus a visual check that Xyn is the same approved Lion. Native Windows cursor and application-wide functionality retain their separate gates: installed-app testing, mixed DPI/multi-monitor gaze, startup/tray lifecycle, reduced motion, no desktop pet, and accurate feature truth tables.

An older PR #4 experiment introduced an independent `IdentityLionRig` as a study. It remains in historical commits only, and is **not part of the reconciled PR's file tree**. Do not revive it.

See [Windows smoke tests](SMOKE-TEST-WINDOWS.md) and [release gates](RELEASE_GATES.md). This rename must not alter Notch's `1.0.0-alpha.1` version or create a release.
