# Xyn — The Lion Guardian

**Xyn** is the original golden-lion mascot of Xyeena and the companion presented inside **Xyeena Notch / Island**. Xyn's repository source is in `packages/xyeena-mascot/`, consumed by `apps/xyeena-island/`. This is not a separate desktop executable or npm publication.

## Canonical implementation

- **Renderer:** `packages/xyeena-mascot/src/lion-canvas.js` exports `LivingLionRig`. `XynLionRig` is only a **naming alias** for that same constructor, not a separate implementation.
- **UI host:** `packages/xyeena-mascot/src/guardian.js` supplies the `<xyeena-guardian>` custom element, which creates its single Canvas rig instance.
- **Application:** `apps/xyeena-island/src/main.ts` mounts `<xyeena-guardian>` in the top-screen Island. The Island is the **only** legitimate desktop host. Existing package/import/custom-element names remain backward compatible.
- **Character:** rounded golden layered mane; ivory face; black oval eyes; warm pink inner ears; central shield. Eye gaze leads subtle head motion; body is anchored, not a follower pet.
- **Motion and accessibility:** natural blink/breath/emotes, bounded gaze and reduced-motion behavior already exist in the canonical rig. Visual acceptance, performance and actual physical Windows behavior are **not certified** by source tests.

## Native cursor integration

This PR intentionally does **not** introduce another Canvas renderer or replace Island's existing `LivingLionRig`. Global cursor sampling is independently implemented as a candidate on [PR #5](https://github.com/rzqllh/xyeena-notch/pull/5), based on the Antigravity recovery branch. It uses read-only Win32 `GetCursorPos` via Tauri with coordinate normalization. It is **not on `main`** simply because the code exists in an open PR; do not claim that Xyn already tracks the cursor over other apps in a shipped installer.

Integration order: reconcile PR #5 with the current branch/main **without reviving desktop placement or creating a second mascot**. Route cursor samples to the existing `xyeena-guardian.setGazeFromClient` API, and stop sampling when invisible, dormant, in tray, or destroyed. Do not store cursor coordinates, log samples, create background hooks, or request extra permissions.

## Acceptance before merging native work

1. **Source verification:** `npm ci`, `npm test`, `npm run build`, `npm run release:audit` plus native Rust/Windows CI.
2. **Identity:** visually compare Xyn to the owner-approved original concept at compact and expanded sizes. Unverified visual fidelity is a blocker, not a PASS.
3. **Windows global gaze:** test cursor inside and outside the Island, over third-party apps, across monitors including negative coordinates, DPI 100/125/150%, and with focus remaining in the other app.
4. **Lifecycle and privacy:** stop sampling on tray hide/dormancy/reduced activity; verify no detached Guardian window, Perch/Follow action, network transmission, or cursor logs/history.
5. **UX:** eye/head lag, bounded motion, reduced-motion behavior, screen sleep/wake, 60/120 Hz responsiveness and resource use should be recorded on a physical Windows machine.

PR #4's earlier standalone `IdentityLionRig` was an exploratory **alternate renderer**; its commit history remains available for reference, but the reconciled PR intentionally excludes it to avoid duplicate active rig implementations. The isolated experiment is not a finished or separately shipped Xyn source.

See [Windows smoke tests](SMOKE-TEST-WINDOWS.md) and [release gates](RELEASE_GATES.md). No release/version bump is authorized by this mascot naming/contract PR.
