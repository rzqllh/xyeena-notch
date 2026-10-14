---
name: xyeena-prototype
description: Use when a design or debugging decision depends on technical behavior that static inspection or documentation cannot establish reliably, and a small disposable experiment can answer it.
---

# Prototype

Prototype to answer one question, not to sneak an unreviewed implementation into production.

State the unknown first. Build the smallest experiment that can discriminate between the plausible answers. Prefer an isolated fixture, scratch route, temporary harness, or disposable branch over changing production architecture.

Run the experiment and record the observed result as evidence. Separate what the prototype proved from what remains inferred. Delete or clearly quarantine throwaway machinery unless the user explicitly chooses to promote it through the normal planning, testing, and review path.

A prototype is complete when the question is answered or the experiment establishes why it cannot currently be answered. It is not complete merely because demo code exists.
