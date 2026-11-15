import { describe, expect, it, vi } from 'vitest';
import {
  originToRequest,
  recorderStatus,
  startRecording,
  type StartRecordingDeps,
} from '../../../src/entrypoints/popup/lib/recorder';

function deps(over: Partial<StartRecordingDeps> = {}): StartRecordingDeps {
  return {
    requestPermission: vi.fn(() => Promise.resolve(true)),
    sendStart: vi.fn(() => Promise.resolve({ active: true, count: 0 })),
    executeScript: vi.fn(() => Promise.resolve([])),
    scriptFile: 'content-scripts/content.js',
    statics: [],
    ...over,
  };
}

describe('originToRequest', () => {
  it('só pede https e ignora o que o manifest já cobre', () => {
    expect(originToRequest('https://app.exemplo.com/a/b?x=1')).toBe('https://app.exemplo.com/*');
    expect(originToRequest('http://localhost:3000/x')).toBeNull();
    expect(originToRequest(undefined)).toBeNull();
    expect(originToRequest('https://app.exemplo.com/', ['https://app.exemplo.com/*'])).toBeNull();
  });
});

describe('startRecording', () => {
  it('começa o pedido de permissão de forma síncrona, antes de qualquer await', () => {
    const d = deps();
    void startRecording(7, 'https://app.exemplo.com/p', d);
    expect(d.requestPermission).toHaveBeenCalledWith('https://app.exemplo.com/*');
    expect(d.sendStart).not.toHaveBeenCalled();
  });

  it('inicia a sessão antes de injetar o content script', async () => {
    const order: string[] = [];
    const d = deps({
      requestPermission: vi.fn(() => {
        order.push('perm');
        return Promise.resolve(false); // negada: segue assim mesmo
      }),
      sendStart: vi.fn(() => {
        order.push('start');
        return Promise.resolve({ active: true, count: 0 });
      }),
      executeScript: vi.fn(() => {
        order.push('inject');
        return Promise.resolve([]);
      }),
    });
    await startRecording(7, 'https://app.exemplo.com/', d);
    expect(order).toEqual(['perm', 'start', 'inject']);
    expect(d.executeScript).toHaveBeenCalledWith({
      target: { tabId: 7 },
      files: ['content-scripts/content.js'],
    });
  });

  it('não pede permissão sem URL https e continua mesmo se o pedido falhar', async () => {
    const d = deps();
    await startRecording(1, undefined, d);
    expect(d.requestPermission).not.toHaveBeenCalled();
    const d2 = deps({ requestPermission: vi.fn(() => Promise.reject(new Error('x'))) });
    await expect(startRecording(1, 'https://a.com/', d2)).resolves.toBeUndefined();
    expect(d2.sendStart).toHaveBeenCalled();
  });

  it('erros viram mensagem legível e a injeção não roda se o start falhar', async () => {
    const d = deps({ sendStart: vi.fn(() => Promise.reject(new Error('sem background'))) });
    await expect(startRecording(1, 'https://a.com/', d)).rejects.toThrow(
      /iniciar a gravação.*sem background/,
    );
    expect(d.executeScript).not.toHaveBeenCalled();
    const d2 = deps({ executeScript: vi.fn(() => Promise.reject(new Error('proibido'))) });
    await expect(startRecording(1, 'https://a.com/', d2)).rejects.toThrow(/gravar nesta página/);
  });
});

describe('recorderStatus', () => {
  it('repassa o estado e trata falhas como inativo', async () => {
    expect(await recorderStatus(1, () => Promise.resolve({ active: true, count: 3 }))).toEqual({
      active: true,
      count: 3,
    });
    expect(await recorderStatus(1, () => Promise.reject(new Error('x')))).toEqual({
      active: false,
      count: 0,
    });
    expect(await recorderStatus(1, () => Promise.resolve(undefined as unknown as never))).toEqual({
      active: false,
      count: 0,
    });
  });
});
