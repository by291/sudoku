<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { HintResult } from '../../core/sudoku/hint'
import { explainStep, TECHNIQUE_NAMES } from '../../core/sudoku/techniques'
const props = defineProps<{ hint: HintResult }>()
defineEmits<{ apply: []; dismiss: [] }>()
const stepIndex = ref(0)
watch(
  () => props.hint,
  () => {
    stepIndex.value = 0
  },
)
const steps = computed(() => (props.hint.kind === 'deduction' ? props.hint.steps : []))
const step = computed(() => steps.value[stepIndex.value])
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
      <div class="button-row">
        <button :disabled="stepIndex === 0" @click="stepIndex--">上一步</button
        ><button v-if="stepIndex < steps.length - 1" @click="stepIndex++">下一步</button
        ><button v-else class="primary" @click="$emit('apply')">应用提示</button>
      </div></template
    >
    <p v-else>
      {{
        hint.kind === 'unavailable' && hint.reason === 'complete'
          ? '棋盘已经完成。'
          : '当前没有可解释的逻辑步骤。请检查填写，或尝试调整思路。'
      }}
    </p>
    <button class="dismiss" @click="$emit('dismiss')">关闭提示</button>
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
</style>
