import { describe, expect, it } from 'vitest';
import { topHostOf, topOriginOf } from '../../../src/core/frames';

describe('topHostOf (pausa pelo host de topo)', () => {
  it('no frame de topo vale o próprio host', () => {
    expect(topHostOf({ hostname: 'a.com', ancestorOrigins: [] }, true)).toBe('a.com');
  });
  it('no filho, o último item de ancestorOrigins é o topo', () => {
    const loc = {
      hostname: 'widget.com',
      ancestorOrigins: ['https://meio.com', 'https://topo.com:8443'],
    };
    expect(topHostOf(loc, false)).toBe('topo.com');
    expect(topOriginOf(loc)).toBe('https://topo.com:8443');
  });
  it('sem ancestorOrigins usa a URL de topo do background', () => {
    expect(topHostOf({ hostname: 'widget.com' }, false, 'https://topo.com/p')).toBe('topo.com');
    expect(topOriginOf({})).toBeUndefined();
  });
  it('por último, o host do próprio frame', () => {
    expect(topHostOf({ hostname: 'widget.com' }, false)).toBe('widget.com');
    expect(topHostOf({ hostname: 'widget.com', ancestorOrigins: ['null'] }, false, 'lixo')).toBe(
      'widget.com',
    );
  });
});
