// Authoritative i18n localization dictionary and translation engine.
// Full parity between English (en) and Bahasa Indonesia (id) across all tabs, panels, and settings.

/**
 * @typedef {'en' | 'id'} LanguageCode
 */

export const SUPPORTED_LANGUAGES = /** @type {const} */ (['en', 'id']);

export const TRANSLATIONS = {
  en: {
    // Nav tabs
    nav_now: 'Now',
    nav_clips: 'Clips',
    nav_activity: 'Agents',
    nav_chat: 'Chat',
    nav_settings: 'Settings',

    // Now tab
    now_kicker: 'LIVE WORKSPACE & MEDIA',
    now_heading: 'Now',
    now_no_session: 'No active agent session.',
    now_media_idle: 'No media active',
    now_media_volume: 'Volume',

    // Clips tab
    clip_kicker: 'CLIPBOARD MONITOR',
    clip_heading: 'Clipboard History',
    clip_explain: 'In-memory history for text, images, and file lists. Clears on exit for privacy.',
    clip_pause: 'Pause capture',
    clip_resume: 'Enable capture',
    clip_status_active: 'Monitoring active',
    clip_status_paused: 'Capture off',
    clip_search_placeholder: 'Search clipboard items...',
    clip_clear_all: 'Clear All',
    clip_empty: 'Clipboard history is empty.',

    // Agents tab
    agent_kicker: 'MULTI-AGENT RUNTIME',
    agent_heading: 'Activity & Agents',
    agent_empty: 'No agent sessions recorded yet.',
    agent_hook_shortcut: 'Configure Provider Hooks',

    // Chat tab
    chat_kicker: 'COMPANION CHAT',
    chat_heading: 'Chat with Xyn',
    chat_status_idle: 'Watching your workspace · Standing guard',
    chat_status_thinking: 'Xyn is thinking & reading context...',
    chat_status_speaking: 'Xyn is responding...',
    chat_placeholder: 'Ask Xyn anything (Enter to send, Shift+Enter for new line)...',
    chat_send: 'Send',
    chat_stop: 'Stop',
    chat_welcome: '<strong>Xyn (Golden Lion Guardian)</strong><br>Hello! I am Xyn, your desktop companion on Xyeena Island. What can I help you with across your project, code, or tasks today?',

    // Settings categories
    set_kicker: 'PREFERENCES',
    set_heading: 'Settings',
    set_cat_general: 'General',
    set_cat_guardian: 'Guardian',
    set_cat_clipboard: 'Clipboard',
    set_cat_media: 'Media',
    set_cat_ai: 'AI & Agents',
    set_cat_integrations: 'Integrations',
    set_cat_flow: 'Flow Dictation',
    set_cat_voice: 'Voice & Notes',
    set_cat_companion: 'Android Companion',
    set_cat_recap: 'Weekly Recap',
    set_cat_about: 'About & Hotkeys',

    // General settings
    set_always_top: 'Keep above windows',
    set_always_top_sub: 'Always on top',
    set_auto_collapse: 'Collapse on pointer exit',
    set_auto_collapse_sub: 'Auto-collapse to compact',
    set_auto_hide: 'Auto-hide compact view',
    set_auto_hide_sub: 'Reveal via wake strip',
    set_theme: 'Appearance',
    set_theme_sub: 'System, dark, or light theme',
    set_lang: 'Interface language',
    set_lang_sub: 'Application display language',
    set_startup: 'Start with Windows',
    set_startup_sub: 'Launch on user login (Windows startup apps)',
    set_motion: 'Reduced motion',
    set_motion_sub: 'Disable spring physics and animations',

    // Guardian settings
    set_gaze: 'Cursor tracking gaze',
    set_gaze_sub: 'Xyn eyes track active pointer',
    set_wardrobe: 'Mascot wardrobe',
    set_wardrobe_sub: 'Accessory styling variant',
    set_sound: 'Audio feedback',
    set_sound_sub: 'Subtle sound effects for actions',
    set_sound_vol: 'Sound volume',
    set_sound_vol_sub: 'Volume level for interaction chimes',
    set_salute: 'Trigger salute gesture',

    // Flow settings
    set_flow_enable: 'Flow offline speech dictation',
    set_flow_enable_sub: '100% on-device speech-to-text without cloud upload',
    set_flow_ptt: 'Push-to-talk mode (Alt+D)',
    set_flow_ptt_sub: 'Hold or toggle Alt+D to dictate text',
    set_flow_fillers: 'Filter verbal fillers',
    set_flow_fillers_sub: 'Automatically strip um, uh, like, you know',

    // Voice & notes settings
    set_voice_consent: 'Notetaker explicit recording consent',
    set_voice_consent_sub: 'Strict consent required before any audio capture starts',
    set_voice_cmds: 'Voice commands for Xyn (Alt+V)',
    set_voice_cmds_sub: 'Trigger voice commands to control Island, chat, or media',

    // Companion settings
    set_comp_status: 'Pairing Status',
    set_comp_unpaired: 'No companion device paired.',
    set_comp_btn_pair: 'Pair New Android Device',
    set_comp_btn_revoke: 'Revoke Device',

    // Recap settings
    set_recap_enable: 'Weekly Recap Engine',
    set_recap_enable_sub: 'Local aggregation from genuine activity (PR #2)',
    set_recap_generate: 'Generate Recap',
    set_recap_export: 'Export SVG',

    // Footer actions
    btn_recenter: 'Recenter',
    btn_hide_tray: 'Hide to tray',
    footer_badge: '1.0.0-alpha.1 · On device',
  },

  id: {
    // Nav tabs
    nav_now: 'Sekarang',
    nav_clips: 'Klip',
    nav_activity: 'Agen',
    nav_chat: 'Chat',
    nav_settings: 'Pengaturan',

    // Now tab
    now_kicker: 'WORKSPACE AKTIF & MEDIA',
    now_heading: 'Sekarang',
    now_no_session: 'Belum ada sesi agen aktif.',
    now_media_idle: 'Tidak ada media aktif',
    now_media_volume: 'Volume',

    // Clips tab
    clip_kicker: 'PANTAUAN CLIPBOARD',
    clip_heading: 'Riwayat Clipboard',
    clip_explain: 'Riwayat sesi lokal untuk teks, gambar, dan file. Dihapus saat keluar demi privasi.',
    clip_pause: 'Jeda pantauan',
    clip_resume: 'Aktifkan pantauan',
    clip_status_active: 'Pantauan aktif',
    clip_status_paused: 'Pantauan nonaktif',
    clip_search_placeholder: 'Cari riwayat clipboard...',
    clip_clear_all: 'Hapus Semua',
    clip_empty: 'Riwayat clipboard masih kosong.',

    // Agents tab
    agent_kicker: 'RUNTIME MULTI-AGEN',
    agent_heading: 'Aktivitas & Agen',
    agent_empty: 'Belum ada riwayat sesi agen tercatat.',
    agent_hook_shortcut: 'Konfigurasi Provider Hooks',

    // Chat tab
    chat_kicker: 'COMPANION CHAT',
    chat_heading: 'Ngobrol bareng Xyn',
    chat_status_idle: 'Memantau workspace lu · Siaga mendampingi',
    chat_status_thinking: 'Xyn lagi mikir & membaca konteks...',
    chat_status_speaking: 'Xyn lagi merespons...',
    chat_placeholder: 'Tanya apa saja ke Xyn (Enter untuk kirim, Shift+Enter untuk baris baru)...',
    chat_send: 'Kirim',
    chat_stop: 'Stop',
    chat_welcome: '<strong>Xyn (Golden Lion Guardian)</strong><br>Halo! Gue Xyn, penjaga desktop lu di Xyeena Island. Ada yang bisa gue bantu seputar project, coding, atau tugas lu hari ini?',

    // Settings categories
    set_kicker: 'PREFERENSI',
    set_heading: 'Pengaturan',
    set_cat_general: 'Umum',
    set_cat_guardian: 'Guardian',
    set_cat_clipboard: 'Clipboard',
    set_cat_media: 'Media',
    set_cat_ai: 'AI & Agen',
    set_cat_integrations: 'Integrasi',
    set_cat_flow: 'Flow Dikte',
    set_cat_voice: 'Suara & Catatan',
    set_cat_companion: 'Android Companion',
    set_cat_recap: 'Rekap Mingguan',
    set_cat_about: 'Tentang & Shortcut',

    // General settings
    set_always_top: 'Tetap di atas jendela lain',
    set_always_top_sub: 'Always on top',
    set_auto_collapse: 'Ciutkan saat kursor keluar',
    set_auto_collapse_sub: 'Otomatis ciutkan ke mode kompak',
    set_auto_hide: 'Sembunyikan mode kompak otomatis',
    set_auto_hide_sub: 'Buka via wake strip di tepi atas layar',
    set_theme: 'Tampilan',
    set_theme_sub: 'Tema sistem, gelap, atau terang',
    set_lang: 'Bahasa antarmuka',
    set_lang_sub: 'Bahasa tampilan aplikasi',
    set_startup: 'Mulai bersama Windows',
    set_startup_sub: 'Jalankan otomatis saat login pengguna',
    set_motion: 'Kurangi gerakan animasi',
    set_motion_sub: 'Nonaktifkan fisika pegas dan transisi gerak',

    // Guardian settings
    set_gaze: 'Lirikan mata mengikuti kursor',
    set_gaze_sub: 'Mata Xyn mengikuti gerakan pointer aktif',
    set_wardrobe: 'Pilihan kostum maskot',
    set_wardrobe_sub: 'Varian aksesori penampilan Xyn',
    set_sound: 'Efek suara',
    set_sound_sub: 'Nada feedback halus saat berinteraksi',
    set_sound_vol: 'Volume suara',
    set_sound_vol_sub: 'Tingkat kekencangan audio feedback',
    set_salute: 'Picu sapaan maskot',

    // Flow settings
    set_flow_enable: 'Flow dikte suara offline',
    set_flow_enable_sub: '100% pemrosesan di perangkat tanpa upload cloud',
    set_flow_ptt: 'Mode push-to-talk (Alt+D)',
    set_flow_ptt_sub: 'Tahan atau tekan Alt+D untuk mendikte teks',
    set_flow_fillers: 'Filter kata jeda (filler words)',
    set_flow_fillers_sub: 'Otomatis buang kata um, uh, seperti, lu tahu',

    // Voice & notes settings
    set_voice_consent: 'Izin persetujuan rekam notetaker',
    set_voice_consent_sub: 'Persetujuan eksplisit wajib sebelum audio dapat direkam',
    set_voice_cmds: 'Perintah suara untuk Xyn (Alt+V)',
    set_voice_cmds_sub: 'Picu perintah suara untuk kontrol Island, chat, atau media',

    // Companion settings
    set_comp_status: 'Status Pairing',
    set_comp_unpaired: 'Belum ada perangkat terhubung.',
    set_comp_btn_pair: 'Pairing Android Baru',
    set_comp_btn_revoke: 'Cabut Izin Perangkat',

    // Recap settings
    set_recap_enable: 'Engine Rekap Mingguan',
    set_recap_enable_sub: 'Agregasi lokal dari aktivitas autentik (PR #2)',
    set_recap_generate: 'Buat Rekap',
    set_recap_export: 'Ekspor SVG',

    // Footer actions
    btn_recenter: 'Tengahkan',
    btn_hide_tray: 'Sembunyi ke tray',
    footer_badge: '1.0.0-alpha.1 · Di perangkat',
  },
};

/**
 * Get translated text for a given key and language code.
 * Falls back to English if key or language is missing.
 * @param {keyof typeof TRANSLATIONS.en} key
 * @param {LanguageCode} [lang]
 * @param {Record<string, string | number>} [params]
 * @returns {string}
 */
export function t(key, lang = 'en', params) {
  const dict = TRANSLATIONS[lang] || TRANSLATIONS.en;
  let text = dict[key] || TRANSLATIONS.en[key] || String(key);
  if (params && typeof params === 'object') {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return text;
}

/**
 * Get dictionary for language code.
 * @param {LanguageCode} [lang]
 * @returns {typeof TRANSLATIONS.en}
 */
export function getDictionary(lang = 'en') {
  return TRANSLATIONS[lang] || TRANSLATIONS.en;
}
