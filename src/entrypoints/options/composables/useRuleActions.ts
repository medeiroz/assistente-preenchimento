import type { Ref } from 'vue';
import type { Config, Rule } from '../../../core/model';
import type { ConfigRepository } from '../../../core/storage';
import { duplicateRule } from './draft';
import { planMerge, type Addition } from './merge';
import type { UsePermissions } from './permissions';

interface Deps {
  repo: ConfigRepository;
  config: Ref<Config>;
  reload: () => Promise<void>;
  permissions: UsePermissions;
  showNotice: (kind: 'ok' | 'error', text: string) => void;
  /** Chamado depois que regras são adicionadas (fecha o editor aberto). */
  onAdded: () => void;
}

/** Ações da lista de regras: ativar/desativar, duplicar, excluir e adicionar de um arquivo. */
export function useRuleActions({ repo, config, reload, permissions, showNotice, onAdded }: Deps) {
  async function guard(action: () => Promise<void>, failure: string): Promise<void> {
    try {
      await action();
    } catch (e) {
      showNotice('error', `${failure}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function toggleRule(rule: Rule, enabled: boolean): Promise<void> {
    return guard(async () => {
      await repo.saveRule({ ...rule, enabled });
      await reload();
    }, 'Não foi possível alterar a regra');
  }

  function copyRule(rule: Rule): Promise<void> {
    return guard(async () => {
      await repo.saveRule(duplicateRule(rule, config.value.rules));
      await reload();
      showNotice('ok', 'Regra duplicada');
    }, 'Não foi possível duplicar a regra');
  }

  function removeRule(rule: Rule): Promise<void> {
    if (!window.confirm(`Excluir a regra “${rule.name}”? Esta ação não pode ser desfeita.`)) {
      return Promise.resolve();
    }
    return guard(async () => {
      await repo.deleteRule(rule.id);
      await reload();
      showNotice('ok', 'Regra excluída');
    }, 'Não foi possível excluir a regra');
  }

  /**
   * Adiciona regras (de um arquivo ou do exemplo) sem apagar nada. Síncrono até o pedido de
   * permissão: ele precisa começar dentro do clique do usuário.
   */
  async function addRules(addition: Addition): Promise<void> {
    const asking = permissions.requestAll(addition.rules);
    await guard(async () => {
      // Recalcula contra a configuração atual: os ids podem ter mudado desde a prévia.
      const current = await repo.load();
      const plan = planMerge(current, addition);
      for (const rule of plan.rules) await repo.saveRule(rule);
      if (plan.newVariables.length > 0) {
        await repo.saveVariables([...current.variables, ...plan.newVariables]);
      }
      await reload();
      onAdded();
      showNotice(
        'ok',
        plan.rules.length === 1 ? 'Regra adicionada' : `${plan.rules.length} regras adicionadas`,
      );
    }, 'Não foi possível adicionar as regras');
    await asking;
  }

  return { toggleRule, copyRule, removeRule, addRules };
}
