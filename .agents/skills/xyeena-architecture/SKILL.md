---
name: xyeena-architecture
description: Use when choosing module boundaries, interfaces, seams, architecture, testability strategy, or evaluating whether an abstraction earns its cost.
---

# Architecture

Seek depth: useful behavior behind a small interface, at a seam that corresponds to real variation or ownership. Favor locality, testability and reversible decisions. One hypothetical adapter is not enough reason for a new abstraction.

Use the deletion test: if removing an abstraction merely removes indirection, it is probably shallow; if complexity spills into many callers, the abstraction may be earning its place.

For material choices, compare at least one credible alternative on correctness, reversibility, maintenance burden, operational risk and testability. Do not generalize beyond requirements without evidence.
