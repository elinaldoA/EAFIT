// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import SoftFailNotice from './SoftFailNotice';
import { clearSoftFailures, softFail } from '../lib/softFail';

function Go() {
  const navigate = useNavigate();
  return <button onClick={() => navigate('/outra')}>ir</button>;
}
function setup() {
  return render(<MemoryRouter><SoftFailNotice /><Go /></MemoryRouter>);
}

beforeEach(() => { clearSoftFailures(); vi.spyOn(console, 'warn').mockImplementation(() => {}); });

describe('SoftFailNotice', () => {
  it('não aparece sem falha', () => {
    setup();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('avisa quais dados não carregaram, sem repetir a mesma origem', async () => {
    setup();
    await act(async () => {
      await Promise.reject(new Error('x')).catch(softFail('Perfil: preferências'));
      await Promise.reject(new Error('x')).catch(softFail('Perfil: preferências'));
      await Promise.reject(new Error('y')).catch(softFail('Trainers: agenda'));
    });
    const box = screen.getByRole('status');
    expect(box.textContent).toContain('Perfil: preferências · Trainers: agenda');
    expect(box.textContent.match(/Perfil: preferências/g)).toHaveLength(1);
  });

  it('Fechar e trocar de tela limpam o aviso', async () => {
    setup();
    await act(async () => { await Promise.reject(new Error('x')).catch(softFail('A')); });
    fireEvent.click(screen.getByText('Fechar'));
    expect(screen.queryByRole('status')).toBeNull();
    await act(async () => { await Promise.reject(new Error('x')).catch(softFail('B')); });
    expect(screen.getByRole('status')).toBeTruthy();
    fireEvent.click(screen.getByText('ir'));
    expect(screen.queryByRole('status')).toBeNull();
  });
});
