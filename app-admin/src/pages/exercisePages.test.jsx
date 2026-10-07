// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { lib, med } = vi.hoisted(() => ({
  lib: { fetchLibrary: vi.fn(), saveExercise: vi.fn(), deleteExercise: vi.fn() },
  med: { fetchMediaScreen: vi.fn(), uploadExerciseMedia: vi.fn(), removeExerciseMedia: vi.fn(), publicUrl: vi.fn(p => `https://cdn/${p}`) },
}));

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../context/useAdminAuth', () => ({ useAdminAuth: () => ({ adminUser: { id: 'adm1' } }) }));
vi.mock('../lib/exerciseLibrary', async orig => ({ ...(await orig()), ...lib }));
vi.mock('../lib/exerciseMedia', async orig => ({ ...(await orig()), ...med }));

import ExerciseLibrary from './ExerciseLibrary';
import ExerciseMedia from './ExerciseMedia';

const wrap = ui => render(<MemoryRouter>{ui}</MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  window.scrollTo = vi.fn();
});

describe('ExerciseLibrary', () => {
  const row = (over = {}) => ({
    id: 'e1', nome: 'Supino reto', grupo_muscular: 'peito', equipamento: 'barra', tipo: 'composto', nivel_minimo: 'iniciante',
    series: '3', reps: '8-12', descanso: '60s', tecnica: '', is_post_workout: false,
    has_media: false, plans_count: 0, discomfort_count: 0, ...over,
  });
  const rows = [
    row(),
    row({ id: 'e2', nome: 'Rosca direta', grupo_muscular: 'biceps', equipamento: '', tipo: 'isolado', nivel_minimo: 'avancado', has_media: true, plans_count: 4, discomfort_count: 2 }),
    row({ id: 'e3', nome: 'Prancha', grupo_muscular: 'core', tipo: 'cardio', is_post_workout: true }),
  ];

  beforeEach(() => {
    lib.fetchLibrary.mockResolvedValue(rows);
    lib.saveExercise.mockResolvedValue();
    lib.deleteExercise.mockResolvedValue();
  });

  it('lista exercícios com prescrição, mídia e contagens', async () => {
    wrap(<ExerciseLibrary />);
    expect(await screen.findByText('Supino reto')).toBeTruthy();
    expect(screen.getAllByText('3×8-12 · 60s')).toHaveLength(3);
    expect(screen.getByText('própria')).toBeTruthy();
    expect(screen.getByText('barra · pós-treino')).toBeTruthy();
    expect(screen.getByText('3 exercício(s) no filtro.')).toBeTruthy();
  });

  it('mostra erro de carregamento', async () => {
    lib.fetchLibrary.mockRejectedValue(new Error('rls'));
    wrap(<ExerciseLibrary />);
    expect(await screen.findByText('rls')).toBeTruthy();
  });

  it('filtra por busca, grupo, tipo, nível e situação', async () => {
    wrap(<ExerciseLibrary />);
    await screen.findByText('Supino reto');
    fireEvent.change(screen.getByPlaceholderText('Buscar por nome…'), { target: { value: 'rosca' } });
    expect(screen.queryByText('Supino reto')).toBeNull();
    expect(screen.getByText('Rosca direta')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('Buscar por nome…'), { target: { value: '' } });

    fireEvent.change(screen.getByLabelText('Grupo muscular'), { target: { value: 'core' } });
    expect(screen.getByText('Prancha')).toBeTruthy();
    expect(screen.queryByText('Supino reto')).toBeNull();
    fireEvent.change(screen.getByLabelText('Grupo muscular'), { target: { value: '' } });

    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'isolado' } });
    expect(screen.getByText('Rosca direta')).toBeTruthy();
    expect(screen.queryByText('Prancha')).toBeNull();
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: '' } });

    fireEvent.change(screen.getByLabelText('Nível mínimo'), { target: { value: 'avancado' } });
    expect(screen.queryByText('Supino reto')).toBeNull();
    fireEvent.change(screen.getByLabelText('Nível mínimo'), { target: { value: '' } });

    fireEvent.change(screen.getByLabelText('Situação'), { target: { value: 'dor' } });
    expect(screen.getByText('Rosca direta')).toBeTruthy();
    expect(screen.queryByText('Prancha')).toBeNull();
    fireEvent.change(screen.getByLabelText('Situação'), { target: { value: 'sem-uso' } });
    expect(screen.queryByText('Rosca direta')).toBeNull();
  });

  it('mostra vazio quando o filtro não encontra nada', async () => {
    wrap(<ExerciseLibrary />);
    await screen.findByText('Supino reto');
    fireEvent.change(screen.getByPlaceholderText('Buscar por nome…'), { target: { value: 'zzz' } });
    expect(screen.getByText('Nenhum exercício com esses filtros.')).toBeTruthy();
  });

  it('pagina de 50 em 50', async () => {
    lib.fetchLibrary.mockResolvedValue(Array.from({ length: 60 }, (_, i) => row({ id: `x${i}`, nome: `Ex ${i}` })));
    wrap(<ExerciseLibrary />);
    await screen.findByText('Ex 0');
    expect(screen.queryByText('Ex 55')).toBeNull();
    fireEvent.click(screen.getByText('Mostrar mais (10 restantes)'));
    expect(screen.getByText('Ex 55')).toBeTruthy();
  });

  it('valida campos obrigatórios ao criar', async () => {
    wrap(<ExerciseLibrary />);
    await screen.findByText('Supino reto');
    fireEvent.click(screen.getByText('Novo exercício'));
    fireEvent.click(screen.getByText('Criar exercício'));
    expect(await screen.findByText('Informe o nome.')).toBeTruthy();
    expect(screen.getByText('Informe o grupo muscular.')).toBeTruthy();
    expect(lib.saveExercise).not.toHaveBeenCalled();
  });

  it('cria um exercício com textos normalizados e recarrega', async () => {
    wrap(<ExerciseLibrary />);
    await screen.findByText('Supino reto');
    fireEvent.click(screen.getByText('Novo exercício'));
    fireEvent.change(screen.getByLabelText(/^Nome/), { target: { value: '  Remada  ' } });
    fireEvent.change(screen.getByLabelText('Grupo muscular', { selector: 'input' }), { target: { value: ' Costas ' } });
    fireEvent.click(screen.getByText('Criar exercício'));
    await waitFor(() => expect(lib.saveExercise).toHaveBeenCalled());
    const [id, value] = lib.saveExercise.mock.calls[0];
    expect(id).toBeUndefined();
    expect(value).toMatchObject({ nome: 'Remada', grupo_muscular: 'costas', tipo: 'composto' });
    expect(await screen.findByText('Salvo.')).toBeTruthy();
    expect(lib.fetchLibrary).toHaveBeenCalledTimes(2);
  });

  it('edita e pede confirmação ao renomear exercício em uso', async () => {
    window.confirm.mockReturnValue(false);
    wrap(<ExerciseLibrary />);
    await screen.findByText('Rosca direta');
    fireEvent.click(screen.getAllByText('Editar')[1]);
    fireEvent.change(screen.getByLabelText(/^Nome/), { target: { value: 'Rosca martelo' } });
    expect(screen.getByText(/está em 4 plano\(s\) e tem mídia própria/)).toBeTruthy();
    fireEvent.click(screen.getByText('Salvar'));
    expect(window.confirm).toHaveBeenCalled();
    expect(lib.saveExercise).not.toHaveBeenCalled();
    window.confirm.mockReturnValue(true);
    fireEvent.click(screen.getByText('Salvar'));
    await waitFor(() => expect(lib.saveExercise).toHaveBeenCalledWith('e2', expect.objectContaining({ nome: 'Rosca martelo' })));
  });

  it('mostra erro amigável ao salvar nome duplicado', async () => {
    lib.saveExercise.mockRejectedValue({ code: '23505', message: 'dup' });
    wrap(<ExerciseLibrary />);
    await screen.findByText('Supino reto');
    fireEvent.click(screen.getByText('Novo exercício'));
    fireEvent.change(screen.getByLabelText(/^Nome/), { target: { value: 'Supino reto' } });
    fireEvent.change(screen.getByLabelText('Grupo muscular', { selector: 'input' }), { target: { value: 'peito' } });
    fireEvent.click(screen.getByText('Criar exercício'));
    expect(await screen.findByText('Erro: Já existe um exercício com esse nome.')).toBeTruthy();
  });

  it('cancelar fecha o formulário', async () => {
    wrap(<ExerciseLibrary />);
    await screen.findByText('Supino reto');
    fireEvent.click(screen.getByText('Novo exercício'));
    fireEvent.click(screen.getByText('Cancelar'));
    expect(screen.queryByText('Criar exercício')).toBeNull();
  });

  it('exclui avisando sobre uso em planos', async () => {
    wrap(<ExerciseLibrary />);
    await screen.findByText('Rosca direta');
    const tr = screen.getByText('Rosca direta').closest('tr');
    fireEvent.click(within(tr).getByText('Excluir'));
    expect(window.confirm.mock.calls[0][0]).toContain('4 plano(s)');
    await waitFor(() => expect(lib.deleteExercise).toHaveBeenCalledWith('e2'));
    expect(await screen.findByText('"Rosca direta" excluído.')).toBeTruthy();
  });

  it('não exclui se cancelar e mostra erro se falhar', async () => {
    window.confirm.mockReturnValue(false);
    wrap(<ExerciseLibrary />);
    await screen.findByText('Prancha');
    const tr = screen.getByText('Prancha').closest('tr');
    fireEvent.click(within(tr).getByText('Excluir'));
    expect(lib.deleteExercise).not.toHaveBeenCalled();
    window.confirm.mockReturnValue(true);
    lib.deleteExercise.mockRejectedValue(new Error('row-level security'));
    fireEvent.click(within(tr).getByText('Excluir'));
    expect(await screen.findByText('Erro: Seu papel não permite alterar a biblioteca.')).toBeTruthy();
  });
});

describe('ExerciseMedia', () => {
  const rows = [
    { nome: 'Supino reto', grupo: 'peito', media: { media_type: 'imagem', storage_path: 'supino.gif' }, padrao: 'imagens' },
    { nome: 'Agachamento', grupo: 'perna_inferior', media: null, padrao: 'video' },
    { nome: 'Remada', grupo: 'costas', media: null, padrao: null },
    { nome: 'Variação X', grupo: null, media: { media_type: 'video', storage_path: 'x.mp4' }, padrao: null },
  ];

  beforeEach(() => {
    med.fetchMediaScreen.mockResolvedValue(rows);
    med.uploadExerciseMedia.mockResolvedValue();
    med.removeExerciseMedia.mockResolvedValue();
  });

  const pickFile = (file) => {
    const input = document.querySelector('input[type="file"]');
    fireEvent.change(input, { target: { files: [file] } });
  };

  it('mostra resumo, grupos e a demonstração de cada linha', async () => {
    wrap(<ExerciseMedia />);
    expect(await screen.findByText('Supino reto')).toBeTruthy();
    expect(screen.getByText(/2 de 4 com mídia própria · 2 ainda sem vídeo/)).toBeTruthy();
    expect(screen.getByText('perna inferior')).toBeTruthy();
    expect(screen.getByText('fora da biblioteca')).toBeTruthy();
    expect(screen.getByText('Padrão: vídeo')).toBeTruthy();
    expect(screen.getByText('Sem demonstração')).toBeTruthy();
    expect(document.querySelector('img.media-thumb').getAttribute('src')).toBe('https://cdn/supino.gif');
    expect(document.querySelector('video.media-thumb')).toBeTruthy();
  });

  it('mostra erro de carregamento', async () => {
    med.fetchMediaScreen.mockRejectedValue(new Error('rls'));
    wrap(<ExerciseMedia />);
    expect(await screen.findByText('rls')).toBeTruthy();
  });

  it('filtra por busca e por situação da mídia', async () => {
    wrap(<ExerciseMedia />);
    await screen.findByText('Supino reto');
    fireEvent.click(screen.getByRole('button', { name: 'Com mídia própria' }));
    expect(screen.queryByText('Agachamento')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sem mídia própria' }));
    expect(screen.getByText('Agachamento')).toBeTruthy();
    expect(screen.queryByText('Supino reto')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sem vídeo' }));
    expect(screen.getByText('Remada')).toBeTruthy();
    expect(screen.queryByText('Agachamento')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Todos' }));
    fireEvent.change(screen.getByLabelText('Buscar exercício'), { target: { value: 'zzz' } });
    expect(screen.getByText('Nenhum exercício com esse filtro.')).toBeTruthy();
  });

  it('envia a mídia escolhida para a linha correta', async () => {
    wrap(<ExerciseMedia />);
    await screen.findByText('Agachamento');
    const tr = screen.getByText('Agachamento').closest('tr');
    fireEvent.click(within(tr).getByText('Enviar'));
    const file = new File(['x'], 'a.mp4', { type: 'video/mp4' });
    pickFile(file);
    await waitFor(() => expect(med.uploadExerciseMedia).toHaveBeenCalledWith({ nome: 'Agachamento', file, previousPath: undefined, adminId: 'adm1' }));
    expect(await screen.findByText(/Mídia de "Agachamento" salva/)).toBeTruthy();
  });

  it('troca mídia existente informando o caminho anterior', async () => {
    wrap(<ExerciseMedia />);
    await screen.findByText('Supino reto');
    const tr = screen.getByText('Supino reto').closest('tr');
    fireEvent.click(within(tr).getByText('Trocar'));
    pickFile(new File(['x'], 'a.gif', { type: 'image/gif' }));
    await waitFor(() => expect(med.uploadExerciseMedia).toHaveBeenCalledWith(expect.objectContaining({ previousPath: 'supino.gif' })));
  });

  it('recusa arquivo inválido sem enviar', async () => {
    wrap(<ExerciseMedia />);
    await screen.findByText('Agachamento');
    fireEvent.click(within(screen.getByText('Agachamento').closest('tr')).getByText('Enviar'));
    pickFile(new File(['x'], 'a.pdf', { type: 'application/pdf' }));
    expect(await screen.findByText(/Formato não aceito/)).toBeTruthy();
    expect(med.uploadExerciseMedia).not.toHaveBeenCalled();
  });

  it('mostra erro de envio', async () => {
    med.uploadExerciseMedia.mockRejectedValue(new Error('storage'));
    wrap(<ExerciseMedia />);
    await screen.findByText('Agachamento');
    fireEvent.click(within(screen.getByText('Agachamento').closest('tr')).getByText('Enviar'));
    pickFile(new File(['x'], 'a.mp4', { type: 'video/mp4' }));
    expect(await screen.findByText('Não foi possível enviar: storage')).toBeTruthy();
  });

  it('remove com confirmação em dois passos', async () => {
    wrap(<ExerciseMedia />);
    await screen.findByText('Supino reto');
    const tr = screen.getByText('Supino reto').closest('tr');
    fireEvent.click(within(tr).getByText('Remover'));
    fireEvent.click(within(tr).getByText('Cancelar'));
    expect(med.removeExerciseMedia).not.toHaveBeenCalled();
    fireEvent.click(within(tr).getByText('Remover'));
    fireEvent.click(within(tr).getByText('Confirmar remoção'));
    await waitFor(() => expect(med.removeExerciseMedia).toHaveBeenCalledWith({ nome: 'Supino reto', path: 'supino.gif', adminId: 'adm1' }));
    expect(await screen.findByText(/Mídia de "Supino reto" removida/)).toBeTruthy();
  });

  it('nome fora da biblioteca: botão só habilita com texto e usa o nome normalizado', async () => {
    wrap(<ExerciseMedia />);
    await screen.findByText('Supino reto');
    const send = screen.getByText('Enviar mídia');
    expect(send.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Nome do exercício fora da biblioteca'), { target: { value: 'Exercício Novo' } });
    expect(send.disabled).toBe(false);
    fireEvent.click(send);
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    pickFile(file);
    await waitFor(() => expect(med.uploadExerciseMedia).toHaveBeenCalledWith(expect.objectContaining({ nome: 'Exercício Novo', file })));
  });
});
