<script setup lang="ts">
import type { PermissionNotice, RuleTrigger } from '../composables/permissions';

defineProps<{ notice: PermissionNotice | null }>();
defineEmits<{ request: [rule: RuleTrigger]; dismiss: [] }>();
</script>

<template>
  <div v-if="notice?.kind === 'denied'" class="notice warn" role="status" data-testid="perm-denied">
    <p>
      <strong>Sem permissão para {{ notice.hosts.join(', ') }}:</strong>
      a regra fica salva, mas só funciona depois que você permitir o acesso.
    </p>
    <button
      type="button"
      class="btn"
      data-testid="perm-allow"
      @click="notice.rule && $emit('request', notice.rule)"
    >
      Permitir acesso
    </button>
  </div>
  <div
    v-else-if="notice?.kind === 'granted'"
    class="notice ok"
    role="status"
    data-testid="perm-granted"
  >
    <p>Recarregue as abas abertas desse site para a extensão começar a atuar.</p>
    <button type="button" class="btn" @click="$emit('dismiss')">Entendi</button>
  </div>
</template>
