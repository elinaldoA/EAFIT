import { PLATFORMS, accountLabel } from '../../lib/marketing';
import { NO_STORIES } from './constants';

export default function StepWhere({ accounts, story, selectedAccounts, toggleAccount, chooseFormat }) {
  return (
        <section className="card mkt-step">
          <h2 className="mkt-step__title"><span className="mkt-step__n">1</span> Onde e como publicar</h2>
        <div className="field">
          <span className="field__label">Formato</span>
          <div className="actions-row">
            <label><input type="radio" name="format" checked={!story} onChange={() => chooseFormat('feed')} /> Post no feed</label>
            <label><input type="radio" name="format" checked={story} onChange={() => chooseFormat('story')} /> Story</label>
          </div>
        </div>

        <div className="field">
          <span className="field__label">Publicar em</span>
          <div className="mkt-chips">
            {accounts.map(a => {
              const blocked = a.status !== 'ok' || (story && NO_STORIES.includes(a.platform));
              return (
                <label key={a.id} className={`mkt-chip${selectedAccounts.has(a.id) ? ' mkt-chip--on' : ''}`}
                  title={a.status !== 'ok' ? 'Precisa reconectar' : blocked ? `${PLATFORMS[a.platform].label} não tem stories` : ''}>
                  <input type="checkbox" checked={selectedAccounts.has(a.id)} disabled={blocked} onChange={() => toggleAccount(a.id)} />
                  {PLATFORMS[a.platform].label} · {accountLabel(a)}
                </label>
              );
            })}
          </div>
        </div>
        </section>
  );
}
