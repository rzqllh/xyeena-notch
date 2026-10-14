# Notch-first Lion identity — integration contract

This PR adds a standalone Canvas 2D identity renderer and native-cursor normalization. It does **not** update the installed Windows application.

Visual source of truth: the user's original golden Lion Guardian concept sheet; do not upload/repackage the concept image into the public repository without permission. The first rig is a fidelity study, not final artwork. No Coucou/Mochi character assets used.

- **Default:** Lion remains inside the top-screen Island. No desktop placement, follower pet, or additional window.
- **Motion:** eyes follow desktop cursor, head turns slightly later, body stays anchored; bounded gaze, sleep/reduced-motion support.
- **Privacy:** native cursor poller is owned by Tauri host, runs only while the Lion is visible/consented, no pointer history, no clipboard, no network.
- **Native integration not included here:** the local Antigravity branch must provide Win32 GetCursorPos and the Island window origin/DPI. Input samples must be fresh and passed to gazeFromNative, then into IdentityLionRig.setGaze; pointer capture limited to the Island will not satisfy acceptance.
- **No fake features:** demo layout, provider chat, agent sessions, clipboard repair and media changes are not part of this isolated engine PR.
- Preserve original Xyeena Agentic and weekly-recap code. Do not merge until updated Windows host is reconciled and physically tested.
