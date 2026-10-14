---
name: xyeena-verify
description: Use when work is about to be called complete, fixed, passing, safe, ready, or when moving from implementation into review/release.
---

# Verification Gate

Before a success claim, identify what observable evidence would prove that exact claim, run or inspect it fresh, read the full relevant result, and compare it to the acceptance criteria.

Do not treat a previous run, an agent report, a diff, a linter, or confidence as interchangeable with the required proof. If the tree changed after a test/build/browser run, invalidate evidence whose scope includes the changed tree.

Report the actual status. A failed gate routes to the relevant diagnosis or definition state rather than being softened into "probably fine".
