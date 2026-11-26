// Ícones de traço (24×24, stroke currentColor) do app. Em vez de emoji, que muda
// de aparência em cada aparelho, os itens de menu usam estes; um emoji sem
// ícone correspondente continua aparecendo como emoji (temporadas, esportes).
const PATHS = {
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" /></>,
  run: <><circle cx="14" cy="4" r="2" /><path d="m8 22 3-6-3-3 3-5 4 3 3 1M6 12l2-3" /></>,
  ruler: <path d="m21 8-3-3L4 19l3 3zM8 8l2 2M12 12l2 2M16 16l-2-2" />,
  target: <><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></>,
  nutrition: <path d="M12 7c-2-2-7-1.5-7 4 0 5 3 10 7 10s7-5 7-10c0-5.5-5-6-7-4zM12 7c0-2 1-4 3-5" />,
  trend: <path d="m3 17 6-6 4 4 8-8M15 7h6v6" />,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6M17 4.5a3.5 3.5 0 0 1 0 7M22 20c0-3-2-5-5-5.7" /></>,
  message: <path d="M21 12a8 8 0 0 1-11.5 7.2L3 21l1.8-5.5A8 8 0 1 1 21 12z" />,
  globe: <><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20" /></>,
  bell: <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4" />,
  mic: <><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v4" /></>,
  pause: <path d="M10 4H6v16h4zM18 4h-4v16h4z" />,
  heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z" />,
  lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  cap: <path d="M22 9 12 4 2 9l10 5zM6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5" />,
  save: <path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v3h16v-3" />,
  megaphone: <path d="M3 11v2a1 1 0 0 0 1 1h3l8 4V6L7 10H4a1 1 0 0 0-1 1zM19 8a5 5 0 0 1 0 8" />,
};

// emoji → nome do ícone
const BY_EMOJI = {
  '👤': 'user', '🏃': 'run', '📏': 'ruler', '🎯': 'target', '🍽️': 'nutrition', '🍽': 'nutrition',
  '📈': 'trend', '🤝': 'users', '💬': 'message', '🌐': 'globe', '🔔': 'bell', '🎙️': 'mic', '🎙': 'mic',
  '⏸': 'pause', '⏸️': 'pause', '🩺': 'heart', '🔒': 'lock', '🔐': 'lock', '🧑‍🏫': 'users', '🎓': 'cap',
  '💾': 'save', '📣': 'megaphone',
};

export const hasIconFor = emoji => !!BY_EMOJI[emoji];

// Mostra o ícone de traço do emoji, ou o próprio emoji se não houver um.
export default function UiIcon({ icon }) {
  const name = BY_EMOJI[icon];
  if (!name) return icon;
  return (
    <svg className="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}
