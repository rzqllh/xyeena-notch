# Testing Harness
Mode: TRIGGERED based on change risk

Test behavior and contracts, not implementation trivia.

Prefer the cheapest test level that proves the requirement:
unit -> component -> integration -> E2E.

Bug fixes should gain a regression guard when practical.
Do not chase coverage percentage with low-value tests.
