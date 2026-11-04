import { NavLink } from 'react-router-dom';

const LINKS = [
  { to: '/marketing', label: 'Publicar', end: true },
  { to: '/marketing-comentarios', label: 'Comentários' },
  { to: '/marketing-midia', label: 'Biblioteca de mídia' },
  { to: '/marketing-contas', label: 'Contas conectadas' },
];

// Barra de abas comum às quatro páginas do Marketing: dá para ir de uma à
// outra sem voltar ao menu lateral.
export default function MarketingNav() {
  return (
    <nav className="tabs mkt-nav" aria-label="Marketing">
      {LINKS.map(l => (
        <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => `tabs__btn${isActive ? ' tabs__btn--active' : ''}`}>
          {l.label}
        </NavLink>
      ))}
    </nav>
  );
}
