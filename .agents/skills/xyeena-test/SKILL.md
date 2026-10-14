---
name: xyeena-test
description: Use when behavior changes need automated verification, a bug needs regression protection, or the user asks for TDD/testing.
---

# Test

Test externally meaningful behavior at the narrowest stable seam. When TDD is appropriate, make the target behavior fail for the right reason, implement the minimum change, then refactor with the behavior still green.

Do not create tests that merely mirror implementation details for reversible low-impact edits. Prefer a focused test during iteration and a broader relevant suite before closure when the risk justifies it.

A test result proves only the tree and environment on which it ran.
