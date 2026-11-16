// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import SportPicker from './SportPicker';

afterEach(cleanup);

const mods = [
  { id: 'musculacao', label: 'Musculação', icon: '🏋️', blurb: 'Treino na academia' },
  { id: 'corrida', label: 'Corrida', icon: '🏃', blurb: 'GPS e voz a cada km' },
];

describe('SportPicker', () => {
  it('com um esporte só não mostra nada', () => {
    const { container } = render(<SportPicker id="x" value="musculacao" onChange={() => {}} modules={[mods[0]]} />);
    expect(container.innerHTML).toBe('');
  });

  it('mostra um cartão por esporte com a frase e avisa a escolha', () => {
    const onChange = vi.fn();
    render(<SportPicker id="x" value="musculacao" onChange={onChange} modules={mods} />);
    expect(screen.getByRole('radiogroup', { name: 'Qual é a sua vibe?' })).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(screen.getByText('GPS e voz a cada km')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: /Corrida/ }));
    expect(onChange).toHaveBeenCalledWith('corrida');
  });

  it('marca só o cartão escolhido, e nenhum quando o valor é vazio', () => {
    const { rerender } = render(<SportPicker id="x" value="corrida" onChange={() => {}} modules={mods} />);
    expect(screen.getByRole('radio', { name: /Corrida/ }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: /Musculação/ }).getAttribute('aria-checked')).toBe('false');
    rerender(<SportPicker id="x" value="" onChange={() => {}} modules={mods} />);
    expect(screen.getAllByRole('radio').every(r => r.getAttribute('aria-checked') === 'false')).toBe(true);
  });
});
