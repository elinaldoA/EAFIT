import EmptyState from '../components/EmptyState';
import UserClientCard from '../components/UserClientCard';
import UserWellbeingCard from '../components/UserWellbeingCard';
import UserFriendsCard from '../components/UserFriendsCard';
import UserAmbassadorCard from '../components/UserAmbassadorCard';
import UserAppDataCard from '../components/UserAppDataCard';
import { METAS, NIVEIS, badgeLabel, formatDate } from '../lib/userDetailHelpers';

export default function UserProfileTab({ userId, detail, form, setForm, busy, onSaveProfile, achievements, progressPhotos, weightLogs, waterLogs }) {
  return (
    <div className="stack">
      <form className="card form-grid" onSubmit={onSaveProfile}>
        <label className="field">
          <span className="field__label">Nome</span>
          <input className="input" value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} />
        </label>
        <label className="field">
          <span className="field__label">Sobrenome</span>
          <input className="input" value={form.sobrenome} onChange={e => setForm({ ...form, sobrenome: e.target.value })} />
        </label>
        <label className="field">
          <span className="field__label">Apelido</span>
          <input className="input" value={form.apelido} onChange={e => setForm({ ...form, apelido: e.target.value })} />
        </label>
        <label className="field">
          <span className="field__label">Sexo</span>
          <select className="input" value={form.sexo} onChange={e => setForm({ ...form, sexo: e.target.value })}>
            <option value="">—</option>
            <option value="M">Masculino</option>
            <option value="F">Feminino</option>
          </select>
        </label>
        <label className="field">
          <span className="field__label">Idade</span>
          <input className="input" type="number" value={form.idade} onChange={e => setForm({ ...form, idade: e.target.value })} />
        </label>
        <label className="field">
          <span className="field__label">Peso (kg)</span>
          <input className="input" type="number" step="0.1" value={form.peso} onChange={e => setForm({ ...form, peso: e.target.value })} />
        </label>
        <label className="field">
          <span className="field__label">Altura (cm)</span>
          <input className="input" type="number" value={form.altura} onChange={e => setForm({ ...form, altura: e.target.value })} />
        </label>
        <label className="field">
          <span className="field__label">Peso alvo (kg)</span>
          <input className="input" type="number" step="0.1" value={form.pesoAlvo} onChange={e => setForm({ ...form, pesoAlvo: e.target.value })} />
        </label>
        <label className="field">
          <span className="field__label">Treinos por semana (meta)</span>
          <input className="input" type="number" min="1" max="7" placeholder="5 (padrão)" value={form.weeklyGoal} onChange={e => setForm({ ...form, weeklyGoal: e.target.value })} />
        </label>
        <label className="field">
          <span className="field__label">Meta de água (L por dia)</span>
          <input className="input" type="number" step="0.1" min="0" placeholder="calculada pelo peso" value={form.macroAgua} onChange={e => setForm({ ...form, macroAgua: e.target.value })} />
        </label>
        <label className="field">
          <span className="field__label">Objetivo</span>
          <select className="input" value={form.meta} onChange={e => setForm({ ...form, meta: e.target.value })}>
            {METAS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Nível</span>
          <select className="input" value={form.nivel} onChange={e => setForm({ ...form, nivel: e.target.value })}>
            {NIVEIS.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <div className="form-grid__actions">
          <button className="btn btn--primary" type="submit" disabled={busy}>Salvar perfil</button>
        </div>
      </form>

      <UserAppDataCard detail={detail} />
      <UserAmbassadorCard userId={userId} />
      <UserClientCard userId={userId} />
      <UserWellbeingCard userId={userId} />
      <UserFriendsCard userId={userId} />

      <section>
        <h2 className="section-title">Conquistas</h2>
        {achievements.length === 0 && <EmptyState icon="🏅" label="Nenhuma conquista desbloqueada ainda." />}
        {achievements.length > 0 && (
          <div className="actions-row">
            {achievements.map(a => (
              <span key={a.id} className="badge badge--ok" title={formatDate(a.unlocked_at)}>
                {badgeLabel(a.badge_id)}
              </span>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="section-title">Fotos de progresso</h2>
        {progressPhotos.length === 0 && <EmptyState icon="📸" label="Sem fotos de progresso." />}
        {progressPhotos.length > 0 && (
          <div className="actions-row" style={{ flexWrap: 'wrap' }}>
            {progressPhotos.map(p => (
              <div key={p.id} style={{ width: 120 }}>
                {p.image_data ? (
                  <img
                    src={p.image_data} alt={`Foto de progresso de ${p.photo_date}`}
                    style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 8 }}
                  />
                ) : (
                  <div className="card" style={{ height: 120, display: 'grid', placeItems: 'center', fontSize: 12 }}>foto indisponível</div>
                )}
                <p className="user-detail__meta">{p.photo_date}</p>
                {p.note && <p className="user-detail__meta">{p.note}</p>}
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="section-title">Peso</h2>
        <table className="resp-table">
          <thead><tr><th>Data</th><th>Peso (kg)</th></tr></thead>
          <tbody>
            {weightLogs.map(w => (
              <tr key={w.id}><td data-label="Data">{w.log_date}</td><td data-label="Peso (kg)">{w.weight}</td></tr>
            ))}
            {weightLogs.length === 0 && <tr><td colSpan={2}><EmptyState icon="⚖️" label="Sem registros." /></td></tr>}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="section-title">Água</h2>
        <table className="resp-table">
          <thead><tr><th>Data</th><th>ml</th></tr></thead>
          <tbody>
            {waterLogs.map(w => (
              <tr key={w.id}><td data-label="Data">{w.log_date}</td><td data-label="ml">{w.amount_ml}</td></tr>
            ))}
            {waterLogs.length === 0 && <tr><td colSpan={2}><EmptyState icon="💧" label="Sem registros." /></td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
