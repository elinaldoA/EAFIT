// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({
  fetchDirectory: vi.fn(), fetchInfluencer: vi.fn(), fetchProgram: vi.fn(), setFollowing: vi.fn(), adoptProgram: vi.fn(),
  fetchMyActiveProgram: vi.fn(), fetchMyInfluencer: vi.fn(), submitProgram: vi.fn(), setProgramHidden: vi.fn(),
  deleteProgram: vi.fn(), saveInfluencerProfile: vi.fn(), saveProgram: vi.fn(), refreshPlan: vi.fn(),
}));
vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../lib/influencers', async orig => {
  const { refreshPlan: _r, ...fns } = h;
  return { ...(await orig()), ...fns };
});
vi.mock('../context/useWorkout', () => ({ useWorkout: () => ({ refreshPlan: h.refreshPlan }) }));
vi.mock('../hooks/useBackToClose', () => ({ useBackToClose: () => {} }));
vi.mock('../lib/exerciseSwap', () => ({ fetchLibrary: () => Promise.resolve([]) }));

import ProgramsModal from './ProgramsModal';
import ProfileInfluencerSection from './ProfileInfluencerSection';
import { InfluencerProgramBanner, ProgramInvite } from './InfluencerProgramBanner';
import { captureProgramInvite } from '../lib/influencers';

const ID = '94c55ac1-24c2-4f0c-804a-73a72f5cdee9';
const ANA = { code: 'anafit', name: 'Ana Fit', bio: 'Treino em casa', accent: '#ff3366', avatar: null, followers: 12, instagram: 'ana.fit' };
const PROGRAM = {
  id: ID, name: 'Glúteo 4 semanas', description: 'Foco em glúteo', level: 'iniciante', weeks: 4, days: 1, exercises: 2,
  influencer: ANA,
  plan: [{ dia: 'Segunda', foco: 'Glúteo', exercicios: [{ nome: 'Agachamento', series: '4', reps: '12', grupo: 'A' }, { nome: 'Elevação pélvica', series: '4', reps: '12', grupo: 'A' }] }],
};

beforeEach(() => {
  localStorage.clear();
  Object.values(h).forEach(fn => fn.mockReset());
  h.fetchDirectory.mockResolvedValue([{ ...ANA, programs: 1, following: false }]);
  h.fetchInfluencer.mockResolvedValue({ ...ANA, programs: [{ id: ID, name: PROGRAM.name, description: PROGRAM.description, level: 'iniciante', weeks: 4, days: 1, exercises: 2 }] });
  h.fetchProgram.mockResolvedValue(PROGRAM);
  h.setFollowing.mockResolvedValue(true);
  h.adoptProgram.mockResolvedValue('plan-1');
  h.refreshPlan.mockResolvedValue(undefined);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('ProgramsModal', () => {
  it('lista → página do influenciador → programa → começar', async () => {
    const toast = vi.fn();
    const onClose = vi.fn();
    render(<ProgramsModal toast={toast} onClose={onClose} />);
    fireEvent.click(await screen.findByText('Ana Fit'));
    fireEvent.click(await screen.findByText('Glúteo 4 semanas'));
    expect(await screen.findByText('Agachamento')).toBeTruthy();
    fireEvent.click(screen.getByText('🚀 Começar este programa'));
    await waitFor(() => expect(h.adoptProgram).toHaveBeenCalledWith(ID));
    expect(h.refreshPlan).toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith('🚀 Programa "Glúteo 4 semanas" ativado!');
    expect(onClose).toHaveBeenCalled();
  });

  it('seguir pela lista', async () => {
    const toast = vi.fn();
    render(<ProgramsModal toast={toast} onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Seguir' }));
    await waitFor(() => expect(h.setFollowing).toHaveBeenCalledWith('anafit', true));
    expect(await screen.findByRole('button', { name: 'Seguindo' })).toBeTruthy();
  });

  it('vitrine vazia avisa que vem em breve', async () => {
    h.fetchDirectory.mockResolvedValue([]);
    render(<ProgramsModal toast={vi.fn()} onClose={vi.fn()} />);
    expect(await screen.findByText(/Em breve/)).toBeTruthy();
  });

  it('não começa sem confirmar', async () => {
    window.confirm.mockReturnValue(false);
    render(<ProgramsModal initial={{ programId: ID }} toast={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(await screen.findByText('🚀 Começar este programa'));
    expect(h.adoptProgram).not.toHaveBeenCalled();
  });
});

describe('marca no Treino', () => {
  it('mostra o programa do influenciador e abre a página dele', async () => {
    h.fetchMyActiveProgram.mockResolvedValue({ id: ID, name: 'Glúteo 4 semanas', influencer: ANA });
    const onOpen = vi.fn();
    render(<InfluencerProgramBanner planKey={1} onOpen={onOpen} />);
    fireEvent.click(await screen.findByText('Glúteo 4 semanas'));
    expect(onOpen).toHaveBeenCalledWith({ code: 'anafit' });
  });

  it('plano comum não mostra nada', async () => {
    h.fetchMyActiveProgram.mockResolvedValue(null);
    const { container } = render(<InfluencerProgramBanner planKey={1} onOpen={vi.fn()} />);
    await waitFor(() => expect(h.fetchMyActiveProgram).toHaveBeenCalled());
    expect(container.innerHTML).toBe('');
  });

  it('convite do link abre o programa e some', async () => {
    captureProgramInvite(`?programa=${ID}`);
    const onOpen = vi.fn();
    render(<ProgramInvite onOpen={onOpen} />);
    expect(await screen.findByText('Ana Fit te convidou')).toBeTruthy();
    fireEvent.click(screen.getByText('Ver programa'));
    expect(onOpen).toHaveBeenCalledWith({ programId: ID });
    expect(screen.queryByText('Ana Fit te convidou')).toBeNull();
    expect(localStorage.getItem('eafit_program_invite')).toBeNull();
  });
});

describe('ProfileInfluencerSection', () => {
  const ME = {
    ...ANA,
    programs: [
      { id: 'p1', draft: { name: 'Rascunho A', level: 'iniciante', days: [{}] }, status: 'editing', live: false, hidden: false, adoptions: 0 },
      { id: 'p2', draft: { name: 'Recusado B', level: 'avancado', days: [{}, {}] }, status: 'rejected', review_note: 'Volume alto', live: false, hidden: false, adoptions: 0 },
      { id: 'p3', draft: { name: 'No ar C', level: 'intermediario', days: [{}] }, status: 'approved', live: true, hidden: false, adoptions: 7 },
    ],
  };

  it('não aparece para quem não é influenciador', async () => {
    h.fetchMyInfluencer.mockResolvedValue(null);
    const { container } = render(<ProfileInfluencerSection toast={vi.fn()} />);
    await waitFor(() => expect(h.fetchMyInfluencer).toHaveBeenCalled());
    expect(container.innerHTML).toBe('');
  });

  it('mostra a situação de cada programa e envia para revisão', async () => {
    h.fetchMyInfluencer.mockResolvedValue(ME);
    h.submitProgram.mockResolvedValue(undefined);
    const toast = vi.fn();
    render(<ProfileInfluencerSection toast={toast} />);
    fireEvent.click(await screen.findByText('Meus programas'));
    expect(screen.getByText('Rascunho')).toBeTruthy();
    expect(screen.getByText(/Volume alto/)).toBeTruthy();
    expect(screen.getByText('No ar')).toBeTruthy();
    expect(screen.getByText(/7 começaram/)).toBeTruthy();
    fireEvent.click(screen.getAllByText('Enviar para revisão')[0]);
    await waitFor(() => expect(h.submitProgram).toHaveBeenCalledWith('p1'));
    expect(toast).toHaveBeenCalledWith('📨 Enviado para revisão');
  });

  it('salva o perfil da página', async () => {
    h.fetchMyInfluencer.mockResolvedValue(ME);
    h.saveInfluencerProfile.mockResolvedValue(undefined);
    render(<ProfileInfluencerSection toast={vi.fn()} />);
    fireEvent.click(await screen.findByText('Minha página'));
    fireEvent.change(screen.getByLabelText('Bio'), { target: { value: 'Nova bio' } });
    fireEvent.click(screen.getByText('Salvar página'));
    await waitFor(() => expect(h.saveInfluencerProfile).toHaveBeenCalledWith({ bio: 'Nova bio', instagram: 'ana.fit', accent: '#ff3366' }));
  });

  it('novo programa: valida e salva o rascunho', async () => {
    h.fetchMyInfluencer.mockResolvedValue({ ...ANA, programs: [] });
    h.saveProgram.mockResolvedValue('p9');
    render(<ProfileInfluencerSection toast={vi.fn()} />);
    fireEvent.click(await screen.findByText('Meus programas'));
    fireEvent.click(screen.getByText('+ Novo programa'));
    fireEvent.click(screen.getByText('💾 Salvar rascunho'));
    expect(screen.getByRole('alert').textContent).toMatch(/nome/i);
    fireEvent.change(screen.getByLabelText('Nome do programa'), { target: { value: 'Pernas' } });
    fireEvent.click(screen.getByRole('button', { name: 'Seg' }));
    fireEvent.change(screen.getByPlaceholderText('Exercício'), { target: { value: 'Agachamento' } });
    fireEvent.click(screen.getByText('💾 Salvar rascunho'));
    await waitFor(() => expect(h.saveProgram).toHaveBeenCalled());
    const [id, program] = h.saveProgram.mock.calls[0];
    expect(id).toBeUndefined();
    expect(program).toMatchObject({ name: 'Pernas', level: 'iniciante', days: [{ dia: 'Segunda', exercicios: [{ nome: 'Agachamento' }] }] });
  });
});
