// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { st, hl } = vi.hoisted(() => ({
  st: { fetchSettings: vi.fn(), saveSetting: vi.fn() },
  hl: { fetchHealth: vi.fn() },
}));

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../context/useAdminAuth', () => ({ useAdminAuth: () => ({ adminUser: { id: 'adm1' } }) }));
vi.mock('../lib/appSettings', async orig => ({ ...(await orig()), ...st }));
vi.mock('../lib/health', async orig => ({ ...(await orig()), ...hl }));

import AppSettings from './AppSettings';
import SystemHealth from './SystemHealth';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('AppSettings', () => {
  const base = {
    maintenance: { enabled: false, message: '' },
    banner: { enabled: false, message: '', level: 'info', linkUrl: '', linkLabel: '', version: 2 },
    flags: { feedback: false },
  };

  beforeEach(() => {
    st.fetchSettings.mockResolvedValue(base);
    st.saveSetting.mockResolvedValue();
  });

  const saveButtons = () => screen.getAllByRole('button', { name: 'Salvar' });

  it('mostra erro de carregamento', async () => {
    st.fetchSettings.mockRejectedValue(new Error('rls'));
    render(<AppSettings />);
    expect(await screen.findByText('rls')).toBeTruthy();
  });

  it('manutenção: Salvar só habilita com alteração e confirma antes de ligar', async () => {
    render(<AppSettings />);
    await screen.findByText('Modo manutenção');
    expect(saveButtons()[0].disabled).toBe(true);
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    fireEvent.change(screen.getByLabelText(/Mensagem exibida/), { target: { value: ' Voltamos às 14h ' } });
    fireEvent.click(saveButtons()[0]);
    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() => expect(st.saveSetting).toHaveBeenCalledWith('maintenance', { enabled: true, message: 'Voltamos às 14h' }, 'adm1'));
    expect(await screen.findByText('Salvo.')).toBeTruthy();
    expect(st.fetchSettings).toHaveBeenCalledTimes(2);
  });

  it('manutenção: cancelar a confirmação não salva', async () => {
    window.confirm.mockReturnValue(false);
    render(<AppSettings />);
    await screen.findByText('Modo manutenção');
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    fireEvent.click(saveButtons()[0]);
    expect(st.saveSetting).not.toHaveBeenCalled();
  });

  it('manutenção: Desfazer restaura o rascunho', async () => {
    render(<AppSettings />);
    await screen.findByText('Modo manutenção');
    const box = screen.getAllByRole('checkbox')[0];
    fireEvent.click(box);
    expect(box.checked).toBe(true);
    fireEvent.click(screen.getAllByText('Desfazer')[0]);
    expect(screen.getAllByRole('checkbox')[0].checked).toBe(false);
  });

  it('manutenção: mostra erro ao salvar', async () => {
    window.confirm.mockReturnValue(true);
    st.saveSetting.mockRejectedValue(new Error('falhou'));
    render(<AppSettings />);
    await screen.findByText('Modo manutenção');
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    fireEvent.click(saveButtons()[0]);
    expect(await screen.findByText('Erro: falhou')).toBeTruthy();
  });

  it('banner: bloqueia link inválido', async () => {
    render(<AppSettings />);
    await screen.findByText('Aviso no app');
    fireEvent.change(screen.getByLabelText(/^Link/), { target: { value: 'javascript:alert(1)' } });
    expect(screen.getByText(/O link precisa começar com/)).toBeTruthy();
    expect(saveButtons()[1].disabled).toBe(true);
  });

  it('banner: exige mensagem quando está no ar', async () => {
    render(<AppSettings />);
    await screen.findByText('Aviso no app');
    fireEvent.click(screen.getAllByRole('checkbox')[1]);
    expect(saveButtons()[1].disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'Novidade!' } });
    expect(saveButtons()[1].disabled).toBe(false);
  });

  it('banner: salva e incrementa a versão; prévia mostra o link', async () => {
    render(<AppSettings />);
    await screen.findByText('Aviso no app');
    fireEvent.click(screen.getAllByRole('checkbox')[1]);
    fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'Novidade!' } });
    fireEvent.change(screen.getByLabelText(/^Link/), { target: { value: '/novo' } });
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'success' } });
    expect(screen.getByLabelText('Pré-visualização').textContent).toContain('Saiba mais');
    fireEvent.click(saveButtons()[1]);
    await waitFor(() => expect(st.saveSetting).toHaveBeenCalledWith('banner', {
      enabled: true, message: 'Novidade!', level: 'success', linkUrl: '/novo', linkLabel: '', startsOn: '', endsOn: '', version: 3,
    }, 'adm1'));
  });

  it('recursos: alterna uma flag preservando as demais', async () => {
    render(<AppSettings />);
    await screen.findByText('Recursos do app');
    expect(screen.getAllByText('Desligado').length).toBe(1);
    const flagBoxes = screen.getAllByRole('checkbox').slice(2);
    fireEvent.click(flagBoxes[0]);
    await waitFor(() => expect(st.saveSetting).toHaveBeenCalledWith('flags', { feedback: false, fotos_progresso: false }, 'adm1'));
  });
});

describe('SystemHealth', () => {
  const now = () => new Date().toISOString();
  const okJobs = [
    { jobname: 'send-reminders-every-minute', active: true, schedule: '* * * * *', last_run_at: now(), runs_24h: 1440, failures_24h: 0 },
    { jobname: 'send-scheduled-broadcasts-every-minute', active: true, schedule: '* * * * *', last_run_at: now(), runs_24h: 1440, failures_24h: 0 },
    { jobname: 'send-engagement-hourly', active: true, schedule: '0 * * * *', last_run_at: now(), runs_24h: 24, failures_24h: 0 },
  ];
  const healthy = () => ({
    cron: { data: okJobs },
    http: { data: [{ status_group: '2xx', total: 10, last_at: now() }] },
    push: { data: [{ total_users: 10, users_with_push: 4, subs_total: 5, hosts: { 'fcm.googleapis.com': 4, 'web.push.apple.com': 1 } }] },
    notifications: { data: [{ kind: 'streak', label: 'Sequência', enabled: true, send_hour: 9, last_sent_at: null, sent_24h: 0, sent_7d: 3 }] },
    usage: { data: [{ table_name: '__total__', size_bytes: 5 * 1024 * 1024, est_rows: 0 }, { table_name: 'profiles', size_bytes: 2048, est_rows: 12000 }] },
    overdue: { data: 0 },
  });

  it('mostra "Tudo funcionando" e os blocos de dados', async () => {
    hl.fetchHealth.mockResolvedValue(healthy());
    render(<SystemHealth />);
    expect(await screen.findByText('Tudo funcionando.')).toBeTruthy();
    expect(screen.getByText('10 de 10', { exact: false })).toBeTruthy();
    expect(screen.getByText('40%')).toBeTruthy();
    expect(screen.getByText('Chrome / Android')).toBeTruthy();
    expect(screen.getByText('09:00')).toBeTruthy();
    expect(screen.getByText('nunca')).toBeTruthy();
    expect(screen.getByText('5.0 MB')).toBeTruthy();
    expect(screen.getByText(/2\.0 KB · ~12\.000 linhas/)).toBeTruthy();
  });

  it('lista problemas: job ausente, falhas HTTP recentes e notificações atrasadas', async () => {
    const h = healthy();
    h.cron = { data: okJobs.slice(0, 2) };
    h.http = { data: [{ status_group: '2xx', total: 5, last_at: now() }, { status_group: '5xx', total: 2, last_at: now(), sample: 'boom' }] };
    h.overdue = { data: 3 };
    hl.fetchHealth.mockResolvedValue(h);
    render(<SystemHealth />);
    expect(await screen.findByText('3 problema(s) encontrado(s)')).toBeTruthy();
    expect(screen.getByText(/não está agendado/, { selector: 'li' })).toBeTruthy();
    expect(screen.getByText('2 chamada(s) das funções com erro na última hora')).toBeTruthy();
    expect(screen.getByText('3 notificação(ões) agendada(s) atrasada(s)')).toBeTruthy();
    expect(screen.getByText('boom')).toBeTruthy();
  });

  it('mostra aviso (sem problema) para erro HTTP antigo', async () => {
    const h = healthy();
    const old = new Date(Date.now() - 5 * 3600000).toISOString();
    h.http = { data: [{ status_group: '2xx', total: 5, last_at: now() }, { status_group: '5xx', total: 1, last_at: old }] };
    hl.fetchHealth.mockResolvedValue(h);
    render(<SystemHealth />);
    expect(await screen.findByText('Nenhum problema, mas há avisos')).toBeTruthy();
    expect(screen.getByText(/só histórico/)).toBeTruthy();
  });

  it('erro em um bloco não derruba os outros', async () => {
    const h = healthy();
    h.usage = { error: 'sem permissão' };
    h.push = { error: 'indisponível' };
    hl.fetchHealth.mockResolvedValue(h);
    render(<SystemHealth />);
    expect(await screen.findByText('Não foi possível carregar: sem permissão')).toBeTruthy();
    expect(screen.getByText('Não foi possível carregar: indisponível')).toBeTruthy();
    expect(screen.getByText('Lembretes (água, sequência, resumo)')).toBeTruthy();
  });

  it('mostra o uso do Storage por bucket; sem o bloco, a tela segue normal', async () => {
    const h = healthy();
    h.storage = { data: [
      { su_bucket: 'progress-photos', su_public: false, su_objects: 1200, su_bytes: 3 * 1024 * 1024 },
      { su_bucket: 'exercise-media', su_public: true, su_objects: 4, su_bytes: 1024 * 1024 },
    ] };
    hl.fetchHealth.mockResolvedValue(h);
    render(<SystemHealth />);
    expect(await screen.findByText('Arquivos (Storage)')).toBeTruthy();
    expect(screen.getByText('4.0 MB')).toBeTruthy();
    expect(screen.getByText(/3\.0 MB · 1\.200 arquivo\(s\) · privado/)).toBeTruthy();
    expect(screen.getByText(/1\.0 MB · 4 arquivo\(s\) · público/)).toBeTruthy();
  });

  it('erro no Storage fica só no bloco dele', async () => {
    const h = healthy();
    h.storage = { error: 'sem acesso ao storage' };
    hl.fetchHealth.mockResolvedValue(h);
    render(<SystemHealth />);
    expect(await screen.findByText('Não foi possível carregar: sem acesso ao storage')).toBeTruthy();
    expect(screen.getByText('Tudo funcionando.')).toBeTruthy();
  });

  it('Atualizar recarrega os dados', async () => {
    hl.fetchHealth.mockResolvedValue(healthy());
    render(<SystemHealth />);
    await screen.findByText('Tudo funcionando.');
    fireEvent.click(screen.getByText('Atualizar'));
    await waitFor(() => expect(hl.fetchHealth).toHaveBeenCalledTimes(2));
  });
});
