import { useEffect, useState } from 'react';
import { db } from '../lib/supabase';
import Loading from '../components/Loading';
import LandingItemListEditor from '../components/LandingItemListEditor';

const SECTION_LABELS = {
  hero: 'Topo (hero)',
  highlights: 'Faixa de destaques',
  compare: 'Comparação (sem plano vs. com EAFIT)',
  features: 'Funcionalidades',
  steps: 'Como funciona',
  cta: 'Chamada final',
};

// Chaves precisam bater com o mapa ICONS no <script> de
// app-react/public/landing/index.html — mudar aqui sem mudar lá faz o
// ícone escolhido cair no fallback (activity) na página publicada.
const ICON_OPTIONS = [
  { value: 'cloud', label: 'Nuvem (sync)' },
  { value: 'download', label: 'Download (instalável)' },
  { value: 'wifi-off', label: 'Wi-Fi off (offline)' },
  { value: 'tag', label: 'Etiqueta (grátis)' },
  { value: 'activity', label: 'Atividade (treino)' },
  { value: 'droplet', label: 'Gota (água)' },
  { value: 'chart', label: 'Gráfico (evolução)' },
  { value: 'user', label: 'Perfil (usuário)' },
];

function moveItem(list, from, to) {
  const copy = [...list];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

function linesToList(text) {
  return text.split('\n').map(s => s.trim()).filter(Boolean);
}

export default function LandingEditor() {
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    let active = true;
    db.from('landing_content').select('content').eq('id', 1).single()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) throw error;
        setContent(data.content);
      })
      .catch(err => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  function updateSection(idx, patch) {
    setContent(c => ({ ...c, sections: c.sections.map((s, i) => (i === idx ? { ...s, ...patch } : s)) }));
  }

  function moveSection(idx, delta) {
    const to = idx + delta;
    if (to < 0 || to >= content.sections.length) return;
    setContent(c => ({ ...c, sections: moveItem(c.sections, idx, to) }));
  }

  async function handleSave() {
    setSaving(true);
    setMsg('');
    try {
      const { error } = await db.from('landing_content')
        .update({ content, updated_at: new Date().toISOString() })
        .eq('id', 1);
      if (error) throw error;
      setMsg('Salvo! A landing page busca esse conteúdo a cada carregamento.');
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Loading label="Carregando landing page…" />;
  if (error) return <p className="form-msg form-msg--error">{error}</p>;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Landing page</h1>
        <a className="btn btn--ghost btn--small" href="https://elinaldoa.github.io/EAFIT/landing/" target="_blank" rel="noreferrer">
          Ver landing page ↗
        </a>
      </div>

      <div className="card form-grid" style={{ marginBottom: 16 }}>
        <label className="field">
          <span className="field__label">Cor principal</span>
          <input
            className="input" type="color" style={{ height: 40, padding: 4 }}
            value={content.theme?.primaryColor || '#f97316'}
            onChange={e => setContent(c => ({ ...c, theme: { ...c.theme, primaryColor: e.target.value } }))}
          />
        </label>
      </div>

      {msg && <p className={`form-msg ${msg.startsWith('Erro') ? 'form-msg--error' : 'form-msg--ok'}`}>{msg}</p>}

      <div className="stack">
        {content.sections.map((section, idx) => (
          <div className="day-editor" key={section.id}>
            <div className="landing-section__head">
              <strong>{SECTION_LABELS[section.type] || section.id}</strong>
              <label className="landing-section__visible">
                <input
                  type="checkbox" checked={section.enabled !== false}
                  onChange={e => updateSection(idx, { enabled: e.target.checked })}
                />
                Visível
              </label>
              <div className="exercise-row__actions">
                <button type="button" className="icon-btn" title="Mover para cima" disabled={idx === 0} onClick={() => moveSection(idx, -1)}>↑</button>
                <button type="button" className="icon-btn" title="Mover para baixo" disabled={idx === content.sections.length - 1} onClick={() => moveSection(idx, 1)}>↓</button>
              </div>
            </div>

            {section.type === 'hero' && (
              <div className="form-grid">
                <label className="field"><span className="field__label">Badge</span>
                  <input className="input" value={section.badge} onChange={e => updateSection(idx, { badge: e.target.value })} />
                </label>
                <label className="field"><span className="field__label">Título (linha 1)</span>
                  <input className="input" value={section.titleTop} onChange={e => updateSection(idx, { titleTop: e.target.value })} />
                </label>
                <label className="field"><span className="field__label">Título (linha 2)</span>
                  <input className="input" value={section.titleBottom} onChange={e => updateSection(idx, { titleBottom: e.target.value })} />
                </label>
                <label className="field"><span className="field__label">Título (destaque colorido)</span>
                  <input className="input" value={section.titleHighlight} onChange={e => updateSection(idx, { titleHighlight: e.target.value })} />
                </label>
                <label className="field" style={{ gridColumn: '1 / -1' }}><span className="field__label">Texto de apoio</span>
                  <textarea className="input" rows={2} value={section.lead} onChange={e => updateSection(idx, { lead: e.target.value })} />
                </label>
                <label className="field"><span className="field__label">Botão principal</span>
                  <input className="input" value={section.ctaPrimaryLabel} onChange={e => updateSection(idx, { ctaPrimaryLabel: e.target.value })} />
                </label>
                <label className="field"><span className="field__label">Botão secundário</span>
                  <input className="input" value={section.ctaSecondaryLabel} onChange={e => updateSection(idx, { ctaSecondaryLabel: e.target.value })} />
                </label>
              </div>
            )}

            {section.type === 'highlights' && (
              <LandingItemListEditor
                items={section.items}
                onChange={items => updateSection(idx, { items })}
                emptyItem={{ icon: 'cloud', label: '' }}
                addLabel="Adicionar destaque"
                renderFields={(item, update) => (
                  <div className="form-grid">
                    <label className="field"><span className="field__label">Ícone</span>
                      <select className="input" value={item.icon} onChange={e => update({ icon: e.target.value })}>
                        {ICON_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </label>
                    <label className="field"><span className="field__label">Texto</span>
                      <input className="input" value={item.label} onChange={e => update({ label: e.target.value })} />
                    </label>
                  </div>
                )}
              />
            )}

            {section.type === 'compare' && (
              <div className="form-grid">
                <label className="field"><span className="field__label">Título</span>
                  <input className="input" value={section.title} onChange={e => updateSection(idx, { title: e.target.value })} />
                </label>
                <label className="field"><span className="field__label">Subtítulo</span>
                  <input className="input" value={section.subtitle} onChange={e => updateSection(idx, { subtitle: e.target.value })} />
                </label>
                <label className="field"><span className="field__label">Rótulo (coluna ruim)</span>
                  <input className="input" value={section.badLabel} onChange={e => updateSection(idx, { badLabel: e.target.value })} />
                </label>
                <label className="field" style={{ gridColumn: '1 / -1' }}><span className="field__label">Itens (coluna ruim, um por linha)</span>
                  <textarea className="input" rows={4} value={(section.badItems || []).join('\n')} onChange={e => updateSection(idx, { badItems: linesToList(e.target.value) })} />
                </label>
                <label className="field"><span className="field__label">Rótulo (coluna boa)</span>
                  <input className="input" value={section.goodLabel} onChange={e => updateSection(idx, { goodLabel: e.target.value })} />
                </label>
                <label className="field" style={{ gridColumn: '1 / -1' }}><span className="field__label">Itens (coluna boa, um por linha)</span>
                  <textarea className="input" rows={4} value={(section.goodItems || []).join('\n')} onChange={e => updateSection(idx, { goodItems: linesToList(e.target.value) })} />
                </label>
              </div>
            )}

            {section.type === 'features' && (
              <div className="stack">
                <div className="form-grid">
                  <label className="field"><span className="field__label">Título</span>
                    <input className="input" value={section.title} onChange={e => updateSection(idx, { title: e.target.value })} />
                  </label>
                  <label className="field"><span className="field__label">Subtítulo</span>
                    <input className="input" value={section.subtitle} onChange={e => updateSection(idx, { subtitle: e.target.value })} />
                  </label>
                </div>
                <LandingItemListEditor
                  items={section.items}
                  onChange={items => updateSection(idx, { items })}
                  emptyItem={{ icon: 'activity', title: '', description: '' }}
                  addLabel="Adicionar funcionalidade"
                  renderFields={(item, update) => (
                    <div className="form-grid">
                      <label className="field"><span className="field__label">Ícone</span>
                        <select className="input" value={item.icon} onChange={e => update({ icon: e.target.value })}>
                          {ICON_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </label>
                      <label className="field"><span className="field__label">Título</span>
                        <input className="input" value={item.title} onChange={e => update({ title: e.target.value })} />
                      </label>
                      <label className="field" style={{ gridColumn: '1 / -1' }}><span className="field__label">Descrição</span>
                        <textarea className="input" rows={2} value={item.description} onChange={e => update({ description: e.target.value })} />
                      </label>
                    </div>
                  )}
                />
              </div>
            )}

            {section.type === 'steps' && (
              <div className="stack">
                <div className="form-grid">
                  <label className="field"><span className="field__label">Título</span>
                    <input className="input" value={section.title} onChange={e => updateSection(idx, { title: e.target.value })} />
                  </label>
                  <label className="field"><span className="field__label">Subtítulo</span>
                    <input className="input" value={section.subtitle} onChange={e => updateSection(idx, { subtitle: e.target.value })} />
                  </label>
                </div>
                <LandingItemListEditor
                  items={section.items}
                  onChange={items => updateSection(idx, { items })}
                  emptyItem={{ title: '', description: '' }}
                  addLabel="Adicionar passo"
                  renderFields={(item, update) => (
                    <div className="form-grid">
                      <label className="field"><span className="field__label">Título</span>
                        <input className="input" value={item.title} onChange={e => update({ title: e.target.value })} />
                      </label>
                      <label className="field" style={{ gridColumn: '1 / -1' }}><span className="field__label">Descrição</span>
                        <textarea className="input" rows={2} value={item.description} onChange={e => update({ description: e.target.value })} />
                      </label>
                    </div>
                  )}
                />
              </div>
            )}

            {section.type === 'cta' && (
              <div className="form-grid">
                <label className="field"><span className="field__label">Título</span>
                  <input className="input" value={section.title} onChange={e => updateSection(idx, { title: e.target.value })} />
                </label>
                <label className="field"><span className="field__label">Subtítulo</span>
                  <input className="input" value={section.subtitle} onChange={e => updateSection(idx, { subtitle: e.target.value })} />
                </label>
                <label className="field"><span className="field__label">Texto do botão</span>
                  <input className="input" value={section.ctaLabel} onChange={e => updateSection(idx, { ctaLabel: e.target.value })} />
                </label>
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16 }}>
        <button className="btn btn--primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </div>
  );
}
