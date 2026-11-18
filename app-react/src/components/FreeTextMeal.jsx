import { useState } from 'react';
import { t, locale } from '../lib/i18n';
import { parseMealText, sumItems, MAX_TEXT_CHARS } from '../lib/dietImport';

const fmt = n => n.toLocaleString(locale);

// "Escrever o que comi": uma frase vira os alimentos do dia, pelas quantidades
// ("2 ovos mexidos, uma banana e 150 g de arroz"). A pessoa confere a lista
// (valores aproximados, pela tabela) antes de registrar; o que não for achado
// fica de fora, com aviso. `foods`: lista da busca (com o catálogo do painel);
// `onAdd(items)`: registra todos na refeição escolhida.
export default function FreeTextMeal({ foods, mealName, onAdd }) {
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);

  function read(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setResult(parseMealText(text, { foods }));
  }

  function register() {
    const found = result.items.filter(i => !i.unknown);
    if (!found.length) return;
    onAdd(found);
    setText('');
    setResult(null);
  }

  const found = result?.items.filter(i => !i.unknown) || [];
  const total = sumItems(found);

  return (
    <form className="free-meal" onSubmit={read}>
      <label>
        {t('O que você comeu?')}
        <textarea
          value={text} maxLength={MAX_TEXT_CHARS} rows={2}
          placeholder={t('Ex.: 2 ovos mexidos, uma banana e 150 g de arroz')}
          onChange={e => { setText(e.target.value); setResult(null); }}
        />
      </label>
      {!result && (
        <button type="submit" className="btn btn--ghost btn--sm" disabled={!text.trim()}>{t('Ler o texto')}</button>
      )}
      {result && !result.items.length && (
        <p className="dash-card__subtitle" role="status">{t('Não entendi nenhum alimento. Escreva a quantidade e o nome, separados por vírgula.')}</p>
      )}
      {result && result.items.length > 0 && (
        <div className="free-meal__preview">
          <ul className="goal-meals__items">
            {result.items.map((it, i) => (
              <li key={`${it.label}-${i}`}>
                <span aria-hidden="true">{it.icon}</span>
                <span className="goal-meals__name">{it.label}</span>
                {it.unknown
                  ? <span className="goal-meals__badge">{t('não encontrei')}</span>
                  : <span className="goal-meals__amount">{t('{kcal} kcal', { kcal: fmt(it.kcal) })}</span>}
              </li>
            ))}
          </ul>
          {found.length > 0 && (
            <p className="goal-meals__macros">
              {t('{kcal} kcal · {g} g prot · {carbs} g carbo · {fat} g gord', { kcal: fmt(total.kcal), g: fmt(total.g), carbs: fmt(total.carbs), fat: fmt(total.fat) })}
            </p>
          )}
          {result.unknown > 0 && (
            <p className="dash-card__subtitle">{t('O que não foi encontrado fica de fora. Use a busca ou "+ Outro alimento" para esses.')}</p>
          )}
          <p className="dash-card__subtitle">{t('Valores aproximados, pela tabela. Confira as quantidades.')}</p>
          <div className="water-actions">
            <button type="button" className="btn btn--primary btn--sm" disabled={!found.length} onClick={register}>
              {t('Adicionar ao dia · {meal}', { meal: mealName })}
            </button>
            <button type="button" className="link-btn" onClick={() => setResult(null)}>{t('Editar o texto')}</button>
          </div>
        </div>
      )}
    </form>
  );
}
