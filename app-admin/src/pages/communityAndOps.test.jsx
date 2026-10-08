// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { cm, ins, ops } = vi.hoisted(() => ({
  cm: {
    todayStr: () => '2026-10-08',
    fetchChallenges: vi.fn(), fetchChallengeLeaderboard: vi.fn(), createOfficialChallenge: vi.fn(), deleteChallenge: vi.fn(),
    fetchSocialStats: vi.fn(), fetchFeedEvents: vi.fn(), deleteFeedEvent: vi.fn(), setFeedBlock: vi.fn(), fetchInviteFunnel: vi.fn(),
  },
  ins: {
    fetchWellbeingOverview: vi.fn(), fetchWellbeingByDay: vi.fn(), fetchLowCheckinUsers: vi.fn(),
    fetchAchievements: vi.fn(), fetchRecordStats: vi.fn(),
  },
  ops: {
    fetchAdmins: vi.fn(), removeAdmin: vi.fn(), fetchAccountDeletions: vi.fn(),
    fetchLegalVersions: vi.fn(), publishLegalVersion: vi.fn(), fetchTermsAcceptance: vi.fn(),
  },
}));

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../context/useAdminAuth', () => ({ useAdminAuth: () => ({ adminUser: { id: 'adm1' } }) }));
vi.mock('../lib/community', async orig => ({ ...(await orig()), ...cm }));
vi.mock('../lib/insights', async orig => ({ ...(await orig()), ...ins }));
vi.mock('../lib/ops', async orig => ({ ...(await orig()), ...ops }));

import Challenges from './Challenges';
import SocialFeed from './SocialFeed';
import Wellbeing from './Wellbeing';
import Achievements from './Achievements';
import Admins from './Admins';
import AccountDeletions from './AccountDeletions';
import Legal from './Legal';

const wrap = ui => render(<MemoryRouter>{ui}</MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('Challenges', () => {
  const rows = [
    { id: 'c1', title: 'Outubro forte', code: 'ABC123', start: '2026-10-01', end: '2026-10-31', official: true, ownerId: null, ownerEmail: null, members: 8, active: 2 },
    { id: 'c2', title: 'Turma da Ana', code: 'XYZ789', start: '2026-09-01', end: '2026-09-07', official: false, ownerId: 'u9', ownerEmail: 'ana@x.com', members: 3, active: 3 },
  ];

  beforeEach(() => {
    cm.fetchChallenges.mockResolvedValue(rows);
    cm.fetchChallengeLeaderboard.mockResolvedValue([
      { userId: 'u1', email: 'a@x.com', name: 'Ana', role: 'member', score: 4 },
      { userId: 'u2', email: 'p@x.com', name: 'Paulo', role: 'coach', score: 0 },
    ]);
  });

  it('lista desafios com situação, participação e autoria', async () => {
    wrap(<Challenges />);
    expect(await screen.findByText('Outubro forte')).toBeTruthy();
    expect(screen.getByText('oficial')).toBeTruthy();
    expect(screen.getByText('em andamento')).toBeTruthy();
    expect(screen.getByText('encerrado')).toBeTruthy();
    expect(screen.getByText('(25%)')).toBeTruthy();
    expect(screen.getByText('ana@x.com').getAttribute('href')).toBe('/users/u9');
    expect(screen.getByText('Desafios em andamento').previousSibling.textContent).toBe('1');
  });

  it('abre e fecha o placar; o personal não é ranqueado', async () => {
    wrap(<Challenges />);
    await screen.findByText('Outubro forte');
    fireEvent.click(screen.getAllByText('Ver placar')[0]);
    expect(await screen.findByText('Ana')).toBeTruthy();
    expect(cm.fetchChallengeLeaderboard).toHaveBeenCalledWith('c1');
    expect(screen.getByText('personal')).toBeTruthy();
    fireEvent.click(screen.getByText('Ocultar placar'));
    expect(screen.queryByText('Ana')).toBeNull();
  });

  it('cria um desafio oficial e mostra o código', async () => {
    cm.createOfficialChallenge.mockResolvedValue('NEW001');
    wrap(<Challenges />);
    await screen.findByText('Outubro forte');
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: ' Novembro ' } });
    fireEvent.click(within(screen.getByRole('group', { name: 'Duração' })).getByText('7 dias'));
    fireEvent.click(screen.getByText('Criar desafio'));
    expect(await screen.findByText('NEW001')).toBeTruthy();
    expect(cm.createOfficialChallenge).toHaveBeenCalledWith('Novembro', '2026-10-08', '2026-10-14');
    expect(cm.fetchChallenges).toHaveBeenCalledTimes(2);
  });

  it('valida o nome antes de chamar o servidor', async () => {
    wrap(<Challenges />);
    await screen.findByText('Outubro forte');
    fireEvent.click(screen.getByText('Criar desafio'));
    expect(await screen.findByText(/O nome precisa ter entre 3 e 50 letras/)).toBeTruthy();
    expect(cm.createOfficialChallenge).not.toHaveBeenCalled();
  });

  it('apaga após confirmar; cancelar não apaga', async () => {
    cm.deleteChallenge.mockResolvedValue();
    wrap(<Challenges />);
    await screen.findByText('Outubro forte');
    window.confirm.mockReturnValueOnce(false);
    fireEvent.click(screen.getAllByText('Apagar')[1]);
    expect(cm.deleteChallenge).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByText('Apagar')[1]);
    expect(await screen.findByText('Desafio apagado.')).toBeTruthy();
    expect(cm.deleteChallenge).toHaveBeenCalledWith('c2');
  });

  it('estado vazio e erro', async () => {
    cm.fetchChallenges.mockResolvedValue([]);
    const { unmount } = wrap(<Challenges />);
    expect(await screen.findByText('Nenhum desafio criado ainda.')).toBeTruthy();
    unmount();
    cm.fetchChallenges.mockRejectedValue(new Error('not_authorized'));
    wrap(<Challenges />);
    expect(await screen.findByText('not_authorized')).toBeTruthy();
  });
});

describe('SocialFeed', () => {
  const stats = { users: 10, withFriends: 4, friendships: 3, pending: 1, sharingOff: 2, blocked: 0, events7d: 9, events30d: 20, reactions30d: 7 };
  const events = [
    { id: 1, userId: 'u1', email: 'a@x.com', kind: 'treino', title: 'Peito e ombro', detail: '45 min', at: '2026-10-07T12:00:00Z', reactions: 2, blocked: false },
    { id: 2, userId: 'u2', email: 'b@x.com', kind: 'recorde', title: 'Supino 100kg', detail: null, at: '2026-10-06T12:00:00Z', reactions: 0, blocked: true },
  ];

  beforeEach(() => {
    cm.fetchSocialStats.mockResolvedValue(stats);
    cm.fetchFeedEvents.mockResolvedValue({ rows: events, total: 120 });
    cm.fetchInviteFunnel.mockResolvedValue({ shareUsers: 3, shareDays: 5, landing: 8, acesso: 4, signups: 6 });
    cm.deleteFeedEvent.mockResolvedValue();
    cm.setFeedBlock.mockResolvedValue();
  });

  it('mostra números, convites e as publicações', async () => {
    wrap(<SocialFeed />);
    expect(await screen.findByText('Peito e ombro')).toBeTruthy();
    expect(screen.getByText('4 (40%)')).toBeTruthy();
    expect(screen.getByText('bloqueado')).toBeTruthy();
    expect(screen.getByText('Recorde')).toBeTruthy();
    expect(await screen.findByText('visitas à landing vindas de convite')).toBeTruthy();
    expect(screen.getByText(/120 publicação\(ões\) · página 1 de 3/)).toBeTruthy();
  });

  it('filtra por tipo voltando à primeira página e pagina', async () => {
    wrap(<SocialFeed />);
    await screen.findByText('Peito e ombro');
    fireEvent.click(screen.getByText('Próxima'));
    await waitFor(() => expect(cm.fetchFeedEvents).toHaveBeenLastCalledWith({ page: 1, kind: '' }));
    await screen.findByText('Peito e ombro');
    fireEvent.click(within(screen.getByRole('group', { name: 'Tipo de publicação' })).getByText('Recordes'));
    await waitFor(() => expect(cm.fetchFeedEvents).toHaveBeenLastCalledWith({ page: 0, kind: 'recorde' }));
  });

  it('remove uma publicação após confirmar', async () => {
    wrap(<SocialFeed />);
    await screen.findByText('Peito e ombro');
    fireEvent.click(screen.getAllByText('Remover')[0]);
    expect(await screen.findByText('Publicação removida.')).toBeTruthy();
    expect(cm.deleteFeedEvent).toHaveBeenCalledWith(1);
  });

  it('bloqueia pedindo confirmação e desbloqueia direto', async () => {
    wrap(<SocialFeed />);
    await screen.findByText('Peito e ombro');
    window.confirm.mockReturnValueOnce(false);
    fireEvent.click(screen.getByText('Bloquear usuário'));
    expect(cm.setFeedBlock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Bloquear usuário'));
    await waitFor(() => expect(cm.setFeedBlock).toHaveBeenCalledWith('u1', true));
    await screen.findByText('Usuário bloqueado no feed.');
    window.confirm.mockClear();
    fireEvent.click(screen.getByText('Desbloquear'));
    await waitFor(() => expect(cm.setFeedBlock).toHaveBeenCalledWith('u2', false));
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it('mostra erro da ação e do carregamento', async () => {
    cm.deleteFeedEvent.mockRejectedValue(new Error('not_found'));
    const { unmount } = wrap(<SocialFeed />);
    await screen.findByText('Peito e ombro');
    fireEvent.click(screen.getAllByText('Remover')[0]);
    expect(await screen.findByText(/Erro: Esse item não existe mais/)).toBeTruthy();
    unmount();
    cm.fetchFeedEvents.mockRejectedValue(new Error('falhou feed'));
    wrap(<SocialFeed />);
    expect(await screen.findByText('falhou feed')).toBeTruthy();
  });

  it('feed vazio', async () => {
    cm.fetchFeedEvents.mockResolvedValue({ rows: [], total: 0 });
    wrap(<SocialFeed />);
    expect(await screen.findByText('Nenhuma publicação no feed.')).toBeTruthy();
  });
});

describe('Wellbeing', () => {
  const overview = {
    users: 20, checkinUsers: 5, checkins: 30, energy: 3.4, sleep: 2.9, mood: 4, lowUsers: 1,
    measureUsers: 2, measures: 3, waterUsers: 10, waterDays: 40, waterAvgMl: 2100, waterHitDays: 10,
  };
  const byDay = [
    { day: '2026-10-07', checkins: 3, energy: 3, sleep: 3, mood: 4, waterUsers: 5, waterAvgMl: 2000, waterHits: 2 },
    { day: '2026-10-08', checkins: 0, energy: null, sleep: null, mood: null, waterUsers: 0, waterAvgMl: null, waterHits: 0 },
  ];

  beforeEach(() => {
    ins.fetchWellbeingOverview.mockResolvedValue(overview);
    ins.fetchWellbeingByDay.mockResolvedValue(byDay);
    ins.fetchLowCheckinUsers.mockResolvedValue([
      { userId: 'u1', email: 'a@x.com', name: 'Ana', checkins: 5, energy: 1.8, sleep: 2.5, mood: 3, last: '2026-10-07' },
    ]);
  });

  it('mostra check-in, quem está com energia baixa, água e medidas', async () => {
    wrap(<Wellbeing />);
    expect(await screen.findByText('energia média')).toBeTruthy();
    expect(screen.getByText('3,4')).toBeTruthy();
    expect(screen.getByText('usuários fizeram check-in (25% da base)')).toBeTruthy();
    expect(screen.getByText('Ana').getAttribute('href')).toBe('/users/u1');
    expect(screen.getByText('1,8').className).toContain('badge--danger');
    expect(screen.getByText('2,1 L')).toBeTruthy();
    expect(screen.getByText('25%')).toBeTruthy();
    expect(screen.getByText('07/10/2026')).toBeTruthy();
  });

  it('troca o período', async () => {
    wrap(<Wellbeing />);
    await screen.findByText('energia média');
    fireEvent.click(within(screen.getByRole('group', { name: 'Período' })).getByText('7 dias'));
    await waitFor(() => expect(ins.fetchWellbeingOverview).toHaveBeenLastCalledWith(7));
    expect(ins.fetchLowCheckinUsers).toHaveBeenLastCalledWith(7);
  });

  it('sem check-ins nem alertas', async () => {
    ins.fetchWellbeingOverview.mockResolvedValue({ ...overview, checkinUsers: 0, checkins: 0, energy: null, sleep: null, mood: null, lowUsers: 0 });
    ins.fetchLowCheckinUsers.mockResolvedValue([]);
    wrap(<Wellbeing />);
    expect(await screen.findByText('Nenhum check-in no período.')).toBeTruthy();
    expect(screen.getByText('Ninguém com energia ou sono baixos no período.')).toBeTruthy();
  });

  it('mostra erro', async () => {
    ins.fetchWellbeingByDay.mockRejectedValue(new Error('rpc caiu'));
    wrap(<Wellbeing />);
    expect(await screen.findByText('rpc caiu')).toBeTruthy();
  });
});

describe('Achievements', () => {
  beforeEach(() => {
    ins.fetchAchievements.mockResolvedValue({
      base: 10,
      list: [
        { id: 'a', label: 'Conquista A', users: 5, pct: 50, last: null },
        { id: 'b', label: 'Conquista B', users: 0, pct: 0, last: null },
      ],
    });
    ins.fetchRecordStats.mockResolvedValue([{ exercise: 'Supino', users: 4, top: 120, avgBest: 82.5, sets: 90 }]);
  });

  it('lista conquistas, destaca as que ninguém desbloqueou e mostra as cargas', async () => {
    wrap(<Achievements />);
    expect(await screen.findByText('5 · 50%')).toBeTruthy();
    expect(screen.getByText(/Percentual sobre 10 usuário/).textContent).toContain('Ninguém desbloqueou ainda: Conquista B');
    expect(await screen.findByText('Supino')).toBeTruthy();
    expect(screen.getByText('82,5 kg')).toBeTruthy();
  });

  it('troca o período das cargas', async () => {
    wrap(<Achievements />);
    await screen.findByText('Supino');
    fireEvent.click(screen.getByText('1 ano'));
    await waitFor(() => expect(ins.fetchRecordStats).toHaveBeenLastCalledWith(365));
  });

  it('sem cargas e com erro nas conquistas', async () => {
    ins.fetchRecordStats.mockResolvedValue([]);
    ins.fetchAchievements.mockRejectedValue(new Error('sem acesso'));
    wrap(<Achievements />);
    expect(await screen.findByText('Nenhuma carga registrada no período.')).toBeTruthy();
    expect(screen.getByText('sem acesso')).toBeTruthy();
  });
});

describe('Admins', () => {
  const admins = [
    { id: 'adm1', email: 'eu@x.com', name: 'Eu', createdAt: '2026-01-01T12:00:00Z', lastSignIn: '2026-10-07T12:00:00Z' },
    { id: 'adm2', email: 'outro@x.com', name: '', createdAt: '2026-02-01T12:00:00Z', lastSignIn: null },
  ];

  beforeEach(() => {
    ops.fetchAdmins.mockResolvedValue(admins);
    ops.removeAdmin.mockResolvedValue();
  });

  it('lista os admins e não deixa remover a si mesmo', async () => {
    wrap(<Admins />);
    expect(await screen.findByText('outro@x.com')).toBeTruthy();
    expect(screen.getByText('2 admin(s)')).toBeTruthy();
    expect(screen.getByText('você')).toBeTruthy();
    expect(screen.getByText('nunca')).toBeTruthy();
    expect(screen.getAllByText('Remover admin')).toHaveLength(1);
  });

  it('remove após confirmar e recarrega', async () => {
    wrap(<Admins />);
    await screen.findByText('outro@x.com');
    fireEvent.click(screen.getByText('Remover admin'));
    expect(await screen.findByText('Acesso removido.')).toBeTruthy();
    expect(ops.removeAdmin).toHaveBeenCalledWith('adm2', 'adm1');
    expect(ops.fetchAdmins).toHaveBeenCalledTimes(2);
  });

  it('cancelar não remove; erro aparece', async () => {
    wrap(<Admins />);
    await screen.findByText('outro@x.com');
    window.confirm.mockReturnValueOnce(false);
    fireEvent.click(screen.getByText('Remover admin'));
    expect(ops.removeAdmin).not.toHaveBeenCalled();
    ops.removeAdmin.mockRejectedValue(new Error('not_authorized'));
    fireEvent.click(screen.getByText('Remover admin'));
    expect(await screen.findByText('Erro: not_authorized')).toBeTruthy();
  });
});

describe('AccountDeletions', () => {
  const rows = [
    { id: 1, deleted_at: '2026-10-07T12:00:00Z', source: 'self', account_age_days: 3, workouts: 0 },
    { id: 2, deleted_at: '2026-10-01T12:00:00Z', source: 'admin', account_age_days: 400, workouts: 52 },
  ];

  it('lista as exclusões sem identificar ninguém e resume a página', async () => {
    ops.fetchAccountDeletions.mockResolvedValue({ rows, total: 120 });
    wrap(<AccountDeletions />);
    expect(await screen.findByText('A própria pessoa')).toBeTruthy();
    expect(screen.getByText('Um administrador')).toBeTruthy();
    expect(screen.getByText('3 dia(s)')).toBeTruthy();
    expect(screen.getByText('13 meses')).toBeTruthy();
    expect(screen.getByText('120 no total')).toBeTruthy();
    expect(screen.getByText('saíram sem nunca treinar').previousSibling.textContent).toBe('1');
    fireEvent.click(screen.getByText('Próxima'));
    await waitFor(() => expect(ops.fetchAccountDeletions).toHaveBeenLastCalledWith({ page: 1 }));
  });

  it('estado vazio e erro', async () => {
    ops.fetchAccountDeletions.mockResolvedValue({ rows: [], total: 0 });
    const { unmount } = wrap(<AccountDeletions />);
    expect(await screen.findByText(/Nenhuma conta excluída/)).toBeTruthy();
    unmount();
    ops.fetchAccountDeletions.mockRejectedValue(new Error('rls'));
    wrap(<AccountDeletions />);
    expect(await screen.findByText('rls')).toBeTruthy();
  });
});

describe('Legal', () => {
  const versions = [
    { id: 'v2', doc: 'termos', version: '2026-06', effective_date: '2026-06-01', summary: 'Novo foro', created_at: 'b' },
    { id: 'v1', doc: 'termos', version: '2026-01', effective_date: '2026-01-01', summary: '', created_at: 'a' },
  ];

  beforeEach(() => {
    ops.fetchLegalVersions.mockResolvedValue(versions);
    ops.fetchTermsAcceptance.mockResolvedValue({ users: 10, accepted: 8, before: 3, never: 2 });
    ops.publishLegalVersion.mockResolvedValue();
  });

  it('mostra a versão em vigor, o aceite e o histórico', async () => {
    wrap(<Legal />);
    expect(await screen.findByText('versão 2026-06')).toBeTruthy();
    expect(screen.getByText('sem versão registrada')).toBeTruthy();
    expect(screen.getByText('atual')).toBeTruthy();
    expect(screen.getByText('de 10 usuários têm aceite registrado').previousSibling.textContent).toBe('8');
    expect(ops.fetchTermsAcceptance).toHaveBeenCalledWith('2026-06-01');
    expect(screen.getAllByText('Abrir o texto publicado')[0].getAttribute('href')).toMatch(/\/legal\/termos\.html$/);
  });

  it('sem versões: consulta o aceite sem data de corte', async () => {
    ops.fetchLegalVersions.mockResolvedValue([]);
    wrap(<Legal />);
    expect(await screen.findByText('Nenhuma versão registrada ainda.')).toBeTruthy();
    expect(ops.fetchTermsAcceptance).toHaveBeenCalledWith(null);
  });

  it('registra uma nova versão e recarrega', async () => {
    wrap(<Legal />);
    await screen.findByText('versão 2026-06');
    fireEvent.change(screen.getByLabelText('Documento'), { target: { value: 'privacidade' } });
    fireEvent.change(screen.getByLabelText('Versão'), { target: { value: '2026-10' } });
    fireEvent.click(screen.getByText('Registrar versão'));
    expect(await screen.findByText('Versão registrada.')).toBeTruthy();
    expect(ops.publishLegalVersion).toHaveBeenCalledWith({ doc: 'privacidade', version: '2026-10', effectiveDate: '2026-10-08', summary: '' });
    expect(ops.fetchLegalVersions).toHaveBeenCalledTimes(2);
  });

  it('valida antes de enviar e traduz o erro do servidor', async () => {
    wrap(<Legal />);
    await screen.findByText('versão 2026-06');
    fireEvent.click(screen.getByText('Registrar versão'));
    expect(await screen.findByText(/Dê um nome para a versão/)).toBeTruthy();
    expect(ops.publishLegalVersion).not.toHaveBeenCalled();
    ops.publishLegalVersion.mockRejectedValue(new Error('version_exists'));
    fireEvent.change(screen.getByLabelText('Versão'), { target: { value: '2026-06' } });
    fireEvent.click(screen.getByText('Registrar versão'));
    expect(await screen.findByText(/Já existe uma versão com esse nome/)).toBeTruthy();
  });

  it('mostra erro de carregamento', async () => {
    ops.fetchLegalVersions.mockRejectedValue(new Error('sem tabela'));
    wrap(<Legal />);
    expect(await screen.findByText('sem tabela')).toBeTruthy();
  });
});
