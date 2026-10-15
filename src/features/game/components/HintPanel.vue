<script setup lang="ts">
import { NButton } from 'naive-ui'
import { computed, ref, watch } from 'vue'
import type { HintResult } from '@/core/sudoku/hint'
import {
  explainStep,
  explainStepEvidence,
  TECHNIQUE_NAMES,
} from '@/features/game/model/techniquePresentation'
import type { LogicalStep } from '@/core/sudoku/logic/types'

const props = defineProps<{ hint: HintResult }>()
const emit = defineEmits<{ apply: []; dismiss: []; highlight: [step: LogicalStep | null] }>()
const stepIndex = ref(0)
watch(
  () => props.hint,
  () => {
    stepIndex.value = 0
  },
)
const steps = computed(() => (props.hint.kind === 'deduction' ? props.hint.steps : []))
const step = computed(() => steps.value[stepIndex.value])
const evidenceDetails = computed(() => (step.value ? explainStepEvidence(step.value) : []))
watch(step, (current) => emit('highlight', current ?? null), { immediate: true })
</script>
<template>
  <section class="panel hint-panel" aria-label="逻辑提示说明" aria-live="polite">
    <h2>找到下一步</h2>
    <template v-if="hint.kind === 'review-entry'"
      ><p>
        第{{ Math.floor(hint.cell / 9) + 1 }}行第{{
          (hint.cell % 9) + 1
        }}列需要重新检查。先回顾这一格的填写理由。
      </p></template
    >
    <template v-else-if="hint.kind === 'deduction' && step"
      ><p class="muted">
        步骤 {{ stepIndex + 1 }} / {{ steps.length }} · {{ TECHNIQUE_NAMES[step.technique] }}
      </p>
      <p>{{ explainStep(step) }}</p>
      <template v-if="evidenceDetails.length">
        <p class="muted">推理使用的数字范围（已填格列出其数字）：</p>
        <ul class="evidence-details">
          <li v-for="detail in evidenceDetails" :key="detail">{{ detail }}</li>
        </ul>
      </template>
      <div class="button-row">
        <NButton :disabled="stepIndex === 0" @click="stepIndex--">上一步</NButton
        ><NButton v-if="stepIndex < steps.length - 1" @click="stepIndex++">下一步</NButton
        ><NButton v-else type="primary" @click="$emit('apply')">应用提示</NButton>
      </div></template
    >
    <p v-else>
      {{
        hint.kind === 'unavailable' && hint.reason === 'complete'
          ? '棋盘已经完成。'
          : hint.kind === 'unavailable' && hint.reason === 'budget-exhausted'
            ? '提示计算超出预算，未应用任何推理。请稍后重试。'
            : '当前没有可解释的逻辑步骤。请检查填写，或尝试调整思路。'
      }}
    </p>
    <NButton class="dismiss" @click="$emit('dismiss')">关闭提示</NButton>
  </section>
</template>
<style scoped>
.hint-panel {
  margin-top: 16px;
  border-color: var(--accent);
}
h2 {
  font-size: 18px;
  margin: 0;
}
.dismiss {
  margin-top: 16px;
  font-size: 13px;
}
.evidence-details {
  padding-left: 20px;
  line-height: 1.8;
}
</style>
