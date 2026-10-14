<script setup lang="ts">
import { computed, nextTick, onUnmounted, useTemplateRef, watch } from 'vue'
import { NAlert, NButton, NModal, NRadio, NRadioButton, NRadioGroup } from 'naive-ui'
import { isSudokuVariant } from '@/core/sudoku/rules'
import type { SudokuVariant } from '@/core/sudoku/rules'
import { isDifficulty } from '@/core/sudoku/types'
import { supportedDifficulties, supportsDifficulty } from '@/core/sudoku/difficulties'
import type { Difficulty } from '@/core/sudoku/types'
import type { GameSession } from '@/features/game/model/session'
import type { DailyVariantStatus } from '@/features/game/model/daily'
import { getVariantPresentation, VARIANT_OPTIONS } from '@/features/game/model/variants'
import { DIFFICULTY_NAMES, formatDuration } from '@/features/game/model/presentation'
import GenerationStatus from '@/features/game/components/GenerationStatus.vue'

const props = withDefaults(
  defineProps<{
    mode?: 'free' | 'daily'
    savedSession?: GameSession | null
    statuses?: readonly DailyVariantStatus[]
    busy?: boolean
    generating?: boolean
    error?: string | null
  }>(),
  {
    mode: 'free',
    savedSession: null,
    statuses: () => [],
    busy: false,
    generating: false,
    error: null,
  },
)
const processing = computed(() => props.busy || props.generating)
const variant = defineModel<SudokuVariant>('variant', { required: true })
const difficulty = defineModel<Difficulty>('difficulty', { required: true })
const difficultyChoices = computed(() => supportedDifficulties(variant.value))
watch(variant, (value) => {
  if (!supportsDifficulty(value, difficulty.value)) {
    difficulty.value = 'hard'
  }
})
defineEmits<{ start: []; resume: []; cancel: [] }>()
const title = computed(() => (props.mode === 'daily' ? '选择每日挑战' : '开始一局数独'))
const dailyState = computed(
  () => props.statuses.find((status) => status.variant === variant.value)?.state,
)
const startLabel = computed(() => {
  if (props.mode !== 'daily') {
    return '开始游戏'
  }

  if (dailyState.value === 'completed') {
    return '再次练习'
  }

  return dailyState.value === 'in-progress' ? '继续今日挑战' : '开始今日挑战'
})
const descriptions: Record<SudokuVariant, string> = {
  classic: '从行、列与九宫格开始',
  diagonal: '两条对角线也不能重复',
  jigsaw: '用不规则区域替代九宫格',
  killer: '利用笼内总数推理',
  thermo: '沿温度计严格递增',
  arrow: '箭杆之和等于圆圈数字',
}

function statusLabel(type: SudokuVariant) {
  const state = props.statuses.find((status) => status.variant === type)?.state

  if (state === 'completed') {
    return '已完成'
  }

  return state === 'in-progress' ? '进行中' : '待开始'
}

function selectVariant(value: unknown) {
  if (!processing.value && isSudokuVariant(value)) {
    variant.value = value
  }
}

function selectDifficulty(value: unknown) {
  if (!processing.value && isDifficulty(value) && supportsDifficulty(variant.value, value)) {
    difficulty.value = value
  }
}

const previousFocus = document.activeElement
const actions = useTemplateRef<HTMLElement>('actions')
watch(actions, (element) => element?.querySelector('button')?.focus(), { flush: 'post' })
onUnmounted(async () => {
  await nextTick()
  if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
    previousFocus.focus()
  }
})
</script>

<template>
  <NModal
    preset="card"
    class="game-setup-dialog"
    style="width: min(640px, calc(100vw - 32px)); margin: 24px auto"
    :show="true"
    :title="title"
    :aria-label="title"
    role="dialog"
    aria-modal="true"
    :auto-focus="false"
    :closable="false"
    :mask-closable="false"
    @esc="$emit('cancel')"
  >
    <NAlert v-if="error" type="error" :show-icon="false" class="setup-error">{{ error }}</NAlert>
    <div :aria-busy="processing">
      <p class="field-label">选择玩法</p>
      <NRadioGroup
        :value="variant"
        name="puzzle-variant"
        role="radiogroup"
        aria-label="玩法"
        class="variant-grid"
        :disabled="processing"
        @update:value="selectVariant"
      >
        <NRadio
          v-for="choice in VARIANT_OPTIONS"
          :key="choice.value"
          :value="choice.value"
          :aria-label="choice.label"
          class="variant-choice"
          :class="{ selected: variant === choice.value }"
        >
          <span class="choice-title">{{ choice.label }}</span>
          <span class="choice-description">{{ descriptions[choice.value] }}</span>
          <span v-if="mode === 'daily'" class="choice-status">{{ statusLabel(choice.value) }}</span>
        </NRadio>
      </NRadioGroup>
    </div>
    <div class="difficulty-field">
      <template v-if="mode === 'free'">
        <p class="field-label">选择难度</p>
        <NRadioGroup
          :value="difficulty"
          name="puzzle-difficulty"
          role="radiogroup"
          aria-label="难度"
          :disabled="processing"
          @update:value="selectDifficulty"
        >
          <NRadioButton v-for="value in difficultyChoices" :key="value" :value="value">
            {{ DIFFICULTY_NAMES[value] }}
          </NRadioButton>
        </NRadioGroup>
      </template>
      <p v-else class="muted">每天每种玩法一道题 · 中等难度</p>
    </div>
    <NAlert
      v-if="mode === 'free' && savedSession && !savedSession.completion"
      type="info"
      :show-icon="false"
    >
      {{ getVariantPresentation(variant).label }}有未完成的存档（{{
        DIFFICULTY_NAMES[savedSession.puzzle.difficulty]
      }}
      · {{ formatDuration(savedSession.elapsedMs) }}）。开始游戏将替换此玩法存档，其他玩法会保留。
    </NAlert>
    <p v-if="mode === 'daily' && dailyState === 'completed'" class="muted">
      今日正式成绩已保留，再次游玩记为练习。
    </p>
    <template #footer>
      <GenerationStatus v-if="generating" class="setup-status" />
      <GenerationStatus
        v-else-if="busy"
        class="setup-status"
        message="正在读取存档…"
        description="读取完成后即可选择并开始。"
      />
      <div ref="actions" class="setup-actions">
        <NButton @click="$emit('cancel')">取消</NButton>
        <NButton
          v-if="mode === 'free' && savedSession && !savedSession.completion"
          type="info"
          :disabled="processing"
          @click="$emit('resume')"
          >继续存档</NButton
        >
        <NButton type="primary" :disabled="processing" @click="$emit('start')">
          {{ startLabel }}
        </NButton>
      </div>
    </template>
  </NModal>
</template>

<style scoped>
.field-label {
  font-weight: 600;
  margin: 0 0 12px;
}
.variant-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.variant-choice {
  margin: 0;
  padding: 16px;
  border: 1px solid var(--control-border);
  border-radius: 12px;
  align-items: flex-start;
  transition:
    background-color 0.15s,
    border-color 0.15s;
}
.variant-choice.selected {
  background: var(--accent-soft);
  border-color: var(--accent);
  box-shadow: inset 0 0 0 1px var(--accent);
}
.variant-choice :deep(.n-radio__label) {
  min-width: 0;
}
.variant-choice :deep(.n-radio__dot-wrapper) {
  margin-top: 3px;
}
.choice-title {
  display: block;
  font-weight: 600;
  color: var(--text);
}
.choice-description,
.choice-status {
  display: block;
  color: var(--muted);
  font-size: 12px;
  margin-top: 4px;
}
.choice-status {
  color: var(--accent);
  font-weight: 600;
}
.difficulty-field {
  margin: 24px 0;
}
.setup-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}
.setup-error {
  margin-bottom: 16px;
}
.setup-status {
  margin-bottom: 16px;
}
@media (max-width: 440px) {
  .variant-choice {
    padding: 12px 8px;
  }
  .variant-grid {
    gap: 8px;
  }
  .setup-actions :deep(button) {
    flex: 1 1 auto;
  }
}
</style>
