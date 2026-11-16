import { describe, expect, it, vi } from 'vitest';
import {
  START_ATTEMPTS,
  injectAndStartPicker,
  type InjectDeps,
} from '../../../src/entrypoints/popup/lib/inject';
import { CONTENT_SCRIPT_FILE, contentScriptFile } from '../../../src/shared/content-script';

function deps(over: Partial<InjectDeps> = {}): InjectDeps {
  return {
    executeScript: vi.fn(() => Promise.resolve([])),
    startPicker: vi.fn(() => Promise.resolve()),
    sleep: vi.fn(() => Promise.resolve()),
    scriptFile: 'content-scripts/content.js',
    ...over,
  };
}

describe('injectAndStartPicker', () => {
  it('injeta o arquivo na aba e só então liga a captura', async () => {
    const order: string[] = [];
    const d = deps({
      executeScript: vi.fn(() => {
        order.push('inject');
        return Promise.resolve([]);
      }),
      startPicker: vi.fn(() => {
        order.push('start');
        return Promise.resolve();
      }),
    });
    await injectAndStartPicker(7, d);
    expect(order).toEqual(['inject', 'start']);
    expect(d.executeScript).toHaveBeenCalledWith({
      target: { tabId: 7, allFrames: true },
      files: ['content-scripts/content.js'],
    });
  });

  it('se a injeção em todos os frames falha, tenta só o frame de topo', async () => {
    const executeScript = vi
      .fn<InjectDeps['executeScript']>()
      .mockRejectedValueOnce(new Error('iframe sem permissão'))
      .mockResolvedValue([]);
    const d = deps({ executeScript });
    await injectAndStartPicker(7, d);
    expect(executeScript).toHaveBeenNthCalledWith(2, {
      target: { tabId: 7 },
      files: ['content-scripts/content.js'],
    });
    expect(d.startPicker).toHaveBeenCalled();
  });

  it('tenta de novo enquanto o content script ainda não ouve', async () => {
    const startPicker = vi
      .fn<InjectDeps['startPicker']>()
      .mockRejectedValueOnce(new Error('sem receptor'))
      .mockRejectedValueOnce(new Error('sem receptor'))
      .mockResolvedValue(undefined);
    const d = deps({ startPicker });
    await injectAndStartPicker(1, d);
    expect(startPicker).toHaveBeenCalledTimes(3);
    expect(d.sleep).toHaveBeenCalledTimes(2);
  });

  it('desiste depois de várias tentativas', async () => {
    const d = deps({ startPicker: vi.fn(() => Promise.reject(new Error('nada'))) });
    await expect(injectAndStartPicker(1, d)).rejects.toThrow('nada');
    expect(d.startPicker).toHaveBeenCalledTimes(START_ATTEMPTS);
  });

  it('propaga a falha da injeção (página interna do Chrome) sem enviar mensagem', async () => {
    const d = deps({ executeScript: vi.fn(() => Promise.reject(new Error('proibido'))) });
    await expect(injectAndStartPicker(1, d)).rejects.toThrow('proibido');
    expect(d.startPicker).not.toHaveBeenCalled();
  });
});

describe('contentScriptFile', () => {
  it('usa o caminho padrão do WXT quando o manifest não declara content script', () => {
    expect(contentScriptFile({})).toBe(CONTENT_SCRIPT_FILE);
  });
  it('usa o declarado no manifest (build e2e)', () => {
    expect(contentScriptFile({ content_scripts: [{ js: ['content-scripts/x.js'] }] })).toBe(
      'content-scripts/x.js',
    );
  });
});
