import { useRef } from 'react';
import { ModeCards, type ModeHandlers } from './ModeSelect';

export interface ResumeInfo {
  label: string;
  stage: string;
  savedAt: string;
}

export function Home({ modes, resume, onResume, onDiscard, onExport, onImport, message, onAchievements }: {
  modes: ModeHandlers;
  /** Copa ou cenário em andamento, se houver. */
  resume?: ResumeInfo;
  onResume: () => void;
  onDiscard: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
  message?: { ok: boolean; text: string };
  onAchievements: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  return (
    <div className="home">
      <h1>
        NOVO <span style={{ color: 'var(--accent)' }}>Football Manager</span>
      </h1>
      <p>
        Escolha uma seleção de uma era histórica, convoque, defina a tática e dispute uma Copa de 32 seleções. A força vem de resultados reais; os jogadores são todos fictícios.
      </p>
      {resume && (
        <div className="panel resume" style={{ maxWidth: 900, margin: '0 auto 14px', textAlign: 'left' }}>
          <div className="row between">
            <div>
              <b>Continuar: {resume.label}</b>
              <div className="muted" style={{ fontSize: '.88rem' }}>{resume.stage} · salvo em {resume.savedAt}</div>
            </div>
            <div className="row">
              <button className="primary" onClick={onResume}>Continuar</button>
              <button className="ghost" onClick={onDiscard}>Descartar</button>
            </div>
          </div>
        </div>
      )}
      <div style={{ textAlign: 'left', maxWidth: 900, margin: '0 auto 18px' }}>
        <ModeCards {...modes} />
      </div>
      <div className="row">
        <button className="ghost" onClick={onAchievements}>
          Conquistas e ranking
        </button>
        <button className="ghost" onClick={onExport} title="Baixa um arquivo com todo o seu progresso (carreira, conquistas, Copa em andamento, nomes)">
          Exportar save
        </button>
        <button className="ghost" onClick={() => fileInput.current?.click()} title="Carrega um arquivo de save exportado antes (substitui o progresso deste navegador)">
          Importar save
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          aria-label="Arquivo de save"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) onImport(f);
          }}
        />
      </div>
      {message && <p className={message.ok ? 'muted' : 'bad'} role="status" style={{ marginTop: 10 }}>{message.text}</p>}
      <p className="muted legal">
        Projeto de fãs, sem vínculo com a FIFA, confederações, federações ou jogadores. As seleções e épocas aparecem só como referência histórica (a força vem de resultados públicos); todos os jogadores são fictícios.
      </p>
    </div>
  );
}
