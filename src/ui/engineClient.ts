import type { RequestType, Requests, Responses } from '../engine/worker';

/** Cliente do Web Worker do motor, com API de promessas. */
class EngineClient {
  private worker: Worker | undefined;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  private ensure(): Worker {
    if (this.worker) return this.worker;
    const w = new Worker(new URL('../engine/worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (ev: MessageEvent<{ id: number; ok: boolean; result?: unknown; error?: string }>) => {
      const p = this.pending.get(ev.data.id);
      if (!p) return;
      this.pending.delete(ev.data.id);
      if (ev.data.ok) p.resolve(ev.data.result);
      else p.reject(new Error(ev.data.error));
    };
    w.onerror = (ev) => {
      for (const p of this.pending.values()) p.reject(new Error(ev.message));
      this.pending.clear();
    };
    this.worker = w;
    return w;
  }

  call<K extends RequestType>(type: K, payload: Requests[K]): Promise<Responses[K]> {
    const id = this.nextId++;
    return new Promise<Responses[K]>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      // o id da mensagem vem por último: um campo `id` do pedido nunca o sobrescreve
      this.ensure().postMessage({ ...payload, type, id });
    });
  }
}

export const engine = new EngineClient();
