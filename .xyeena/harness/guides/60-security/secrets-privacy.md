# Secrets & Privacy Harness
Mode: TRIGGERED for env/logging/telemetry/user data

Check:
- secrets never shipped to clients
- no credentials in repo, fixtures, screenshots, logs, or error messages
- environment fallbacks do not become insecure defaults
- collect/store only data actually needed
- telemetry avoids sensitive payloads
- retention and exposure are proportionate to purpose
