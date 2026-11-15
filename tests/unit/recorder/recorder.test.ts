import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecordedField, RecorderStatus } from '../../../src/core/recorder';
import { PICKER_HOST_ATTR } from '../../../src/entrypoints/content/picker';
import { RECORDER_HOST_ATTR, createRecorder } from '../../../src/entrypoints/content/recorder';

const FORM = `
  <div id="f1"><label for="i1">Cidade</label><input id="i1" type="text"></div>
  <div id="f2"><label for="i2">Senha</label><input id="i2" type="password"></div>
  <div id="f3"><label for="i3">Cartão</label><input id="i3" type="text" autocomplete="cc-number"></div>
  <p id="solto">texto</p>
  <button id="b">Ok</button>`;

function bar(): ShadowRoot | undefined {
  return document.querySelector(`[${RECORDER_HOST_ATTR}]`)?.shadowRoot ?? undefined;
}

function fire(type: string, target: Element): void {
  target.dispatchEvent(new Event(type, { bubbles: true, composed: true }));
}

describe('createRecorder', () => {
  let sent: RecordedField[];
  let send: ReturnType<typeof vi.fn<(f: RecordedField) => Promise<RecorderStatus>>>;
  let onStop: ReturnType<typeof vi.fn<(d: boolean) => void>>;
  let trusted = true;
  const siteSeen: string[] = [];
  const site = (e: Event) => siteSeen.push(`${e.type}:${e.defaultPrevented}`);

  function make() {
    return createRecorder({ send, onStop, isTrusted: () => trusted, now: () => 42 });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = FORM;
    sent = [];
    siteSeen.length = 0;
    trusted = true;
    send = vi.fn(async (f: RecordedField) => {
      sent.push(f);
      return { active: true, count: sent.length };
    });
    onStop = vi.fn<(d: boolean) => void>();
    document.addEventListener('input', site);
  });
  afterEach(() => {
    document.removeEventListener('input', site);
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('mostra a barra acessível e remove tudo ao parar', () => {
    const r = make();
    r.start({ active: true, count: 3 });
    expect(r.active).toBe(true);
    const s = bar();
    expect(s?.querySelector('[role="region"]')?.getAttribute('aria-label')).toBe(
      'Gravação de preenchimento',
    );
    expect(s?.textContent).toContain('Gravando preenchimento · 3 campos');
    expect(s?.querySelector('[role="status"]')).not.toBeNull();
    r.stop();
    expect(r.active).toBe(false);
    expect(bar()).toBeUndefined();
  });

  it('botões chamam onStop com e sem descarte', () => {
    const r = make();
    r.start({ active: true, count: 0 });
    (bar()?.querySelector('.stop') as HTMLElement).click();
    (bar()?.querySelector('.discard') as HTMLElement).click();
    expect(onStop.mock.calls).toEqual([[false], [true]]);
    r.stop();
  });

  it('grava o campo com debounce, uma vez, e mostra "Gravado"', async () => {
    const r = make();
    r.start({ active: true, count: 0 });
    const input = document.getElementById('i1') as HTMLInputElement;
    input.value = 'Ex';
    fire('input', input);
    input.value = 'Exemplo';
    fire('input', input);
    await vi.advanceTimersByTimeAsync(299);
    expect(send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    expect(send).toHaveBeenCalledTimes(1);
    expect(sent[0]).toMatchObject({ value: 'Exemplo', recordedAt: 42 });
    expect(sent[0]?.capture.label).toBe('Cidade');
    expect(bar()?.textContent).toContain('1 campo');
    expect(bar()?.textContent).toContain('Gravado: Cidade');
    // Mesmo valor de novo: não reenvia.
    fire('change', input);
    await vi.advanceTimersByTimeAsync(200);
    expect(send).toHaveBeenCalledTimes(1);
    r.stop();
  });

  it('nunca cancela nem interfere nos eventos do site', () => {
    const r = make();
    r.start({ active: true, count: 0 });
    const input = document.getElementById('i1') as HTMLInputElement;
    input.value = 'x';
    const ev = new Event('input', { bubbles: true, cancelable: true });
    input.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    expect(siteSeen).toContain('input:false');
    r.stop();
  });

  it('ignora eventos não confiáveis', async () => {
    const r = make();
    r.start({ active: true, count: 0 });
    trusted = false;
    const input = document.getElementById('i1') as HTMLInputElement;
    input.value = 'x';
    fire('input', input);
    await vi.advanceTimersByTimeAsync(500);
    expect(send).not.toHaveBeenCalled();
    r.stop();
  });

  it('usa ev.isTrusted por padrão (eventos do happy-dom são sintéticos)', async () => {
    const r = createRecorder({ send, onStop });
    r.start({ active: true, count: 0 });
    const input = document.getElementById('i1') as HTMLInputElement;
    input.value = 'x';
    fire('input', input);
    await vi.advanceTimersByTimeAsync(500);
    expect(send).not.toHaveBeenCalled();
    r.stop();
  });

  it('não grava campos sensíveis', async () => {
    const r = make();
    r.start({ active: true, count: 0 });
    for (const id of ['i2', 'i3']) {
      const el = document.getElementById(id) as HTMLInputElement;
      el.value = 'segredo';
      fire('input', el);
      fire('change', el);
    }
    await vi.advanceTimersByTimeAsync(500);
    expect(send).not.toHaveBeenCalled();
    r.stop();
  });

  it('ignora cliques fora de campos e eventos da UI da extensão', async () => {
    const r = make();
    r.start({ active: true, count: 0 });
    fire('click', document.getElementById('solto') as Element);
    fire('click', document.getElementById('b') as Element);
    (bar()?.querySelector('.stop') as HTMLElement).click();
    const picker = document.createElement('div');
    picker.setAttribute(PICKER_HOST_ATTR, '');
    picker.innerHTML = '<label for="px">Cidade</label><input id="px">';
    document.body.append(picker);
    (picker.querySelector('input') as HTMLInputElement).value = 'a';
    fire('input', picker.querySelector('input') as Element);
    await vi.advanceTimersByTimeAsync(500);
    expect(send).not.toHaveBeenCalled();
    r.stop();
  });

  it('valor esvaziado é enviado (o background remove o campo)', async () => {
    const r = make();
    r.start({ active: true, count: 0 });
    const input = document.getElementById('i1') as HTMLInputElement;
    input.value = 'a';
    fire('input', input);
    await vi.advanceTimersByTimeAsync(400);
    input.value = '';
    fire('input', input);
    await vi.advanceTimersByTimeAsync(400);
    expect(sent.map((f) => f.value)).toEqual(['a', '']);
    r.stop();
  });

  it('update desliga quando inativo e religa quando ativo', () => {
    const r = make();
    r.update({ active: true, count: 2 });
    expect(r.active).toBe(true);
    expect(bar()?.textContent).toContain('2 campos');
    r.update({ active: true, count: 5 });
    expect(bar()?.textContent).toContain('5 campos');
    r.update({ active: false, count: 0 });
    expect(r.active).toBe(false);
  });

  it('para sozinho se o background disser que a sessão acabou', async () => {
    send.mockResolvedValueOnce({ active: false, count: 0 });
    const r = make();
    r.start({ active: true, count: 0 });
    const input = document.getElementById('i1') as HTMLInputElement;
    input.value = 'a';
    fire('input', input);
    await vi.advanceTimersByTimeAsync(400);
    expect(r.active).toBe(false);
  });

  it('falha de envio não derruba e permite nova tentativa', async () => {
    send.mockRejectedValueOnce(new Error('dormindo'));
    const r = make();
    r.start({ active: true, count: 0 });
    const input = document.getElementById('i1') as HTMLInputElement;
    input.value = 'a';
    fire('change', input);
    await vi.advanceTimersByTimeAsync(300);
    fire('change', input);
    await vi.advanceTimersByTimeAsync(300);
    expect(send).toHaveBeenCalledTimes(2);
    r.stop();
  });

  describe('não perder o último valor', () => {
    function typed(r: ReturnType<typeof make>): HTMLInputElement {
      r.start({ active: true, count: 0 });
      const input = document.getElementById('i1') as HTMLInputElement;
      input.value = 'Exemplo';
      fire('input', input);
      expect(send).not.toHaveBeenCalled();
      return input;
    }

    it('change reporta na hora, sem debounce', () => {
      const r = make();
      r.start({ active: true, count: 0 });
      const input = document.getElementById('i1') as HTMLInputElement;
      input.value = 'Final';
      fire('change', input);
      expect(send).toHaveBeenCalledTimes(1);
      expect(sent[0]?.value).toBe('Final');
      r.stop();
    });

    it('focusout reporta o campo na hora e cancela o debounce', async () => {
      const r = make();
      const input = typed(r);
      fire('focusout', input);
      expect(send).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(500);
      expect(send).toHaveBeenCalledTimes(1);
      r.stop();
    });

    it('clique fora de campo (ex.: Próximo) reporta o pendente antes de tudo', () => {
      const r = make();
      typed(r);
      fire('click', document.getElementById('b') as Element);
      expect(send).toHaveBeenCalledTimes(1);
      expect(sent[0]?.value).toBe('Exemplo');
      r.stop();
    });

    it('clique no botão da barra também descarrega o pendente', () => {
      const r = make();
      typed(r);
      (bar()?.querySelector('.stop') as HTMLElement).click();
      expect(send).toHaveBeenCalledTimes(1);
      r.stop();
    });

    it('clique dentro de um campo não descarrega (segue o debounce)', async () => {
      const r = make();
      const input = typed(r);
      fire('click', input);
      expect(send).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(400);
      expect(send).toHaveBeenCalledTimes(1);
      r.stop();
    });

    for (const type of ['submit', 'pagehide', 'beforeunload']) {
      it(`${type} descarrega o pendente`, () => {
        const r = make();
        typed(r);
        window.dispatchEvent(new Event(type));
        expect(send).toHaveBeenCalledTimes(1);
        expect(sent[0]?.value).toBe('Exemplo');
        r.stop();
      });
    }

    it('submit vindo de um formulário (borbulhando) descarrega', () => {
      const r = make();
      typed(r);
      document.body.dispatchEvent(new Event('submit', { bubbles: true }));
      expect(send).toHaveBeenCalledTimes(1);
      r.stop();
    });

    it('flush() público descarrega tudo e não reenvia o mesmo valor', async () => {
      const r = make();
      typed(r);
      r.flush();
      r.flush();
      await vi.advanceTimersByTimeAsync(500);
      expect(send).toHaveBeenCalledTimes(1);
      r.stop();
    });

    it('depois de parar, saídas da página não enviam nada', () => {
      const r = make();
      typed(r);
      r.stop();
      window.dispatchEvent(new Event('pagehide'));
      expect(send).not.toHaveBeenCalled();
    });
  });

  it('isPaused ignora tudo enquanto verdadeiro', async () => {
    let paused = true;
    const r = createRecorder({ send, onStop, isTrusted: () => true, isPaused: () => paused });
    r.start({ active: true, count: 0 });
    const input = document.getElementById('i1') as HTMLInputElement;
    input.value = 'a';
    fire('input', input);
    fire('change', input);
    fire('click', document.getElementById('b') as Element);
    await vi.advanceTimersByTimeAsync(500);
    expect(send).not.toHaveBeenCalled();
    paused = false;
    fire('change', input);
    expect(send).toHaveBeenCalledTimes(1);
    r.stop();
  });

  describe('valores definidos por widgets (datepicker, máscaras, overlays)', () => {
    function setProgrammatic(id: string, value: string): HTMLInputElement {
      const input = document.getElementById(id) as HTMLInputElement;
      input.value = value;
      return input;
    }

    it('campo tocado alterado por script é gravado após clique confiável fora de campo', async () => {
      const r = make();
      r.start({ active: true, count: 0 });
      const input = document.getElementById('i1') as HTMLInputElement;
      fire('focusin', input);
      setProgrammatic('i1', '15/03/2026');
      fire('click', document.getElementById('solto') as Element);
      await vi.advanceTimersByTimeAsync(250);
      expect(sent).toHaveLength(1);
      expect(sent[0]?.value).toBe('15/03/2026');
      r.stop();
    });

    it('segunda passada pega widgets lentos e envia só o que mudou', async () => {
      const r = make();
      r.start({ active: true, count: 0 });
      fire('click', document.getElementById('i1') as Element);
      await vi.advanceTimersByTimeAsync(250);
      fire('keyup', document.getElementById('solto') as Element);
      await vi.advanceTimersByTimeAsync(400);
      setProgrammatic('i1', '10/01/2026');
      await vi.advanceTimersByTimeAsync(250);
      // O clique no campo já gravou o valor vazio inicial (comportamento existente).
      expect(sent.map((f) => f.value)).toEqual(['', '10/01/2026']);
      await vi.advanceTimersByTimeAsync(1000);
      expect(sent).toHaveLength(2);
      r.stop();
    });

    it('campo não tocado alterado por script não é gravado', async () => {
      const r = make();
      r.start({ active: true, count: 0 });
      setProgrammatic('i1', 'preenchido pela página');
      fire('click', document.getElementById('solto') as Element);
      fire('keyup', document.getElementById('solto') as Element);
      await vi.advanceTimersByTimeAsync(1000);
      expect(send).not.toHaveBeenCalled();
      r.stop();
    });

    it('eventos não confiáveis não disparam a releitura', async () => {
      const r = make();
      r.start({ active: true, count: 0 });
      fire('focusin', document.getElementById('i1') as Element);
      await vi.advanceTimersByTimeAsync(1000);
      trusted = false;
      setProgrammatic('i1', '01/02/2026');
      fire('click', document.getElementById('solto') as Element);
      await vi.advanceTimersByTimeAsync(1000);
      expect(send).not.toHaveBeenCalled();
      r.stop();
    });

    it('flush relê os campos tocados de forma síncrona', () => {
      const r = make();
      r.start({ active: true, count: 0 });
      fire('focusin', document.getElementById('i1') as Element);
      setProgrammatic('i1', '20/05/2026');
      r.flush();
      expect(sent).toHaveLength(1);
      expect(sent[0]?.value).toBe('20/05/2026');
      r.stop();
    });

    it('campo sensível tocado nunca é enviado pela releitura', async () => {
      const r = make();
      r.start({ active: true, count: 0 });
      fire('focusin', document.getElementById('i2') as Element);
      setProgrammatic('i2', 'segredo');
      r.flush();
      await vi.advanceTimersByTimeAsync(1000);
      expect(send).not.toHaveBeenCalled();
      r.stop();
    });
  });
});
