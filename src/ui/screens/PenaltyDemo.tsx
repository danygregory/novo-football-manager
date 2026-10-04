import { useState } from 'react';
import type { Dive, PenaltyInfo, PenaltyOutcome, PenaltyZone } from '../../engine/types';
import { PenaltyChoice, PenaltyScene, ShootoutBoard, type Mark } from './PenaltyScreen';

/** Página de depuração (abra com #penalty-demo): testa cada resultado da cena de pênalti sem precisar chegar a um mata-mata. */
export function PenaltyDemo() {
  const [zone, setZone] = useState<PenaltyZone>('RH');
  const [dive, setDive] = useState<Dive>('L');
  const [outcome, setOutcome] = useState<PenaltyOutcome>('goal');
  const [short, setShort] = useState(false);
  const [run, setRun] = useState(0);
  const [choose, setChoose] = useState<'aim' | 'dive' | undefined>();
  const [picked, setPicked] = useState('');
  const result: PenaltyInfo = { zone, dive, outcome };
  const marks: [Mark[], Mark[]] = [['goal', 'miss', 'goal'], ['goal', 'goal']];
  return (
    <div className="panel" style={{ maxWidth: 900, margin: '20px auto' }}>
      <h3>Demonstração da cobrança de pênalti</h3>
      <div className="row" style={{ marginBottom: 8 }}>
        <label>Zona <select value={zone} onChange={(e) => setZone(e.target.value as PenaltyZone)}>{['LH', 'LL', 'CH', 'CL', 'RH', 'RL'].map((z) => <option key={z}>{z}</option>)}</select></label>
        <label>Mergulho <select value={dive} onChange={(e) => setDive(e.target.value as Dive)}>{['L', 'C', 'R'].map((z) => <option key={z}>{z}</option>)}</select></label>
        <label>Resultado <select value={outcome} onChange={(e) => setOutcome(e.target.value as PenaltyOutcome)}>{['goal', 'save', 'miss', 'post'].map((z) => <option key={z}>{z}</option>)}</select></label>
        <label><input type="checkbox" checked={short} onChange={(e) => setShort(e.target.checked)} /> versão curta</label>
        <button className="primary" onClick={() => { setChoose(undefined); setRun((n) => n + 1); }}>Cobrar</button>
        <button onClick={() => setChoose('aim')}>Escolher canto</button>
        <button onClick={() => setChoose('dive')}>Escolher lado do goleiro</button>
      </div>
      <ShootoutBoard names={['Brasil', 'Alemanha']} marks={marks} />
      <PenaltyScene takerName="Tadeu Vilzinho" keeperName="Fabián Olineondo" takerColor="#f2c744" keeperColor="#3b82d6" result={run ? result : undefined} short={short} playKey={run} />
      {picked && <p className="muted">Escolha feita: {picked}</p>}
      {choose && <PenaltyChoice kind={choose} takerName="Tadeu Vilzinho" keeperName="Fabián Olineondo" takerColor="#f2c744" keeperColor="#3b82d6" busy={false} shootout onChoose={(c) => { setPicked(`${choose}: ${c}`); setChoose(undefined); }} onAutoRest={() => { setPicked('automático nas próximas'); setChoose(undefined); }} />}
    </div>
  );
}
