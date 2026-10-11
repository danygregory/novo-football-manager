import { useId, useState, type ReactNode } from 'react';
import { definitionOf, type GlossaryTerm } from '../glossary';

/**
 * Termo com explicação: aparece ao passar o mouse, ao focar (Tab ou toque) e some com Escape. A explicação é lida por leitor de tela
 * (`aria-describedby`). Não usar dentro de botão ou link (um controle dentro de outro).
 */
export function Term({ term, children }: { term: GlossaryTerm; children?: ReactNode }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <span
      className="term"
      tabIndex={0}
      aria-describedby={open ? id : undefined}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
    >
      {children ?? term}
      {open && (
        <span role="tooltip" id={id} className="term-tip">
          {definitionOf(term)}
        </span>
      )}
    </span>
  );
}
