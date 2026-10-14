# Feature truth table — 1.0.0-alpha.1 candidate

This table is the user-facing source of truth. **Implemented** means source exists and Node tests cover relevant logic, not that Windows QA passed. **Windows acceptance pending** means actual OS runtime testing is required. No simulated providers or false "connected" states.

| Capability | Status | Required gate |
|---|---|---|
| Top-edge Island / tray / topmost | Implemented, Windows acceptance pending | Native build, DPI/fullscreen/focus/restart QA |
| Coucou-style spring geometry | Implemented; performance unverified | 60/120Hz frame capture and pointer hit testing |
| Xyeena Guardian (original lion companion) | Implemented via @xyeena/mascot in Island compact/expanded views; Fold compatibility retained | Visual, interaction, and accessibility review |
| Windows media playback + transport | Implemented, acceptance pending | Browser/Spotify supported-session tests |
| Seek, shuffle and repeat | Implemented, player-dependent | Player capability tests; accurate status labels |
| Windows default-output volume/mute | Implemented, acceptance pending | Windows Core Audio device tests |
| Clipboard text-only history | Implemented, opt-in | Opt-out, clear, secret heuristics, restart privacy tests |
| User-opt-in OS notifications | Implemented | Packaged install/OS permission test |
| Xyeena read-only run summaries | Implemented | Real CLI project with snapshots and malformed paths |
| Meeting timer | Implemented manually | Timeout/refresh/restore acceptance |
| Teams call auto-detection | NOT implemented | Authorized Microsoft 365/Graph or supported presence API |
| Global shortcuts | NOT implemented | Accessibility, collisions and AltGr test |
| Agent hooks / approvals / questions | NOT implemented | Authenticated relay, threat model, safe fallback, rollback tests |
| Live agent tool events / diffs | NOT implemented | Size limits, redaction, provider adapters |
| Native AI chat / local models | NOT implemented | BYOK credential storage and per-provider opt-in |
| GitHub/Vercel/other services | NOT implemented | OAuth scopes, credentials, API integration |
| File drop / code diff | NOT implemented | Windows WebView2 drop path + explicit consent |
| Weekly recap / analytics | NOT implemented | Verified aggregate source, local retention controls |
| Desktop-floating mascot / wardrobes | NOT implemented | Owned rig and assets, window safety |
| Autostart / signed updater | NOT implemented | Opt-in autostart, signing keys and rollback |
| Phone pairing / Linux | NOT implemented | Separate architecture and security review |

**Maintainer target: full feature coverage before public alpha. This source candidate does NOT meet that scope.** Calling it "enterprise-grade" or "ready to release" would be misleading until functionality, security and Windows acceptance are verified. Source reference: [Coucou capability audit](COUCOU-CAPABILITY-AUDIT.md).
