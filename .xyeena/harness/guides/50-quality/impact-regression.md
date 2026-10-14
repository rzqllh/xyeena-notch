# Impact & Regression Harness
Mode: TRIGGERED for shared code

Before editing a shared primitive:
- who imports/consumes it?
- what pages/routes use it?
- what state/contracts depend on it?
- what tests cover it?

After editing, verify representative consumers, not only the page where the bug was noticed.
