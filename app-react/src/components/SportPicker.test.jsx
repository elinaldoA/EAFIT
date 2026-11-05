// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import SportPicker from './SportPicker';

afterEach(cleanup);

const mods = [
  { id: 'musculacao', label: 'Musculação', icon: '🏋️' },
  { id: 'corrida', label: 'Corrida', icon: '🏃' },
];

describe('SportPicker', () => {
  it('com um esporte só não mostra nada', () => {
    const { container } = render(<SportPicker id="x" value="musculacao" onChange={() => {}} modules={[mods[0]]} />);
    expect(container.innerHTML).toBe('');
  });

  it('lista os esportes e avisa a escolha', () => {
    const onChange = vi.fn();
    render(<SportPicker id="x" value="musculacao" onChange={onChange} modules={mods} />);
    fireEvent.change(screen.getByLabelText('Seu esporte'), { target: { value: 'corrida' } });
    expect(onChange).toHaveBeenCalledWith('corrida');
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });
});
