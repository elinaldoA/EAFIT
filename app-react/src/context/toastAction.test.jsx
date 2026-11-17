import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ToastProvider } from './ToastContext';
import { useToast } from './useToast';

function Btn({ onUndo }) {
  const toast = useToast();
  return <button onClick={() => toast('Zerado', 6000, { action: { label: 'Desfazer', onClick: onUndo } })}>go</button>;
}

describe('toast com ação', () => {
  it('mostra Desfazer e chama a ação uma vez', () => {
    const onUndo = vi.fn();
    render(<ToastProvider><Btn onUndo={onUndo} /></ToastProvider>);
    fireEvent.click(screen.getByText('go'));
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });
});
