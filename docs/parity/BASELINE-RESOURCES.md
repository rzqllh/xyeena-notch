# Baseline Resource Measurement — Phase 0

Complies with Master Contract §4 N10:
Never report Rust-only memory as total application RAM. The desired <40 MiB target is a design goal requiring explicit scope specification (Rust host vs full host+WebView2 process tree).

---

## 1. Measurement Methodology (E2)

- **Script:** `scripts/measure-resources.ps1`
- **Method:** Evaluates the primary `xyeena-island.exe` process and recursively traverses the Win32 process tree to enumerate all child `msedgewebview2.exe` instances (browser runtime, GPU process, utility processes, renderers).
- **Sampling:** 3 seconds idle sampling on Microsoft Windows 11 Pro 64-bit (`10.0.26300.0`), 16 logical cores.
- **State:** Idle compact island running natively on the desktop.

---

## 2. Empirical Measurement Results

```text
=== Xyeena Island Resource Measurement ===
Sample Duration: 3 s | Cores: 16

Host Process: xyeena-island (PID 18156)
  Working Set   : 20.04 MB
  Private Memory: 8.21 MB
  CPU Usage     : 0 %

WebView2 Process Tree (7 processes):
  - PID  8264 | msedgewebview2 | WS:   18.03 MB | Priv:   11.37 MB
  - PID 13208 | msedgewebview2 | WS:   13.16 MB | Priv:    3.17 MB
  - PID 20940 | msedgewebview2 | WS:   85.50 MB | Priv:  107.20 MB
  - PID 20948 | msedgewebview2 | WS:   46.44 MB | Priv:   37.56 MB
  - PID 25244 | msedgewebview2 | WS:   11.39 MB | Priv:    7.34 MB
  - PID 29552 | msedgewebview2 | WS:   28.66 MB | Priv:   79.33 MB
  - PID 33060 | msedgewebview2 | WS:   17.64 MB | Priv:    8.16 MB
  Subtotal Working Set   : 220.82 MB
  Subtotal Private Memory: 254.13 MB
  Subtotal CPU Usage     : 0.06 %

Combined Totals (Host + WebView2 Tree):
  Total Working Set   : 240.86 MB
  Total Private Memory: 262.34 MB
  Total CPU Usage     : 0.06 %
===========================================
```

---

## 3. Analysis & Truthful Budget Attribution

1. **Rust Host Process (`xyeena-island.exe`):**
   - Working Set: **20.04 MB** (< 40 MB target met for host process).
   - Private Memory: **8.21 MB**.
   - Idle CPU: **0.00%**.
2. **WebView2 Runtime Process Tree (7 child processes):**
   - Working Set: **220.82 MB**.
   - Private Memory: **254.13 MB**.
   - Idle CPU: **0.06%**.
3. **Combined Application Footprint:**
   - Total Working Set: **240.86 MB**.
   - Total Private Memory: **262.34 MB**.
   - Total Idle CPU: **0.06%**.

### Finding:
Any documentation or claims stating that Xyeena Island runs under 40 MB total memory must explicitly clarify that **40 MB applies strictly to the native Rust host process**. The embedded Chromium / WebView2 engine requires ~220–250 MB working set to host the web runtime. Claiming <40 MB for the entire application is misleading without this explicit boundary.
