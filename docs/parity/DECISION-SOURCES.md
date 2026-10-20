# Decision Sources Matrix — Phase 0

Complies with Master Contract §5 and Phase 0 supplementary proofs:
Distinguishes explicit owner decisions, default proposals, historical evidence, and open items awaiting approval.

| ID | Decision / Item | Classification | Source & Provenance | Operational Boundary |
|---|---|---|---|---|
| **D1** | Rebuild entire island UI with modular primitives | **Explicit Owner Decision** | User prompt & Master Contract §5 D1 | Replace monolithic `main.ts` string templates with typed primitives in Phases 2–3. |
| **D2** | Canonical `@xyeena/xyn` golden lion untouched | **Explicit Owner Decision** | User prompt & Master Contract §4 N1, §5 D2 | Absolute zero edit policy for `packages/xyn/**`. |
| **D3** | Standalone Settings secondary popup window | **PROPOSED / APPROVAL PENDING** | Master Contract §5 D3, Revision Notes | Default to modular single-window Settings in main notch. Secondary popup blocked pending explicit owner approval. |
| **D4** | API key persistence in Windows Credential Manager | **Default Proposed by Pack** | Master Contract §5 D4 | Default implementation in Rust (`secrets.rs` / Credential Manager); opt-in "Remember"; keys never returned to JS. |
| **D5** | Coucou Windows 0.5.0 parity tier structure (A, B, C) | **Default Proposed by Pack** | Master Contract §5 D5 | Tier A = desktop companion core; Tier B = adaptations; Tier C = excluded/skipped. |
| **D6** | Tier C exclusions (WhatsApp, crypto, macOS APIs) | **Owner Constraint Reconciliation** | Master Contract §5 D6 | Avoid scope bloat; preserve native Explorer drag/drop in Tier A. |
| **D7** | Detached / floating desktop companion excluded | **Explicit Owner Policy** | Master Contract §5 D7, Revision Notes | Island is notch-only; no floating pet window (`mochi.html` / `desktop.rs`). |
| **D8** | English docs, bilingual EN+ID UI strings | **Default Proposed by Pack** | Master Contract §5 D8 | All public docs and ADRs in English; UI uses i18n keys with EN and ID definitions. |
| **D10** | Never send unverified commands to IDE | **Security Invariant** | Master Contract §5 D10, §12.1 | Telemetry is monitoring only; requires authenticated bidirectional ACK before approval execution. |
| **D11** | In-memory clipboard history only | **Explicit Owner Decision** | Master Contract §5 D11 | No disk persistence; preserve native PNG bytes without lossy bitmap transcoding. |
| **D12** | Manual meeting timer & fake activity tab deleted | **Explicit Owner Decision** | Master Contract §5 D12 | Never reinstate obsolete meeting timer or fake activity tab. |
| **D13** | Halt new WASAPI / speech engine development | **Latest Owner Decision** | Master Contract §5 D13 | Audit and preserve existing code truthfully; do not expand speech engine without new explicit user request. |
| **D14** | Direct-provider Xyn Chat architecture | **Conservative Architecture** | Master Contract §5 D14 | Keep persona prompt and direct provider proxy; no privileged IDE command bridge. |
| **D15** | Strict provider model validation | **Safety Rule** | Master Contract §5 D15 | Throw explicit error on unknown models; no silent fallbacks; mandatory payment acknowledgment. |
| **E4-Hist** | Live Antigravity event display in notch | **Historical Evidence (Scoped E4)** | `media_1792397537855.png` (2026-10-19) | Proves visual display was observed working on host; new-HEAD native hook trigger verification remains pending. |
