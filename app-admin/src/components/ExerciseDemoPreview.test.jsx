// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

vi.mock('../lib/supabase', () => ({ db: {} }));

import ExerciseDemoPreview from './ExerciseDemoPreview';

afterEach(cleanup);

describe('ExerciseDemoPreview', () => {
  it('mostra o botão e a mídia do app para exercício com demonstração', () => {
    const { container } = render(<ExerciseDemoPreview nome="Supino Reto com Barra" custom={{}} />);
    fireEvent.click(screen.getByText('▶ Ver execução'));
    expect(screen.getByText('▶ Ocultar execução')).toBeTruthy();
    expect(container.querySelector('video, img, iframe')).toBeTruthy();
  });

  it('prefere a mídia própria enviada pelo admin', () => {
    const { container } = render(<ExerciseDemoPreview nome="Supino Reto com Barra" custom={{ 'Supino Reto com Barra': { url: 'https://x/y.mp4', type: 'video' } }} />);
    fireEvent.click(screen.getByText('▶ Ver execução'));
    expect(container.querySelector('video').getAttribute('src')).toBe('https://x/y.mp4');
  });

  it('não renderiza nada sem demonstração', () => {
    const { container } = render(<ExerciseDemoPreview nome="Exercicio Inventado Xyz" custom={{}} />);
    expect(container.textContent).toBe('');
  });
});
