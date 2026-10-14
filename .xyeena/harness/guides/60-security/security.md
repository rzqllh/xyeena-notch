# Security Harness
Mode: TRIGGERED for trust boundaries, public endpoints, auth, admin, data

Use risk-appropriate controls inspired by OWASP ASVS.

Check:
- authentication
- authorization
- validation/encoding
- session/token handling
- sensitive data exposure
- CSRF/XSS/SSRF/injection classes where applicable
- error information leakage
- abuse/resource exhaustion
- logging without secrets

Never weaken a security control simply to make development easier.
