<script setup lang="ts">
import type { PermissionNotice, RuleTrigger } from '../composables/permissions';

defineProps<{ notice: PermissionNotice | null }>();
defineEmits<{ request: [rule: RuleTrigger]; dismiss: [] }>();
</script>

<template>
  <div v-if="notice?.kind === 'denied'" class="notice warn" role="status" data-testid="perm-denied">
    <p>
      <strong>{{ $t('permDeniedLead', notice.hosts.join(', ')) }}</strong>
      {{ $t('permDeniedRest') }}
    </p>
    <button
      type="button"
      class="btn"
      data-testid="perm-allow"
      @click="notice.rule && $emit('request', notice.rule)"
    >
      {{ $t('permAllowAccess') }}
    </button>
  </div>
  <div
    v-else-if="notice?.kind === 'granted'"
    class="notice ok"
    role="status"
    data-testid="perm-granted"
  >
    <p>{{ $t('permReload') }}</p>
    <button type="button" class="btn" @click="$emit('dismiss')">
      {{ $t('permGotIt') }}
    </button>
  </div>
</template>
