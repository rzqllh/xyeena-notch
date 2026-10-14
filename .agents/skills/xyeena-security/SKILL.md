---
name: xyeena-security
description: Use when work touches authentication, authorization, permissions, secrets, untrusted input, uploads, webhooks, RLS, dependencies, cryptography, or production security boundaries.
---

# Security Review

Identify assets, trust boundaries, attacker-controlled inputs and privilege changes before applying a checklist. Review secure defaults, authorization at the actual enforcement point, secret handling, validation/encoding, data exposure, dependency changes and failure behavior.

A finding must name the exploitable or safety-relevant condition, affected boundary, impact and evidence. Verify likely false positives before escalating them. Search for variants of confirmed bug classes when the blast radius justifies it.

Do not silently perform production/destructive security actions. Security review is not permission to deploy, rotate credentials, delete data or change external systems.
