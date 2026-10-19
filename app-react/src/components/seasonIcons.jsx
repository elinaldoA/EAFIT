// Ícones da barra de baixo no Dia das Bruxas (aluno e personal). Mesmo traço
// dos normais (viewBox 24, stroke currentColor) e o mesmo sentido de cada aba,
// pra ninguém se perder: halter de abóboras, lápide com check, poção, velas
// em gráfico, fantasma no perfil.
const svg = children => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

const ghost = svg(<>
  <path d="M5 21V11a7 7 0 0 1 14 0v10l-2.3-1.8-2.4 1.8-2.3-1.8-2.3 1.8-2.4-1.8z" />
  <circle cx="9.5" cy="11" r=".9" fill="currentColor" /><circle cx="14.5" cy="11" r=".9" fill="currentColor" />
</>);

export const HALLOWEEN_NAV_ICONS = {
  // aluno
  treino: svg(<>
    <ellipse cx="5" cy="13" rx="3.8" ry="4.4" /><path d="M5 8.6c-1.4 1.3-1.4 7.5 0 8.8M5 8.6c1.4 1.3 1.4 7.5 0 8.8" /><path d="M5 8.6l1-2.2" />
    <ellipse cx="19" cy="13" rx="3.8" ry="4.4" /><path d="M19 8.6c-1.4 1.3-1.4 7.5 0 8.8M19 8.6c1.4 1.3 1.4 7.5 0 8.8" /><path d="M19 8.6l-1-2.2" />
    <line x1="8.8" y1="13" x2="15.2" y2="13" />
  </>),
  historico: svg(<>
    <path d="M6 21V10a6 6 0 0 1 12 0v11" /><line x1="3.5" y1="21" x2="20.5" y2="21" />
    <polyline points="9 13.5 11 15.5 15 11.5" />
  </>),
  hidratacao: svg(<>
    <path d="M9.5 2h5" /><path d="M10.5 2v5.2L5.4 15.6A3.6 3.6 0 0 0 8.5 21h7a3.6 3.6 0 0 0 3.1-5.4L13.5 7.2V2" />
    <path d="M7.2 14.5h9.6" /><circle cx="10.5" cy="17.5" r=".6" fill="currentColor" /><circle cx="13.6" cy="16.6" r=".6" fill="currentColor" />
  </>),
  dash: svg(<>
    <rect x="4" y="14" width="3" height="6" rx=".5" /><rect x="10.5" y="9" width="3" height="11" rx=".5" /><rect x="17" y="12" width="3" height="8" rx=".5" />
    <path d="M5.5 11.6c-.8-.7-.3-1.9 0-2.4.3.5.8 1.7 0 2.4z" /><path d="M12 6.6c-.8-.7-.3-1.9 0-2.4.3.5.8 1.7 0 2.4z" /><path d="M18.5 9.6c-.8-.7-.3-1.9 0-2.4.3.5.8 1.7 0 2.4z" />
    <line x1="2" y1="20" x2="22" y2="20" />
  </>),
  perfil: ghost,
  // personal
  alunos: svg(<>
    <path d="M2.5 21v-8a5 5 0 0 1 10 0v8l-1.7-1.4-1.6 1.4-1.7-1.4-1.6 1.4-1.7-1.4z" />
    <circle cx="6" cy="13" r=".8" fill="currentColor" /><circle cx="9" cy="13" r=".8" fill="currentColor" />
    <path d="M14.5 8.6A5 5 0 0 1 21.5 13v8l-1.6-1.3-1.6 1.3" />
  </>),
  modelos: svg(<>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z" /><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" />
    <path d="M14.5 6.5a3 3 0 1 0 1.8 5.3 2.6 2.6 0 0 1-1.8-5.3z" />
  </>),
  turma: svg(<>
    <path d="M3.5 10h17" /><path d="M5 10c0 6 3 9 7 9s7-3 7-9" /><path d="M7.5 19l-1.2 2.2M16.5 19l1.2 2.2" />
    <circle cx="9" cy="6.5" r="1.4" /><circle cx="13.5" cy="4" r="1" /><circle cx="14" cy="7.6" r=".7" />
  </>),
  recados: svg(<>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    <circle cx="9.5" cy="10" r=".9" fill="currentColor" /><circle cx="14.5" cy="10" r=".9" fill="currentColor" />
  </>),
  conta: ghost,
};

// Ícone da aba no tema do momento; sem tema (ou sem versão), o de sempre.
export function seasonNavIcon(theme, key, fallback) {
  return (theme === 'halloween' && HALLOWEEN_NAV_ICONS[key]) || fallback;
}
