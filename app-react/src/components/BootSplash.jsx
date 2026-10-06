import DumbbellSpinner from './DumbbellSpinner';

// Mesma splash estática de index.html (classes .boot definidas lá) — usada
// enquanto a sessão do Supabase é restaurada, pra não piscar tela em branco
// entre a splash do HTML e a primeira tela do app.
export default function BootSplash() {
  return (
    <div className="boot" role="status" aria-label="Carregando o EAFIT">
      <img src={`${import.meta.env.BASE_URL}icon-maskable-192.png`} alt="" />
      <div className="boot__name">EAFIT</div>
      <DumbbellSpinner size="lg" />
    </div>
  );
}
