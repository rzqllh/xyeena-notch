# Contributing to Xyeena Island

- Windows-first, Tauri 2, TypeScript and Rust. Keep Xyeena Agentic as a separate package.
- Changes must include behaviour tests and explicit acceptance evidence. Do not claim native performance or coverage from pure JS tests.
- Guard existing user settings; avoid global hooks, token storage in web storage, and silent clipboard capture.
- Third-party assets must have documented redistribution rights; Coucou/Mochi names/art/icons/sounds/media are not reusable.
- Target release is `1.0.0-alpha.1` **until accepted**. Do not increment version per code review or patch.
- Run release audit, source tests, typecheck, native Windows CI and GUI acceptance before tagging.
