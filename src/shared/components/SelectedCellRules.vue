<script setup lang="ts">
import { computed } from 'vue'
import type { PuzzleRules } from '@/sudoku/contracts'
import { getSelectedRuleDescriptions } from '@/shared/model/boardGeometry'

const props = defineProps<{
  rules: PuzzleRules
  selectedCell: number | null
  obscured: boolean
}>()
const descriptions = computed(() =>
  !props.obscured && props.selectedCell !== null
    ? getSelectedRuleDescriptions(props.selectedCell, props.rules)
    : [],
)
</script>

<template>
  <ul v-if="descriptions.length" class="selected-rules" aria-label="所选格子的规则">
    <li v-for="description in descriptions" :key="description">{{ description }}</li>
  </ul>
</template>

<style scoped>
.selected-rules {
  padding-left: 20px;
  margin: 12px 0 0;
  color: var(--muted);
  font-size: 14px;
  line-height: 1.6;
}
</style>
