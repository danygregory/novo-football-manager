import { useState } from 'react';
import { renderCard, type CardData } from '../../share/card';

type State = 'idle' | 'copied' | 'busy' | 'err';

/** Compartilhar o resultado: folha nativa do sistema (com a imagem) quando existe; senão baixar a imagem e copiar o texto. */
export function ShareBar({ text, card, filename, hint }: { text: string; card: CardData; filename: string; hint?: string }) {
  const [state, setState] = useState<State>('idle');
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      setState('err');
    }
  };

  const download = async () => {
    setState('busy');
    try {
      const blob = await renderCard(card);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setState('idle');
    } catch {
      setState('err');
    }
  };

  const share = async () => {
    setState('busy');
    try {
      const blob = await renderCard(card);
      const file = new File([blob], filename, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ text, files: [file] });
      else await navigator.share({ text });
      setState('idle');
    } catch (e) {
      // o usuário fechar a folha de compartilhar não é erro
      setState((e as Error).name === 'AbortError' ? 'idle' : 'err');
    }
  };

  return (
    <div className="panel share-bar" style={{ textAlign: 'left', margin: '14px 0' }}>
      <h3>Compartilhar</h3>
      <pre className="share">{text}</pre>
      <div className="row">
        {canNativeShare && <button className="primary" disabled={state === 'busy'} onClick={() => void share()}>Compartilhar…</button>}
        <button className={canNativeShare ? '' : 'primary'} disabled={state === 'busy'} onClick={() => void download()}>Baixar imagem</button>
        <button onClick={() => void copy()}>{state === 'copied' ? 'Copiado!' : 'Copiar texto e link'}</button>
        {state === 'err' && <span className="bad" role="alert">Não deu para compartilhar por aqui; selecione o texto acima.</span>}
      </div>
      <div className="muted" style={{ fontSize: '.85rem', marginTop: 6 }}>{hint ?? 'Só a campanha, os pontos e o link do desafio. Nenhum dado pessoal sai do seu navegador.'}</div>
    </div>
  );
}
