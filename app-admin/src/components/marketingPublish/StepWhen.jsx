import { toLocalInputValue } from './constants';

export default function StepWhen({ when, setWhen, scheduleAt, setScheduleAt, errors, caption, media, story, busy, onSubmit, msg }) {
  return (
        <section className="card mkt-step">
          <h2 className="mkt-step__title"><span className="mkt-step__n">3</span> Quando publicar</h2>
        <div className="actions-row">
          <label><input type="radio" name="when" checked={when === 'now'} onChange={() => setWhen('now')} /> Publicar agora</label>
          <label><input type="radio" name="when" checked={when === 'schedule'} onChange={() => { setWhen('schedule'); if (!scheduleAt) setScheduleAt(toLocalInputValue(new Date(Date.now() + 3600_000))); }} /> Agendar</label>
          {when === 'schedule' && (
            <input className="input" type="datetime-local" value={scheduleAt} min={toLocalInputValue(new Date())} onChange={e => setScheduleAt(e.target.value)} aria-label="Data e hora" />
          )}
        </div>

        {errors.length > 0 && (caption || media.length > 0 || story) && (
          <ul className="form-msg form-msg--error mkt-errors" role="alert">{errors.map(e => <li key={e}>{e}</li>)}</ul>
        )}
        <div className="actions-row">
          <button type="button" className="btn btn--primary" disabled={busy || errors.length > 0} onClick={onSubmit}>
            {busy ? 'Enviando…' : when === 'schedule' ? (story ? 'Agendar story' : 'Agendar post') : 'Publicar agora'}
          </button>
        </div>
        {msg && <p className={`form-msg ${msg.startsWith('Erro') ? 'form-msg--error' : 'form-msg--ok'}`} role={msg.startsWith('Erro') ? 'alert' : 'status'}>{msg}</p>}
        </section>
  );
}
