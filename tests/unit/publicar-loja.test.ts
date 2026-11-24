import { describe, expect, it } from 'vitest';
import { compareVersions, decidirChrome, decidirFirefox } from '../../scripts/publicar-loja.mjs';

const canal = (v: string) => ({ distributionChannels: [{ crxVersion: v }] });

describe('compareVersions', () => {
  it('compara x.y.z numericamente', () => {
    expect(compareVersions('1.10.0', '1.9.9')).toBe(1);
    expect(compareVersions('1.1.2', '1.1.3')).toBe(-1);
    expect(compareVersions('2.0', '2.0.0')).toBe(0);
  });
});

describe('decidirChrome', () => {
  it('envia quando a loja não tem a versão nem revisão em andamento', () => {
    expect(decidirChrome({}, '1.1.3').acao).toBe('enviar');
    expect(decidirChrome({ publishedItemRevisionStatus: canal('1.1.2') }, '1.1.3').acao).toBe(
      'enviar',
    );
  });
  it('adia quando outra versão está em revisão', () => {
    expect(decidirChrome({ submittedItemRevisionStatus: canal('1.1.2') }, '1.1.3').acao).toBe(
      'adiar',
    );
  });
  it('pula versão já enviada ou publicada (ou mais nova)', () => {
    expect(decidirChrome({ submittedItemRevisionStatus: canal('1.1.3') }, '1.1.3').acao).toBe(
      'ja-publicada',
    );
    expect(decidirChrome({ publishedItemRevisionStatus: canal('1.1.3') }, '1.1.3').acao).toBe(
      'ja-publicada',
    );
    expect(decidirChrome({ publishedItemRevisionStatus: canal('1.2.0') }, '1.1.3').acao).toBe(
      'ja-publicada',
    );
  });
});

describe('decidirFirefox', () => {
  it('pula se o AMO já tem a versão', () => {
    expect(decidirFirefox({ results: [{ version: '1.1.3' }] }, '1.1.3').acao).toBe('ja-publicada');
  });
  it('envia se não tem', () => {
    expect(decidirFirefox({ results: [{ version: '1.1.2' }] }, '1.1.3').acao).toBe('enviar');
    expect(decidirFirefox({}, '1.1.3').acao).toBe('enviar');
  });
});
