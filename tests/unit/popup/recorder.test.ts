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
    statics: [],
    ...over,
  };
}

describe('originToRequest', () => {
  it('pede https e http e ignora o que o manifest já cobre', () => {
    expect(originToRequest('https://app.exemplo.com/a/b?x=1')).toBe('https://app.exemplo.com/*');
    expect(originToRequest('http://intranet.exemplo.com:8080/x')).toBe(
      'http://intranet.exemplo.com/*',
    );
    expect(originToRequest('http://localhost:3000/x', ['http://localhost/*'])).toBeNull();
    expect(originToRequest('chrome://extensions/')).toBeNull();
    expect(originToRequest(undefined)).toBeNull();
    expect(originToRequest('https://app.exemplo.com/', ['https://app.exemplo.com/*'])).toBeNull();
  });
});

describe('startRecording', () => {
  it('pede a permissão e envia recorder/start de forma síncrona, sem esperar a permissão', () => {
    const d = deps({ requestPermission: vi.fn(() => new Promise<boolean>(() => {})) });
    void startRecording(7, 'https://app.exemplo.com/p', d);
    expect(d.requestPermission).toHaveBeenCalledWith(['https://app.exemplo.com/*']);
    expect(d.sendStart).toHaveBeenCalledWith(7);
  });

  it('não depende da permissão: negada ou com erro, a gravação segue', async () => {
    const denied = deps({ requestPermission: vi.fn(() => Promise.resolve(false)) });
    await expect(startRecording(7, 'https://app.exemplo.com/', denied)).resolves.toBeUndefined();
    const broken = deps({ requestPermission: vi.fn(() => Promise.reject(new Error('x'))) });
    await expect(startRecording(1, 'https://a.com/', broken)).resolves.toBeUndefined();
    expect(broken.sendStart).toHaveBeenCalled();
  });

  it('pede de uma vez a origem da página e as dos iframes (sem repetir)', async () => {
    const d = deps({
      frameUrls: [
        'https://servicos.exemplo.com/form?f=A',
        'https://app.exemplo.com/outro',
        'about:blank',
      ],
    });
    await startRecording(1, 'https://app.exemplo.com/p', d);
    expect(d.requestPermission).toHaveBeenCalledWith([
      'https://app.exemplo.com/*',
      'https://servicos.exemplo.com/*',
    ]);
  });

  it('não pede permissão sem URL https', async () => {
    const d = deps();
    await startRecording(1, undefined, d);
    expect(d.requestPermission).not.toHaveBeenCalled();
    expect(d.sendStart).toHaveBeenCalledWith(1);
  });

  it('só falha se o recorder/start falhar, com mensagem legível', async () => {
    const d = deps({ sendStart: vi.fn(() => Promise.reject(new Error('sem background'))) });
    await expect(startRecording(1, 'https://a.com/', d)).rejects.toThrow(
      /iniciar a gravação.*sem background/,
    );
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
