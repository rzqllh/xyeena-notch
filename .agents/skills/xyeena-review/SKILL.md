---
name: xyeena-review
description: Use when reviewing a diff, branch, PR, completed implementation, or when an independent verdict is required before release.
---

# Review

Review independently from executor reasoning. Compare the actual change against three axes when relevant: **Intent** (does it satisfy the request/spec?), **Engineering** (is the design, implementation and test surface sound?), and **Risk** (regression, security, operations, migration or user harm).

Findings require a concrete location or reproducible evidence, impact, and requested resolution. Distinguish blocking defects from judgment calls. Do not manufacture findings to look thorough.

Return `PASS`, `PASS_WITH_NOTES`, or `CHANGES_REQUIRED`. A challenge from the executor is resolved by discriminating evidence, not by confidence or agent majority.
