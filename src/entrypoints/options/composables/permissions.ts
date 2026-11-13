import { computed, onMounted, onUnmounted, ref, watch, type ComputedRef, type Ref } from 'vue';
import type { Rule } from '../../../core/model';
import {
  classifyRule,
  hostOfOrigin,
  requestForRule,
  type PermissionsApi,
} from '../../../shared/permissions';

/**
 * API de permissões da página de opções. No build de testes (`--mode e2e`), a query string
 * `?e2eDenyPermissions=1` faz o pedido resolver `false` sem abrir o prompt nativo (que o
 * Playwright não consegue automatizar). `import.meta.env.MODE` é substituído em tempo de
 * build: no build de produção este ramo e a string somem do bundle.
 */
function pageApi(): PermissionsApi {
  if (import.meta.env.MODE === 'e2e' && location.search.includes('e2eDenyPermissions=1')) {
    return {
      permissions: {
        contains: (p) => browser.permissions.contains(p),
        request: () => Promise.resolve(false),
      },
    };
  }
  return browser;
}

export interface PermissionNotice {
  kind: 'denied' | 'granted';
  /** Hosts sem permissão (kind=denied). */
  hosts: string[];
  /** Regra cujo acesso foi negado, para o botão "Permitir acesso". */
  rule: Rule | null;
}

export interface UsePermissions {
  /** Ids de regras habilitadas sem permissão concedida (e não cobertas pelo manifest). */
  missingRuleIds: ComputedRef<Set<string>>;
  notice: Ref<PermissionNotice | null>;
  /** Chame DENTRO do gesto do usuário, sem nenhum await antes. */
  request(rule: Rule): Promise<void>;
  dismiss(): void;
}

export function usePermissions(rules: Ref<Rule[]>): UsePermissions {
  const api = pageApi();
  const granted = ref<Set<string>>(new Set());
  const notice = ref<PermissionNotice | null>(null);

  async function refresh(): Promise<void> {
    const origins = new Set<string>();
    for (const r of rules.value) for (const o of classifyRule(r).needed) origins.add(o);
    const next = new Set<string>();
    for (const o of origins) {
      try {
        if (await api.permissions.contains({ origins: [o] })) next.add(o);
      } catch (e) {
        console.warn('[assistente] permissions.contains falhou', e);
      }
    }
    granted.value = next;
  }

  const missingRuleIds = computed(() => {
    const ids = new Set<string>();
    for (const r of rules.value) {
      if (!r.enabled) continue;
      if (classifyRule(r).needed.some((o) => !granted.value.has(o))) ids.add(r.id);
    }
    return ids;
  });

  function request(rule: Rule): Promise<void> {
    // Chamada síncrona a requestForRule: preserva o gesto do usuário.
    const wasMissing = classifyRule(rule).needed.some((o) => !granted.value.has(o));
    const pending = requestForRule(rule, api, granted.value);
    return pending.then(async (res) => {
      await refresh();
      if (res.granted) {
        notice.value = wasMissing ? { kind: 'granted', hosts: [], rule: null } : null;
      } else {
        const hosts = classifyRule(rule).needed.map(hostOfOrigin);
        notice.value = { kind: 'denied', hosts, rule };
      }
    });
  }

  const onChanged = (): void => {
    void refresh();
  };
  onMounted(() => {
    void refresh();
    browser.permissions.onAdded.addListener(onChanged);
    browser.permissions.onRemoved.addListener(onChanged);
  });
  onUnmounted(() => {
    browser.permissions.onAdded.removeListener(onChanged);
    browser.permissions.onRemoved.removeListener(onChanged);
  });
  // Regras mudam (salvar/importar/sync): recalcula o que foi concedido.
  watch(rules, onChanged);

  return {
    missingRuleIds,
    notice,
    request,
    dismiss: () => (notice.value = null),
  };
}
