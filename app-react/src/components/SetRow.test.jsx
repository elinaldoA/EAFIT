// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

const h = vi.hoisted(() => ({
  user: { id: 'u1', user_metadata: {} },
  saveSetState: vi.fn(),
  toast: vi.fn(),
  checkForNewPR: vi.fn(),
  postActivity: vi.fn(),
  sendPushToSelf: vi.fn(),
  coachSay: vi.fn(),
}));

vi.mock('../context/useAuth', () => ({ useAuth: () => ({ user: h.user }) }));
vi.mock('../context/useWorkout', () => ({ useWorkout: () => ({ saveSetState: h.saveSetState, workoutIds: { Segunda: 'w-seg' } }) }));
vi.mock('../context/useToast', () => ({ useToast: () => h.toast }));
vi.mock('../lib/records', () => ({ checkForNewPR: (...a) => h.checkForNewPR(...a) }));
vi.mock('../lib/coach', () => ({ coachSay: (...a) => h.coachSay(...a), speechExercise: n => n, speechLoad: n => String(n) }));
vi.mock('../lib/friends', () => ({ postActivity: (...a) => h.postActivity(...a) }));
vi.mock('../lib/pushSubscriptions', () => ({ sendPushToSelf: (...a) => h.sendPushToSelf(...a) }));

import SetRow from './SetRow';

const EX = { nome: 'Supino Reto', series: '3', reps: '8-10', descanso: '60s' };
const DAY = { dia: 'Segunda' };

function setup(props = {}) {
  const bump = vi.fn();
  const onRestStart = vi.fn();
  const onFillOthers = vi.fn();
  render(<SetRow ex={EX} n={1} day={DAY} bump={bump} onRestStart={onRestStart} onFillOthers={onFillOthers} started {...props} />);
  return { bump, onRestStart, onFillOthers };
}

const carga = () => screen.getByPlaceholderText('kg');
const reps = () => screen.getByPlaceholderText('reps');
const check = () => screen.getByRole('button', { name: '✓' });

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  h.user = { id: 'u1', user_metadata: {} };
  h.saveSetState.mockReset().mockResolvedValue('w-id');
  h.toast.mockReset();
  h.coachSay.mockReset();
  h.checkForNewPR.mockReset().mockResolvedValue(false);
  h.postActivity.mockReset();
  h.sendPushToSelf.mockReset().mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('SetRow — registro de carga e reps', () => {
  it('começa com o que já estava salvo no aparelho', () => {
    localStorage.setItem('set_Supino Reto_1_carga', '80');
    localStorage.setItem('set_Supino Reto_1_reps', '8');
    localStorage.setItem('set_Supino Reto_1_done', 'true');
    setup();
    expect(carga().value).toBe('80');
    expect(reps().value).toBe('8');
    expect(check().getAttribute('aria-pressed')).toBe('true');
  });

  it('digitar guarda local na hora e salva no banco só depois da pausa', async () => {
    const { bump } = setup();
    fireEvent.change(carga(), { target: { value: '82.5' } });
    expect(localStorage.getItem('set_Supino Reto_1_carga')).toBe('82.5');
    expect(bump).toHaveBeenCalled();
    expect(h.saveSetState).not.toHaveBeenCalled();

    await act(async () => { vi.advanceTimersByTime(800); });
    expect(h.saveSetState).toHaveBeenCalledWith('Segunda', 'Supino Reto', 1, { carga: 82.5 });
  });

  it('várias digitações seguidas viram um único salvamento', async () => {
    setup();
    fireEvent.change(carga(), { target: { value: '8' } });
    await act(async () => { vi.advanceTimersByTime(300); });
    fireEvent.change(carga(), { target: { value: '80' } });
    await act(async () => { vi.advanceTimersByTime(800); });
    expect(h.saveSetState).toHaveBeenCalledTimes(1);
    expect(h.saveSetState).toHaveBeenCalledWith('Segunda', 'Supino Reto', 1, { carga: 80 });
  });

  it('sair do campo salva na hora, sem esperar a pausa', async () => {
    setup();
    fireEvent.change(reps(), { target: { value: '10' } });
    await act(async () => { fireEvent.blur(reps()); });
    expect(h.saveSetState).toHaveBeenCalledWith('Segunda', 'Supino Reto', 1, { reps: 10 });
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(h.saveSetState).toHaveBeenCalledTimes(1);
  });

  it('campo apagado salva null', async () => {
    localStorage.setItem('set_Supino Reto_1_carga', '80');
    setup();
    fireEvent.change(carga(), { target: { value: '' } });
    await act(async () => { fireEvent.blur(carga()); });
    expect(h.saveSetState).toHaveBeenCalledWith('Segunda', 'Supino Reto', 1, { carga: null });
  });

  it('série 1 com carga e reps preenchidos propaga para as outras séries', async () => {
    const { onFillOthers } = setup();
    fireEvent.change(carga(), { target: { value: '80' } });
    fireEvent.change(reps(), { target: { value: '10' } });
    await act(async () => { fireEvent.blur(reps()); });
    expect(onFillOthers).toHaveBeenCalledWith('80', '10');
  });

  it('não propaga a partir de séries que não são a 1ª nem com campo vazio', async () => {
    const { onFillOthers } = setup({ n: 2 });
    fireEvent.change(carga(), { target: { value: '80' } });
    fireEvent.change(reps(), { target: { value: '10' } });
    await act(async () => { fireEvent.blur(reps()); });
    expect(onFillOthers).not.toHaveBeenCalled();
  });

  it('sem usuário logado guarda local e não chama o banco', async () => {
    h.user = null;
    setup();
    fireEvent.change(carga(), { target: { value: '50' } });
    await act(async () => { fireEvent.blur(carga()); });
    expect(localStorage.getItem('set_Supino Reto_1_carga')).toBe('50');
    expect(h.saveSetState).not.toHaveBeenCalled();
  });

  it('treino não iniciado trava os campos e o check', () => {
    setup({ started: false });
    expect(carga().disabled).toBe(true);
    expect(reps().disabled).toBe(true);
    expect(check().disabled).toBe(true);
  });
});

describe('SetRow — marcar a série', () => {
  it('marcar guarda, avisa a página, inicia o descanso do exercício e salva completed', async () => {
    const { bump, onRestStart } = setup();
    await act(async () => { fireEvent.click(check()); });
    expect(localStorage.getItem('set_Supino Reto_1_done')).toBe('true');
    expect(bump).toHaveBeenCalled();
    expect(onRestStart).toHaveBeenCalledWith('Supino Reto', 60);
    expect(h.saveSetState).toHaveBeenCalledWith('Segunda', 'Supino Reto', 1, { completed: true });
    expect(check().getAttribute('aria-pressed')).toBe('true');
  });

  it('desmarcar não inicia descanso e salva completed:false', async () => {
    localStorage.setItem('set_Supino Reto_1_done', 'true');
    const { onRestStart } = setup();
    await act(async () => { fireEvent.click(check()); });
    expect(onRestStart).not.toHaveBeenCalled();
    expect(h.saveSetState).toHaveBeenCalledWith('Segunda', 'Supino Reto', 1, { completed: false });
  });

  it('exercício sem descanso (-) não inicia o cronômetro', async () => {
    const { onRestStart } = setup({ ex: { ...EX, descanso: '-' } });
    await act(async () => { fireEvent.click(check()); });
    expect(onRestStart).not.toHaveBeenCalled();
  });

  it('sem carga numérica não confere recorde', async () => {
    setup();
    await act(async () => { fireEvent.click(check()); });
    expect(h.checkForNewPR).not.toHaveBeenCalled();
  });
});

describe('SetRow — recordes', () => {
  async function markWithCarga(user) {
    if (user) h.user = user;
    localStorage.setItem('set_Supino Reto_1_carga', '100');
    localStorage.setItem('set_Supino Reto_1_reps', '5');
    setup();
    await act(async () => { fireEvent.click(check()); });
  }

  it('novo recorde: confere com o id do treino, avisa, publica e manda push', async () => {
    h.checkForNewPR.mockResolvedValue(true);
    await markWithCarga();
    expect(h.checkForNewPR).toHaveBeenCalledWith('u1', 'Supino Reto', 100, '5', { workoutId: 'w-id', setNumber: 1 });
    expect(h.toast).toHaveBeenCalledWith('🏆 Novo recorde em Supino Reto!');
    expect(h.postActivity).toHaveBeenCalledWith('recorde', 'Novo recorde em Supino Reto', '100kg');
    expect(h.coachSay).toHaveBeenCalledWith('pr', { exercicio: 'Supino Reto', carga: '100' }, { queue: true });
    expect(h.sendPushToSelf).toHaveBeenCalledWith(expect.objectContaining({ body: 'Supino Reto: 100kg', tag: 'pr-Supino Reto' }));
  });

  it('sem novo recorde não avisa nem publica', async () => {
    await markWithCarga();
    expect(h.checkForNewPR).toHaveBeenCalled();
    expect(h.toast).not.toHaveBeenCalled();
    expect(h.postActivity).not.toHaveBeenCalled();
  });

  it('push de recorde respeita a preferência desligada', async () => {
    h.checkForNewPR.mockResolvedValue(true);
    await markWithCarga({ id: 'u1', user_metadata: { notifyRecords: false } });
    expect(h.toast).toHaveBeenCalled();
    expect(h.sendPushToSelf).not.toHaveBeenCalled();
  });

  it('erro na checagem do recorde não quebra a marcação', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.checkForNewPR.mockRejectedValue(new Error('rede'));
    await markWithCarga();
    expect(check().getAttribute('aria-pressed')).toBe('true');
    expect(h.toast).not.toHaveBeenCalled();
    err.mockRestore();
  });
});
