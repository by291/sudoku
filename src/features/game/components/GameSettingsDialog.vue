<script setup lang="ts">
import { NButton, NSwitch } from 'naive-ui'
import ResponsiveDialog from '@/shared/components/ResponsiveDialog.vue'

const props = defineProps<{ show: boolean; showTimer: boolean; highlightConflicts: boolean }>()
const emit = defineEmits<{
  'update:show': [value: boolean]
  'update:showTimer': [value: boolean]
  'update:highlightConflicts': [value: boolean]
}>()
</script>

<template>
  <ResponsiveDialog
    :show="show"
    title="对局设置"
    :max-width="480"
    @update:show="emit('update:show', $event)"
  >
    <div class="preferences-row">
      <div class="preference" @click="emit('update:showTimer', !props.showTimer)">
        <span>显示计时</span
        ><NSwitch
          :value="showTimer"
          aria-label="显示计时"
          @update:value="emit('update:showTimer', $event)"
          @click.stop
        />
      </div>
      <div class="preference" @click="emit('update:highlightConflicts', !props.highlightConflicts)">
        <span>高亮冲突</span
        ><NSwitch
          :value="highlightConflicts"
          aria-label="高亮冲突"
          @update:value="emit('update:highlightConflicts', $event)"
          @click.stop
        />
      </div>
    </div>
    <slot />
    <template #footer><NButton @click="emit('update:show', false)">关闭设置</NButton></template>
  </ResponsiveDialog>
</template>

<style scoped>
.preferences-row {
  display: grid;
  gap: 12px;
}
.preference {
  display: flex;
  gap: 24px;
  align-items: center;
  min-height: 44px;
  padding: 0 12px;
  border-radius: 8px;
  background: var(--background);
  cursor: pointer;
  justify-content: space-between;
}
.preference :deep(.n-switch) {
  min-height: 44px;
  min-width: 44px;
  display: flex;
  align-items: center;
}
.preference:focus-visible {
  outline: 3px solid var(--accent);
  outline-offset: 3px;
}
</style>
