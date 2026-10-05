import { useState } from 'react';

function extensionFor(type: string): string {
  return type.includes('mp4') ? 'mp4' : 'webm';
}

/** Salvar (ou compartilhar) o clipe do último gol: vídeo do replay gravado no próprio navegador. */
export function ClipButtons({ clip }: { clip: { blob: Blob; label: string } }) {
  const [err, setErr] = useState(false);
  const name = `novo-fm-gol-${clip.label}.${extensionFor(clip.blob.type)}`;
  const canShare = typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([clip.blob], name, { type: clip.blob.type })] });

  const save = () => {
    const url = URL.createObjectURL(clip.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };
  const share = async () => {
    try {
      await navigator.share({ files: [new File([clip.blob], name, { type: clip.blob.type })], text: 'Olha esse gol no NOVO Football Manager' });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setErr(true);
    }
  };

  return (
    <div className="clip-buttons row">
      <button className="primary" onClick={save}>🎬 Salvar clipe do gol</button>
      {canShare && <button onClick={() => void share()}>Compartilhar clipe</button>}
      {err && <span className="bad" role="alert">Não deu para compartilhar o clipe.</span>}
    </div>
  );
}
