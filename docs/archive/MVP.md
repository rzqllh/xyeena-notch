# Island MVP scope — v0.3 preview

In scope: standalone Tauri 2 shell, tray and topmost toggle, spring/cubic geometry motion, accessible Home/Runs/Media/Alerts/Preferences, Windows GSMTC playback control, read-only Xyeena run summaries, opt-in bounded state-change notifications, local settings.

Out of scope pending separate consent/security review: hooking Claude/Codex sessions, granting agent approval, writing run state, global OS notifications interception, cloud/phone pairing, background services, launch-on-boot, all third-party integrations, Coucou media/character assets, signed Windows installer.

Performance must be benchmarked on real hardware; native set_size calls are asynchronous and not guaranteed to hit every 60/120Hz refresh interval even when the JavaScript spring samples at the display refresh rate.
