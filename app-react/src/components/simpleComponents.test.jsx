// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';

const h = vi.hoisted(() => ({
  auth: { user: { email: 'ana@x.com', user_metadata: {} } },
  avatar: { avatarData: null },
  workout: { syncStatus: 'ok', syncNow: vi.fn() },
  theme: { theme: 'dark', toggleTheme: vi.fn() },
  setLang: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../context/useAuth', () => ({ useAuth: () => h.auth }));
vi.mock('../context/useAvatar', () => ({ useAvatar: () => h.avatar }));
vi.mock('../context/useWorkout', () => ({ useWorkout: () => h.workout }));
vi.mock('../context/useTheme', () => ({ useTheme: () => h.theme }));
vi.mock('../lib/i18n', async orig => ({ ...(await orig()), setLang: (...a) => h.setLang(...a) }));

import BodyAvatar from './BodyAvatar';
import BootSplash from './BootSplash';
import DumbbellSpinner from './DumbbellSpinner';
import LanguageSwitch from './LanguageSwitch';
import Loading from './Loading';
import PasswordInput from './PasswordInput';
import Skeleton from './Skeleton';
import ThemeToggle from './ThemeToggle';
import TopbarProfile from './TopbarProfile';
import WaterBars from './WaterBars';
import LineChart from './LineChart';
import ChatThread from './ChatThread';
import { MUSCLE_LABELS, FRONT_MUSCLE_PATHS, BACK_MUSCLE_PATHS } from '../data/bodyMuscleMap';

beforeEach(() => {
  vi.clearAllMocks();
  h.auth.user = { email: 'ana@x.com', user_metadata: {} };
  h.avatar.avatarData = null;
  h.workout.syncStatus = 'ok';
  h.theme.theme = 'dark';
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('bodyMuscleMap', () => {
  it('todo músculo desenhado tem rótulo', () => {
    for (const p of [...FRONT_MUSCLE_PATHS, ...BACK_MUSCLE_PATHS]) {
      expect(MUSCLE_LABELS[p.muscle], p.muscle).toBeTruthy();
      expect(p.d).toMatch(/^M /);
    }
  });
});

describe('BodyAvatar', () => {
  it('marca só os grupos ativos em frente e costas', () => {
    const { container } = render(<BodyAvatar activeGroups={new Set(['chest', 'back'])} />);
    const active = [...container.querySelectorAll('.muscle--active')].map(e => e.dataset.muscle);
    expect(active.length).toBeGreaterThan(0);
    expect(new Set(active)).toEqual(new Set(['chest', 'back']));
    expect(container.querySelectorAll('.muscle').length).toBe(FRONT_MUSCLE_PATHS.length + BACK_MUSCLE_PATHS.length);
    expect(screen.getByText('Trabalhado hoje')).toBeTruthy();
  });

  it('sem grupos ativos nada é destacado e cada músculo tem título', () => {
    const { container } = render(<BodyAvatar activeGroups={new Set()} />);
    expect(container.querySelector('.muscle--active')).toBeNull();
    expect(container.querySelector('.muscle title').textContent).toBeTruthy();
  });

  it('refaz a tentativa da imagem em caso de erro (até 2 vezes)', () => {
    vi.useFakeTimers();
    const { container } = render(<BodyAvatar activeGroups={new Set()} />);
    const src = () => container.querySelector('img').getAttribute('src');
    const first = src();
    fireEvent.error(container.querySelector('img'));
    act(() => { vi.advanceTimersByTime(900); });
    expect(src()).toContain('?retry=1');
    fireEvent.error(container.querySelector('img'));
    act(() => { vi.advanceTimersByTime(900); });
    expect(src()).toContain('?retry=2');
    fireEvent.error(container.querySelector('img'));
    act(() => { vi.advanceTimersByTime(900); });
    expect(src()).toContain('?retry=2');
    expect(first).not.toContain('retry');
  });
});

describe('BootSplash, DumbbellSpinner, Skeleton', () => {
  it('splash tem papel de status acessível', () => {
    render(<BootSplash />);
    expect(screen.getByRole('status', { name: 'Carregando o EAFIT' })).toBeTruthy();
    expect(screen.getByText('EAFIT')).toBeTruthy();
  });

  it('spinner usa o tamanho pedido (padrão md)', () => {
    const { container, rerender } = render(<DumbbellSpinner />);
    expect(container.querySelector('.dumbbell--md')).toBeTruthy();
    rerender(<DumbbellSpinner size="lg" />);
    expect(container.querySelector('.dumbbell--lg')).toBeTruthy();
  });

  it('skeleton aplica a altura', () => {
    const { container } = render(<Skeleton height={80} />);
    expect(container.firstChild.style.height).toBe('80px');
  });
});

describe('Loading', () => {
  it('a porcentagem sobe devagar e nunca passa de 95%', () => {
    vi.useFakeTimers();
    render(<Loading />);
    expect(screen.getByText('0%')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(120); });
    expect(screen.getByText('7%')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(120 * 500); });
    expect(screen.getByText('95%')).toBeTruthy();
  });

  it('trava o scroll, bloqueia teclas e restaura ao desmontar', () => {
    document.body.style.overflow = 'auto';
    const { unmount } = render(<Loading label="Aguarde" />);
    expect(document.body.style.overflow).toBe('hidden');
    expect(screen.getByText('Aguarde')).toBeTruthy();
    const ev = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
    screen.getByRole('status').dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    unmount();
    expect(document.body.style.overflow).toBe('auto');
  });
});

describe('PasswordInput', () => {
  it('alterna entre ocultar e mostrar a senha', () => {
    render(<PasswordInput label="Senha" value="abc" onChange={vi.fn()} hint="Mínimo 6" />);
    const input = screen.getByLabelText('Senha');
    expect(input.type).toBe('password');
    const toggle = screen.getByRole('button', { name: 'Mostrar senha' });
    fireEvent.click(toggle);
    expect(input.type).toBe('text');
    expect(screen.getByRole('button', { name: 'Ocultar senha' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Mínimo 6')).toBeTruthy();
    expect(input.getAttribute('aria-describedby')).toBe(screen.getByText('Mínimo 6').id);
  });

  it('chama onChange com o texto e sem dica não liga aria-describedby', () => {
    const onChange = vi.fn();
    render(<PasswordInput label="Senha" value="" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'novo' } });
    expect(onChange).toHaveBeenCalledWith('novo');
    expect(screen.getByLabelText('Senha').hasAttribute('aria-describedby')).toBe(false);
  });
});

describe('ThemeToggle e LanguageSwitch', () => {
  it('alterna o tema e troca o ícone', () => {
    const { container, rerender } = render(<ThemeToggle />);
    expect(container.querySelector('circle')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Alternar tema'));
    expect(h.theme.toggleTheme).toHaveBeenCalled();
    h.theme.theme = 'light';
    rerender(<ThemeToggle />);
    expect(container.querySelector('circle')).toBeNull();
  });

  it('seletor de idioma lista os idiomas e delega a troca', () => {
    render(<LanguageSwitch />);
    const select = screen.getByLabelText('Idioma');
    expect(select.value).toBe('pt');
    expect([...select.options].map(o => o.value)).toEqual(['pt', 'en']);
    fireEvent.change(select, { target: { value: 'en' } });
    expect(h.setLang).toHaveBeenCalledWith('en');
  });
});

describe('TopbarProfile', () => {
  it('mostra inicial do nome e o ponto de sincronização', () => {
    const { container } = render(<TopbarProfile />);
    expect(screen.getByText('A')).toBeTruthy();
    expect(screen.getByText('ana@x.com')).toBeTruthy();
    expect(container.querySelector('.sync-dot--ok')).toBeTruthy();
    expect(container.querySelector('button.sync-dot')).toBeNull();
  });

  it('usa apelido e foto quando existem', () => {
    h.auth.user = { email: 'ana@x.com', user_metadata: { apelido: 'Aninha' } };
    h.avatar.avatarData = 'data:img';
    const { container } = render(<TopbarProfile />);
    expect(screen.getByText('Aninha')).toBeTruthy();
    expect(container.querySelector('img').getAttribute('src')).toBe('data:img');
  });

  it.each(['pending', 'error'])('com sync %s o ponto vira botão que sincroniza', status => {
    h.workout.syncStatus = status;
    const { container } = render(<TopbarProfile />);
    const btn = container.querySelector('button.sync-dot--clickable');
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(h.workout.syncNow).toHaveBeenCalled();
  });

  it('sem usuário mostra "?"', () => {
    h.auth.user = null;
    render(<TopbarProfile />);
    expect(screen.getByText('?')).toBeTruthy();
  });
});

describe('WaterBars', () => {
  const series = [
    { date: '2026-10-05', ml: 3000 },
    { date: '2026-10-06', ml: 0 },
    { date: '2026-10-07', ml: 1200 },
  ];

  it('marca barras que bateram a meta, o dia de hoje e os rótulos', () => {
    const { container } = render(<WaterBars series={series} goalMl={2500} />);
    expect(container.querySelectorAll('.water-bars__bar--hit')).toHaveLength(1);
    expect(container.querySelector('.water-bars__bar--today')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Consumo de água nos últimos 3 dias' })).toBeTruthy();
    expect(screen.getByText('Hoje')).toBeTruthy();
    expect(screen.getByText('S', { selector: '.water-bars__labels span' })).toBeTruthy();
  });

  it('dia sem consumo tem altura 0 e consumo pequeno tem mínimo de 3%', () => {
    const { container } = render(<WaterBars series={[{ date: '2026-10-05', ml: 0 }, { date: '2026-10-06', ml: 10 }]} goalMl={3000} />);
    const bars = container.querySelectorAll('.water-bars__bar');
    expect(bars[0].style.height).toBe('0%');
    expect(bars[1].style.height).toBe('3%');
  });

  it('título da coluna mostra data e litros', () => {
    const { container } = render(<WaterBars series={series} goalMl={2500} />);
    expect(container.querySelector('.water-bars__col').title).toMatch(/05\/10: 3/);
  });
});

describe('LineChart', () => {
  it('menos de dois pontos mostra mensagem vazia (padrão ou customizada)', () => {
    const { rerender } = render(<LineChart points={[]} />);
    expect(screen.getByText('Nenhum registro disponível')).toBeTruthy();
    rerender(<LineChart points={[]} emptyMsg="Sem dados" />);
    expect(screen.getByText('Sem dados')).toBeTruthy();
  });

  it('um ponto usa singleMsg quando existe', () => {
    render(<LineChart points={[{ value: 80, label: 'a' }]} singleMsg={v => `Só ${v}kg`} />);
    expect(screen.getByText('Só 80kg')).toBeTruthy();
  });

  it('descarta valores não numéricos antes de decidir', () => {
    render(<LineChart points={[{ value: 80, label: 'a' }, { value: null, label: 'b' }, { value: NaN, label: 'c' }]} emptyMsg="vazio" />);
    expect(screen.getByText('vazio')).toBeTruthy();
  });

  it('desenha linha, pontos, rótulos das pontas e o máximo com sufixo', () => {
    const { container } = render(<LineChart points={[{ value: 80, label: '01/10' }, { value: 82, label: '05/10' }, { value: 81, label: '07/10' }]} valueSuffix="kg" />);
    expect(container.querySelector('polyline')).toBeTruthy();
    expect(container.querySelectorAll('circle')).toHaveLength(3);
    expect(screen.getByText('01/10')).toBeTruthy();
    expect(screen.getByText('07/10')).toBeTruthy();
    expect(screen.queryByText('05/10')).toBeNull();
    expect(screen.getByText('82kg')).toBeTruthy();
    expect(container.innerHTML).not.toContain('NaN');
  });

  it('valores iguais não geram NaN', () => {
    const { container } = render(<LineChart points={[{ value: 5, label: 'a' }, { value: 5, label: 'b' }]} />);
    expect(container.innerHTML).not.toContain('NaN');
  });
});

describe('ChatThread', () => {
  const rows = [
    { id: 1, from: 'trainer', body: 'Bom treino!', at: '2026-10-05T08:30:00Z', kind: 'recado' },
    { id: 2, from: 'client', body: 'Valeu', at: '2026-10-06T09:00:00Z', kind: 'resposta' },
    { id: 3, from: 'trainer', body: 'Novo plano', at: '2026-10-07T10:15:00Z', kind: 'treino' },
  ];
  const setup = (over = {}) => {
    const load = vi.fn().mockResolvedValue(rows);
    const send = vi.fn().mockResolvedValue();
    render(<ChatThread me="client" load={load} send={send} {...over} />);
    return { load, send };
  };

  it('mostra carregando e depois as mensagens, marcando as minhas', async () => {
    setup();
    expect(screen.getByRole('status')).toBeTruthy();
    expect(await screen.findByText('Bom treino!')).toBeTruthy();
    expect(screen.getByText('📋 Novo plano')).toBeTruthy();
    expect(screen.getByText('Valeu').closest('.chat__msg').className).toContain('chat__msg--mine');
    expect(screen.getByText('Bom treino!').closest('.chat__msg').className).not.toContain('--mine');
  });

  it('chama onLoaded com as linhas', async () => {
    const onLoaded = vi.fn();
    setup({ onLoaded });
    await waitFor(() => expect(onLoaded).toHaveBeenCalledWith(rows));
  });

  it('estado vazio e falha de carregamento caem em "Nenhuma mensagem ainda."', async () => {
    setup({ load: vi.fn().mockRejectedValue(new Error('x')) });
    expect(await screen.findByText('Nenhuma mensagem ainda.')).toBeTruthy();
  });

  it('só envia texto não vazio; limpa o campo e recarrega', async () => {
    const { load, send } = setup();
    await screen.findByText('Bom treino!');
    const btn = screen.getByRole('button', { name: 'Responder' });
    expect(btn.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Resposta'), { target: { value: '  Obrigado  ' } });
    fireEvent.click(btn);
    await waitFor(() => expect(send).toHaveBeenCalledWith('Obrigado'));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText('Resposta').value).toBe('');
  });

  it('erro de envio usa onError e mantém o texto', async () => {
    const send = vi.fn().mockRejectedValue(new Error('rls'));
    setup({ send, onError: err => `Falhou: ${err.message}` });
    await screen.findByText('Bom treino!');
    fireEvent.change(screen.getByLabelText('Resposta'), { target: { value: 'oi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Responder' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Falhou: rls');
    expect(screen.getByLabelText('Resposta').value).toBe('oi');
  });

  it('erro sem onError usa a mensagem padrão', async () => {
    setup({ send: vi.fn().mockRejectedValue(new Error('x')) });
    await screen.findByText('Bom treino!');
    fireEvent.change(screen.getByLabelText('Resposta'), { target: { value: 'oi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Responder' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Não foi possível enviar. Tente de novo.');
  });

  it('respeita sendLabel e placeholder customizados', async () => {
    setup({ sendLabel: 'Enviar', placeholder: 'Escreva…' });
    await screen.findByText('Bom treino!');
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeTruthy();
    expect(screen.getByPlaceholderText('Escreva…')).toBeTruthy();
  });
});
