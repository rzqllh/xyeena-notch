# @xyeena/recap

Dependency-free privacy-preserving weekly recap engine for Xyeena Notch.

This package has NO hooks, desktop listeners, filesystem, network, clipboard or persistence access. The host must obtain consent and supply authoritative timestamped events. The package never returns raw event IDs, session IDs, prompts, paths, file contents or project names.

API: weeklyWindow, buildWeeklyRecap, sanitizeRecap, upsertArchive, recapText, recapSvg. The previous completed Monday-Sunday week is the default. The IANA timezone is supplied by the host, including DST-aware local day buckets. Event types: session_start, session_finish, edit, command, approval, question, task_finish. Events require ISO 8601 timestamp with explicit UTC offset. Agent names are allowlisted; unknown names become other. Optional eventId deduplicates events, sessionId enables session counting and duration deduplication. Counts are never guessed. A maximum 10,000 events is accepted per aggregation. Weekly aggregates are sanitized and the optional in-memory archive is bounded to 12 weeks by default.

Example:
    import {buildWeeklyRecap,recapText,recapSvg,upsertArchive} from '@xyeena/recap';
    const r=buildWeeklyRecap([{type:'session_start',at:'2026-10-06T09:00:00+07:00',agent:'codex',sessionId:'ephemeral'}],{now:'2026-10-14T09:00:00+07:00',timeZone:'Asia/Jakarta'});
    const copy=recapText(r);
    const visual=recapSvg(r);
    const history=upsertArchive([],r,{now:'2026-10-14T09:00:00+07:00',timeZone:'Asia/Jakarta'});

This is an engine-only parallel feature. Island UI and collection are not wired; no phantom agent history or simulated data should be shown. Integrate only after the separate Antigravity smoke-ready work is reviewed, with an explicit enable/pause/clear and local privacy acceptance. The SVG export is original Xyeena typography, not Coucou character assets.

Test: npm run test --workspace @xyeena/recap
MIT. No new runtime dependencies.
