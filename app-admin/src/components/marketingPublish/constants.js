

export const NO_STORIES = ['tiktok'];
export const POSTS_PAGE = 30; // posts por vez no histórico

export const TABS = [
  { key: 'agenda', label: 'Agenda' },
  { key: 'fila', label: 'Fila' },
  { key: 'novo', label: 'Novo post' },
  { key: 'historico', label: 'Histórico' },
];
export const HISTORY_FILTERS = [
  { key: 'todos', label: 'Todos', test: () => true },
  { key: 'agendados', label: 'Agendados', test: p => Boolean(p.scheduled_at) && p.targets.some(t => t.status === 'pending') },
  { key: 'problema', label: 'Com problema', test: p => p.targets.some(t => t.status === 'failed') },
  { key: 'publicados', label: 'Publicados', test: p => p.targets.length > 0 && p.targets.every(t => t.status === 'published') },
];

export const STATUS_BADGE = { published: 'badge--ok', failed: 'badge--danger', processing: 'badge--warning', pending: '', canceled: '' };

// Mesmo formato do campo datetime-local (fuso do navegador do admin).
export function toLocalInputValue(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
