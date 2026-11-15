<script setup lang="ts">
defineProps<{ awaitingPermission: boolean }>();
</script>

<template>
  <div class="starting" role="status" data-testid="record-starting">
    <p class="summary">Iniciando gravação…</p>
    <p v-if="awaitingPermission" class="muted">
      Autorize o acesso ao site na janela do Chrome para gravar todas as etapas.
    </p>
  </div>
</template>
