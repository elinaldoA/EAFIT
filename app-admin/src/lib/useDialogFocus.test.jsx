// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { useRef, useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { useDialogFocus } from './useDialogFocus';

function Demo() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useDialogFocus(ref, open);
  return (
    <div>
      <button onClick={() => setOpen(true)}>abrir</button>
      {open && (
        <div ref={ref}>
          <button autoFocus>primeiro</button>
          <button onClick={() => setOpen(false)}>último</button>
        </div>
      )}
    </div>
  );
}

describe('useDialogFocus', () => {
  it('prende o Tab dentro do diálogo e devolve o foco ao fechar', () => {
    render(<Demo />);
    const opener = screen.getByText('abrir');
    opener.focus();
    fireEvent.click(opener);
    const first = screen.getByText('primeiro');
    const last = screen.getByText('último');
    first.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
    fireEvent.click(last);
    expect(document.activeElement).toBe(opener);
  });
});
