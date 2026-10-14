# Changelog

## 1.0.0-alpha.1 — alpha candidate (unreleased)

Consolidates the Xyeena Island Stage 0–v0.6 prototypes into one tracked alpha line. Version is intentionally changed **once** for the alpha candidate. All follow-on fixes belong to this release candidate until the release gate is green. This is not a stable 1.0 release.

### Included
- Native Windows Island, tray, topmost, motion and local preferences.
- Windows media playback sessions and available controls; master output volume.
- Optional session-only clipboard text capture, OS notifications and read-only Xyeena run summaries.
- Original Xyeena Fold and motion-math attribution to Coucou.
- Release integrity audit, architecture/security docs, Windows CI and unsigned NSIS prerelease packaging workflow.

### Explicitly not included
- Teams call detection, actual agent approvals/hooks, AI provider chat, secure token integrations, agent live diff, file drop, phone link, Linux support, signed binaries or enterprise deployment certification.

### Release gate
- Full Windows native build, packaging tests, Windows GUI acceptance, perf verification and third-party/legal review **remain required** before a GitHub alpha prerelease may be called ready.
