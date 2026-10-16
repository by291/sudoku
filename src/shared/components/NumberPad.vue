<script setup lang="ts">
import { NButton } from 'naive-ui'
import { DIGITS } from '@/sudoku/values'
import type { Digit } from '@/sudoku/contracts'

const {
  disabled = false,
  actionLabel = '输入',
  layout = 'grid',
} = defineProps<{
  disabled?: boolean
  actionLabel?: string
  layout?: 'grid' | 'row'
}>()
defineEmits<{ digit: [digit: Digit] }>()
</script>

<template>
  <div
    class="number-pad"
    :class="{ 'number-pad--row': layout === 'row' }"
    role="group"
    aria-label="数字输入"
  >
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
.number-pad--row {
  grid-template-columns: repeat(9, minmax(0, 1fr));
  gap: 4px;
}
.number-pad--row button {
  height: 52px;
  min-height: 44px;
  padding: 0;
  border-radius: 8px;
}
</style>
