<script setup lang="ts">
import type { RunReport } from '../../../core/model';
import type { PopupStatus } from '../lib/frames';
import RecordingStarting from './RecordingStarting.vue';
import RecordingStatus from './RecordingStatus.vue';
import ReportList from './ReportList.vue';
import RuleList from './RuleList.vue';

defineProps<{
  status: PopupStatus;
  report: RunReport | null;
  active: boolean;
  canUndo: boolean;
  recording: { active: boolean; count: number };
  busy: boolean;
  starting: boolean;
  awaitingPermission: boolean;
  error: string;
}>();
defineEmits<{
  setActive: [on: boolean];
  runNow: [];
  undo: [];
  capture: [];
  recordStart: [];
  recordStop: [discard: boolean];
  openSettings: [];
}>();
</script>

<template>
  <label class="switch">
    <input
      type="checkbox"
      role="switch"
      :checked="active"
      @change="$emit('setActive', ($event.target as HTMLInputElement).checked)"
    />
    <span>{{ $t('popActiveOnSite') }}</span>
  </label>
  <p v-if="status.paused" class="paused" role="status" data-testid="paused">
    {{ $t('popPausedOnSite') }}
  </p>

  <RuleList :rules="status.activeRules" />

  <ReportList v-if="report" :report="report" />
  <p v-else class="muted" data-testid="no-report">
    {{ $t('popNoReport') }}
  </p>

  <RecordingStatus
    v-if="recording.active"
    :count="recording.count"
    :busy="busy"
    @stop="$emit('recordStop', false)"
    @discard="$emit('recordStop', true)"
  />
  <p v-if="error" class="error" role="alert">{{ error }}</p>

  <RecordingStarting v-if="starting" :awaiting-permission="awaitingPermission" />
  <div v-else class="actions">
    <button
      type="button"
      class="btn primary"
      :disabled="busy || status.paused"
      @click="$emit('runNow')"
    >
      {{ $t('popFillNow') }}
    </button>
    <button type="button" class="btn" :disabled="busy || !canUndo" @click="$emit('undo')">
      {{ $t('toastUndo') }}
    </button>
    <button
      type="button"
      class="btn"
      data-testid="capture-field"
      :disabled="busy"
      @click="$emit('capture')"
    >
      {{ $t('popCaptureField') }}
    </button>
    <button
      v-if="!recording.active"
      type="button"
      class="btn"
      data-testid="record-start"
      :disabled="busy"
      @click="$emit('recordStart')"
    >
      {{ $t('popRecordStart') }}
    </button>
    <button type="button" class="btn" @click="$emit('openSettings')">
      {{ $t('optionsTitle') }}
    </button>
  </div>
</template>
