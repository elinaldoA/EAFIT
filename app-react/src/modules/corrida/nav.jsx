import { t } from '../../lib/i18n';

const svg = children => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);

// Abas próprias do EAFIT Run na navegação inferior (components/BottomNav.jsx).
export const RUN_NAV_ITEMS = [
  {
    key: 'inicio',
    label: t('Início'),
    icon: svg(<><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></>),
  },
  {
    key: 'gravar',
    label: t('Gravar'),
    icon: svg(<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" fill="currentColor" /></>),
  },
  {
    key: 'desafios',
    label: t('Desafios'),
    icon: svg(<><path d="M8 21h8" /><path d="M12 17v4" /><path d="M7 4h10v5a5 5 0 0 1-10 0V4z" /><path d="M17 5h3v2a3 3 0 0 1-3 3" /><path d="M7 5H4v2a3 3 0 0 0 3 3" /></>),
  },
  {
    key: 'voce',
    label: t('Você'),
    icon: svg(<><path d="M3 3v18h18" /><polyline points="7 15 11 10 14 13 20 6" /></>),
  },
];
