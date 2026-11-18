
import { Card, DeltaBadge, CountTable } from './parts';
import { loadEmails } from './loaders';
import { useLoad } from './useLoad';

export default function EmailsSection({ days }) {
  const emails = useLoad(loadEmails, days);

  return (
    <>
      <div className="section-label">E-mails</div>

      <Card
        title="E-mails enviados" state={emails}
        note="O Gmail não informa entrega nem abertura: aqui contam envios que saíram, falharam ou foram pulados (secrets não configurados). Os cliques aparecem em “Campanha × criativo” (a campanha é o tipo do e-mail) e na origem “email”. Vale a partir desta medição."
      >
        {data => (
          <>
            <div className="tile-grid" style={{ marginBottom: 14 }}>
              <div className="tile"><div className="tile__value">{data.sent}</div><div className="tile__label">Enviados no período</div><DeltaBadge cur={data.sent} prev={data.prevSent} /></div>
              <div className="tile"><div className="tile__value">{data.sentToday}<small> / ~500</small></div><div className="tile__label">Hoje (limite do Gmail)</div></div>
              <div className="tile"><div className="tile__value">{data.errorPct == null ? '—' : `${data.errorPct}%`}</div><div className="tile__label">Falharam ({data.error})</div></div>
              <div className="tile"><div className="tile__value">{data.unsubscribed}</div><div className="tile__label">Descadastros</div></div>
            </div>
            <CountTable
              csv="emails-enviados"
              head={['Tipo', 'Enviados', 'Falharam', 'Pulados']} empty="Nenhum e-mail registrado no período ainda."
              rows={data.kinds.map(k => ({ key: k.kind, label: k.label, cells: [k.sent, k.error, k.skipped] }))}
            />
          </>
        )}
      </Card>
    </>
  );
}
