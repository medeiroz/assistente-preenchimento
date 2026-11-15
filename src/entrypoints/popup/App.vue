<script setup lang="ts">
import { onMounted } from 'vue';
import ReadyView from './components/ReadyView.vue';
import UnavailableView from './components/UnavailableView.vue';
import { useCapture } from './composables/useCapture';
import { useRecording } from './composables/useRecording';
import { useTabContext } from './composables/useTabContext';
import './popup.css';

const ctx = useTabContext();
const { view, status, report, busy, error, active, canUndo } = ctx;
const { starting, awaitingPermission, recording, loadRecording, recordStart, recordStop } =
  useRecording(ctx);
const { startCapture, captureOnDemand } = useCapture(ctx);

function openSettings(): void {
  void browser.runtime.openOptionsPage();
}

// A gravação não bloqueia a tela: se o background não responder, o popup segue sem ela.
onMounted(() => ctx.load((id) => void loadRecording(id)));
</script>

<template>
  <main>
    <header>
      <h1>{{ $t('extName') }}</h1>
      <p v-if="status" class="host" data-testid="host">{{ status.host }}</p>
    </header>

    <p v-if="view === 'loading'" class="muted" role="status">{{ $t('popLoading') }}</p>

    <UnavailableView
      v-else-if="view === 'unavailable'"
      :recording="recording"
      :busy="busy"
      :starting="starting"
      :awaiting-permission="awaitingPermission"
      :error="error"
      @record-start="recordStart"
      @record-stop="recordStop"
      @capture="captureOnDemand"
      @open-settings="openSettings"
    />

    <ReadyView
      v-else-if="status"
      :status="status"
      :report="report"
      :active="active"
      :can-undo="canUndo"
      :recording="recording"
      :busy="busy"
      :starting="starting"
      :awaiting-permission="awaitingPermission"
      :error="error"
      @set-active="ctx.setActive"
      @run-now="ctx.runNow"
      @undo="ctx.undo"
      @capture="startCapture"
      @record-start="recordStart"
      @record-stop="recordStop"
      @open-settings="openSettings"
    />
  </main>
</template>
