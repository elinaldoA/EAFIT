import { useState } from 'react';
import { t, locale } from '../lib/i18n';
import { parseDiet, sumItems, MAX_DIET_CHARS } from '../lib/dietImport';

const fmt = n => n.toLocaleString(locale);
const MAX_FILE_BYTES = 200 * 1024;

const macros = total => t('{kcal} kcal · {g} g prot · {carbs} g carbo · {fat} g gord', {
  kcal: fmt(total.kcal), g: fmt(total.g), carbs: fmt(total.carbs), fat: fmt(total.fat),
});

function MealList({ meals }) {
  return meals.map((m, i) => (
    <div key={`${m.name}-${i}`} className="goal-meals__card">
      <div className="goal-meals__head"><strong>{m.name}</strong></div>
      <ul className="goal-meals__items">
        {m.items.map((it, j) => (
          <li key={`${it.label}-${j}`}>
            <span aria-hidden="true">{it.icon}</span>
            <span className="goal-meals__name">{it.label}</span>
            {it.amount && <span className="goal-meals__amount">{it.amount}</span>}
            {it.unknown && <span className="goal-meals__badge">{t('sem macros')}</span>}
          </li>
        ))}
      </ul>
      <p className="goal-meals__macros">{macros(sumItems(m.items))}</p>
    </div>
  ));
}

// A dieta do aluno: importa de texto colado ou arquivo, mostra uma prévia para
// conferir e, salva, registra cada refeição no dia com um toque.
export default function DietPlan({ plan, onSave, onClear, onRegister }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');

  function close() {
    setOpen(false);
    setText('');
    setPreview(null);
    setError('');
  }

  function read(source = text) {
    const result = parseDiet(source);
    if (!result.meals.some(m => m.items.some(i => !i.unknown))) {
      setPreview(null);
      setError(t('Não encontrei refeições nem alimentos nesse texto. Escreva o nome da refeição (Café da manhã, Almoço...) e, abaixo, um alimento por linha.'));
      return;
    }
    setError('');
    setPreview(result);
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) { setError(t('Arquivo grande demais. Use um .txt ou .csv de até 200 KB.')); return; }
    try {
      const content = await file.text();
      setText(content.slice(0, MAX_DIET_CHARS));
      read(content);
    } catch {
      setError(t('Não consegui ler o arquivo.'));
    }
  }

  async function save() {
    await onSave(preview.meals);
    close();
  }

  const unknown = preview ? preview.meals.reduce((n, m) => n + m.items.filter(i => i.unknown).length, 0) : 0;
  const estimated = preview ? preview.meals.some(m => m.items.some(i => i.estimated)) : false;

  return (
    <div className="dash-card diet-plan">
      {plan.length > 0 && !open && (
        <>
          {plan.map((m, i) => (
            <div key={`${m.name}-${i}`} className="goal-meals__card">
              <div className="goal-meals__head"><strong>{m.name}</strong></div>
              <ul className="goal-meals__items">
                {m.items.map((it, j) => (
                  <li key={`${it.label}-${j}`}>
                    <span aria-hidden="true">{it.icon}</span>
                    <span className="goal-meals__name">{it.label}</span>
                    {it.amount && <span className="goal-meals__amount">{it.amount}</span>}
                  </li>
                ))}
              </ul>
              <p className="goal-meals__macros">{macros(sumItems(m.items))}</p>
              <div className="goal-meals__actions">
                <button type="button" className="btn btn--primary btn--sm" onClick={() => onRegister(m)}>
                  {t('Registrar {meal}', { meal: m.name.toLowerCase() })}
                </button>
              </div>
            </div>
          ))}
          <p className="dash-card__subtitle">{t('Dieta de {kcal} kcal por dia. Não substitui orientação de nutricionista.', { kcal: fmt(plan.reduce((s, m) => s + sumItems(m.items).kcal, 0)) })}</p>
        </>
      )}
      {plan.length === 0 && !open && (
        <p className="dash-card__subtitle">{t('Tem uma dieta do nutricionista? Cole o texto ou envie um arquivo e registre cada refeição com um toque.')}</p>
      )}

      {open && (
        <div className="diet-plan__import">
          <label className="custom-food__name">
            {t('Cole a dieta aqui')}
            <textarea
              rows={8} maxLength={MAX_DIET_CHARS} value={text}
              placeholder={t('Café da manhã\n2 ovos mexidos - 150 kcal - 12g prot\n1 fatia de pão integral\n\nAlmoço\n150g arroz branco cozido\n120g peito de frango grelhado')}
              onChange={e => { setText(e.target.value); setPreview(null); setError(''); }}
            />
          </label>
          <div className="water-actions">
            <label className="btn btn--ghost btn--sm">
              {t('Enviar arquivo (.txt, .csv)')}
              <input type="file" accept=".txt,.csv,.md,text/plain,text/csv" hidden onChange={onFile} />
            </label>
            <button type="button" className="btn btn--sm" disabled={!text.trim()} onClick={() => read()}>{t('Ler a dieta')}</button>
          </div>
          {error && <p className="custom-food__save" role="alert">{error}</p>}
          {preview && (
            <>
              <MealList meals={preview.meals} />
              {estimated && <p className="dash-card__subtitle">{t('Os itens sem calorias escritas foram calculados pela tabela TACO, pela quantidade. Confira antes de salvar.')}</p>}
              {unknown > 0 && <p className="custom-food__save">{t('{n} item(ns) não foram encontrados e ficam sem calorias. Escreva as calorias na linha (ex.: 150 kcal) para incluir.', { n: unknown })}</p>}
              {preview.skipped > 0 && <p className="dash-card__subtitle">{t('{n} linha(s) ignorada(s).', { n: preview.skipped })}</p>}
              {preview.truncated && <p className="dash-card__subtitle">{t('A dieta é grande: parte dos itens ficou de fora (até 12 refeições e 30 itens por refeição).')}</p>}
              <div className="water-actions">
                <button type="button" className="btn btn--primary btn--sm" onClick={save}>{plan.length ? t('Substituir minha dieta') : t('Salvar minha dieta')}</button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="nutri-day-tools">
        <button type="button" className="link-btn" onClick={() => (open ? close() : setOpen(true))} aria-expanded={open}>
          {open ? t('Fechar') : plan.length ? t('Importar outra dieta') : t('Importar dieta')}
        </button>
        {plan.length > 0 && !open && (
          <button type="button" className="link-btn water-actions__reset" onClick={onClear}>{t('Remover a dieta')}</button>
        )}
      </div>
    </div>
  );
}
