<script setup lang="ts">
defineProps<{ awaitingPermission: boolean }>();
</script>

<template>
  <div class="starting" role="status" data-testid="record-starting">
    <p class="summary">{{ $t('popStarting') }}</p>
    <p v-if="awaitingPermission" class="muted">
      {{ $t('popAuthorize') }}
    </p>
  </div>
</template>
