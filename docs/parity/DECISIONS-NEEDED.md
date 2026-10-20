# Decisions Needed & Decision Register — Phase 0

Complies with Master Contract §5, §9, and §12. Tracks open decisions, locked invariants, and dependencies awaiting explicit user confirmation.

---

## 1. Open Decisions Requiring User Action / Clarification

| ID | Topic | Current Default / Proposal | Tradeoff / Consequence | Recommended Action |
|---|---|---|---|---|
| **D3** | Production Settings Window Architecture | **Modular single-window Settings** (Safe default inside main notch window) | A secondary standalone window creates a second WebView2 process tree (+150–250 MB RAM, multi-window focus complexity). | **Keep single-window Settings** by default. Defer secondary popup until explicitly requested and accepted by owner. |
| **D4** | Local Credential Persistence Storage | **Windows Credential Manager (Rust-held)** with opt-in "Remember on this device" | Currently stored in-memory in JavaScript Map (cleared on reload). Windows Credential Manager provides secure OS-level DPAPI encryption without plain file persistence. | Implement Windows Credential Manager in Phase 1 as Rust-only storage; never return decrypted keys to JavaScript. |
| **SA8** | Connected Service Integrations to Build (Phase 5) | GitHub PR/CI and mock/status catalog for Vercel, Notion, n8n, Resend, Cal.com, Stripe | Full native API integration for all 7 third-party services requires API keys and maintenance. | Limit to GitHub read-only telemetry and health-check ping for configured webhook URLs; avoid sprawling unverified adapters. |
| **F29** | Android Local Companion Pairing Client | **DEFERRED** (Protocol verified with RFC 4231 HMAC-SHA256, but physical Android APK deferred) | Implementing an Android client app is out of scope for the Windows desktop rebuild. | Retain F29 as DEFERRED with documented gap in full upstream parity. |

---

## 2. Hard Scope Locks (Owner Policy & Non-Negotiables)

These items are settled and **must not be reopened** without a new explicit owner instruction:

1. **No Detached Desktop Pet (D7 / N1):** Xyn is anchored exclusively to the stationary notch island. No floating desktop pet window (`mochi.html` / `desktop.rs` equivalent) will be created.
2. **`packages/xyn` is Untouched (N1):** The canonical golden lion guardian package is consumed read-only via public API. Zero source mutations.
3. **No Resumed WASAPI / Speech Engine Expansion (D13 / SA7):** Existing audio capture in `voice.rs` and WinRT dictation in `flow.rs` are audited and truthful; no new WASAPI or voice assistant expansions will be undertaken.
4. **No Reinstatement of Manual Meeting Timer (D12):** Obsolete meeting timers and fake activity tabs remain deleted. Real agent session telemetry is the sole authority.
5. **Direct-Provider Chat Architecture (D14 / SA6):** Chat is direct-provider Xyn chat with persona prompt; no IDE command execution bridge or arbitrary tool bridge.
6. **In-Memory Clipboard Only (D11):** No disk/DPAPI persistence of clipboard history. Original PNG format is preserved losslessly.
