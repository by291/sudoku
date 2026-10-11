<script setup lang="ts">
import { NButton } from 'naive-ui'
import { DIGITS } from '../core/sudoku/types'
import type { Digit } from '../core/sudoku/types'

const { disabled = false, actionLabel = '输入' } = defineProps<{
  disabled?: boolean
  actionLabel?: string
}>()
defineEmits<{ digit: [digit: Digit] }>()
</script>

<template>
  <div class="number-pad" role="group" aria-label="数字输入">
    <NButton
      v-for="digit in DIGITS"
      :key="digit"
      size="large"
      type="primary"
      secondary
      :disabled="disabled"
      :aria-label="`${actionLabel}数字${digit}`"
      @click="$emit('digit', digit)"
    >
      {{ digit }}
    </NButton>
  </div>
</template>

<style scoped>
.number-pad {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.number-pad button {
  min-width: 0;
  font-size: 24px;
}
</style>
