<script setup lang="ts">
import { computed, ref, useTemplateRef, useId, watch, nextTick, h } from 'vue'
import { NButton, NDropdown } from 'naive-ui'
import type { DropdownProps, DropdownMenuProps, DropdownOption } from 'naive-ui'
import type { Digit } from '@/core/sudoku/types'
import NumberPad from '@/shared/components/NumberPad.vue'

const props = withDefaults(
  defineProps<{
    editable: boolean
    inputEditable: boolean
    selectionMessage: string
    announceSelection?: boolean
    noteMode: boolean
    canUndo: boolean
    canRedo: boolean
    hintLoading: boolean
    canRestart: boolean
    canStartNew: boolean
    newGameLabel: string
  }>(),
  { announceSelection: true },
)
const emit = defineEmits<{
  digit: [digit: Digit]
  erase: []
  note: []
  undo: []
  redo: []
  candidates: []
  check: []
  hint: []
  settings: []
  restart: []
  new: []
}>()
const menuOpen = ref(false)
const moreButton = useTemplateRef<InstanceType<typeof NButton>>('moreButton')

type MenuAction = 'check' | 'candidates' | 'settings' | 'new' | 'restart'

const menuId = useId()
const focusedAction = ref<MenuAction>()
let initialMenuPosition: 'first' | 'last' = 'first'
const tools = computed(() => [
  {
    key: 'undo',
    label: '撤销',
    name: '撤销',
    path: 'M9 5 3 11l6 6M3 11h11a7 7 0 0 1 7 7',
    disabled: !props.canUndo,
    active: false,
    activate: () => emit('undo'),
  },
  {
    key: 'redo',
    label: '重做',
    name: '重做',
    path: 'm15 5 6 6-6 6M21 11H10a7 7 0 0 0-7 7',
    disabled: !props.canRedo,
    active: false,
    activate: () => emit('redo'),
  },
  {
    key: 'erase',
    label: '擦除',
    name: '擦除',
    path: 'm16 3 6 6-11 11H5l-3-3L16 3ZM8 11l8 8M11 20h11',
    disabled: !props.inputEditable,
    active: false,
    activate: () => emit('erase'),
  },
  {
    key: 'note',
    label: '笔记',
    name: '笔记',
    path: 'm15 3 6 6-11 11-7 1 1-7L15 3ZM12 6l6 6M4 14l6 6',
    disabled: !props.editable,
    active: props.noteMode,
    activate: () => emit('note'),
  },
  {
    key: 'hint',
    label: '提示',
    name: '逻辑提示',
    path: 'M9 18h6m-5 3h4M8 15a6 6 0 1 1 8 0c-1 1-1 2-1 3H9c0-1 0-2-1-3Z',
    disabled: !props.editable || props.hintLoading,
    active: false,
    activate: () => emit('hint'),
  },
])
const menuOptions = computed<NonNullable<DropdownProps['options']>>(() => [
  {
    type: 'render',
    key: 'assistance-label',
    render: () =>
      h(
        'div',
        {
          role: 'presentation',
          style: { padding: '8px 16px', fontSize: '12px', color: 'var(--muted)' },
        },
        '辅助工具 · 使用后记为辅助完成',
      ),
  },
  // Top-level options retain native props in Naive UI 2.45; grouped children drop them.
  actionOption('check', '检查填写', !props.editable),
  actionOption('candidates', '生成候选数', !props.editable),
  { type: 'divider', key: 'divider' },
  actionOption('settings', '对局设置'),
  actionOption('new', props.newGameLabel, !props.canStartNew),
  actionOption('restart', '重新开始本题', !props.canRestart),
])
const menuAttributes: DropdownMenuProps = () => ({
  id: menuId,
  role: 'menu',
  'aria-label': '更多操作',
  'aria-hidden': menuOpen.value ? 'false' : 'true',
})

function actionOption(key: MenuAction, label: string, disabled = false): DropdownOption {
  return {
    key,
    label,
    disabled,
    props: {
      role: 'menuitem',
      tabindex: -1,
      'aria-disabled': disabled,
      style: { outlineOffset: '-3px' },
      onFocus: () => {
        focusedAction.value = key
      },
      onKeydown: handleMenuKey,
    },
  }
}

function menuItems() {
  return [
    ...(document
      .getElementById(menuId)
      ?.querySelectorAll<HTMLElement>('[role="menuitem"][aria-disabled="false"]') ?? []),
  ]
}

function focusMenuPosition(position: 'first' | 'last') {
  const items = menuItems()
  const item = position === 'first' ? items[0] : items.at(-1)
  item?.focus()
}

function focusMore() {
  const element: unknown = moreButton.value?.$el
  if (element instanceof HTMLElement) {
    element.focus()
  }
}

watch(menuOpen, async (open) => {
  if (!open) {
    return
  }

  // NDropdown 2.45 highlights options without DOM focus; expose real focus for assistive input.
  await nextTick()
  if (menuOpen.value) {
    focusMenuPosition(initialMenuPosition)
  }

  initialMenuPosition = 'first'
})

function handleTriggerKey(event: KeyboardEvent) {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
    return
  }

  event.preventDefault()
  initialMenuPosition = event.key === 'ArrowUp' ? 'last' : 'first'
  menuOpen.value = true
}

function handleMenuKey(event: KeyboardEvent) {
  const items = menuItems()
  const current = items.findIndex((item) => item === document.activeElement)
  if (event.key === 'Tab') {
    menuOpen.value = false
    focusMore()

    return
  }

  if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Escape', 'Enter', ' '].includes(event.key)) {
    event.preventDefault()
    event.stopPropagation()
    if (event.key === 'Escape') {
      menuOpen.value = false
      focusMore()
    } else if (event.key === 'Home') {
      focusMenuPosition('first')
    } else if (event.key === 'End') {
      focusMenuPosition('last')
    } else if (event.key === 'Enter' || event.key === ' ') {
      items[current]?.click()
    } else {
      const direction = event.key === 'ArrowDown' ? 1 : -1
      items[(current + direction + items.length) % items.length]?.focus()
    }
  } else if (event.key.length === 1) {
    const nextItems = [...items.slice(current + 1), ...items.slice(0, current + 1)]
    nextItems.find((item) => item.textContent?.trim().startsWith(event.key))?.focus()
  }
}

function selectAction(key: string | number) {
  menuOpen.value = false
  // Keep a stable focus target when the selected action opens a modal.
  focusMore()
  switch (key) {
    case 'check':
      emit('check')
      break
    case 'candidates':
      emit('candidates')
      break
    case 'settings':
      emit('settings')
      break
    case 'new':
      emit('new')
      break
    case 'restart':
      emit('restart')
      break
  }
}
</script>

<template>
  <section class="game-controls" aria-label="游戏操作">
    <div class="tools-row" role="group" aria-label="棋盘工具">
      <NButton
        v-for="tool in tools"
        :key="tool.key"
        class="tool-button"
        :aria-label="tool.name"
        :aria-pressed="tool.key === 'note' ? noteMode : undefined"
        :aria-description="tool.key === 'hint' ? '使用逻辑提示会将本局记为辅助完成。' : undefined"
        :disabled="tool.disabled"
        :type="tool.active ? 'primary' : 'default'"
        :quaternary="!tool.active"
        :loading="tool.key === 'hint' && hintLoading"
        @click="tool.activate"
      >
        <svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path
            :d="tool.path"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <span>{{ tool.label }}</span>
      </NButton>
      <NDropdown
        v-model:show="menuOpen"
        trigger="click"
        size="large"
        placement="top-end"
        :options="menuOptions"
        :keyboard="false"
        :value="focusedAction"
        :menu-props="menuAttributes"
        @select="selectAction"
      >
        <NButton
          ref="moreButton"
          class="tool-button"
          quaternary
          aria-label="更多操作"
          aria-haspopup="menu"
          :aria-expanded="menuOpen"
          :aria-controls="menuId"
          @keydown="handleTriggerKey"
        >
          <svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M4 12h.01M12 12h.01M20 12h.01"
              fill="none"
              stroke="currentColor"
              stroke-width="4"
              stroke-linecap="round"
            />
          </svg>
          <span>更多</span>
        </NButton>
      </NDropdown>
    </div>
    <div class="touch-number-entry">
      <NumberPad layout="row" :disabled="!inputEditable" @digit="$emit('digit', $event)" />
    </div>
    <div class="input-status">
      <p class="selection-message" :role="announceSelection ? 'status' : undefined">
        {{ selectionMessage }}
      </p>
      <span class="input-mode">{{ noteMode ? '笔记模式' : '填写模式' }}</span>
    </div>
    <p class="keyboard-guide">1–9 填写 · N 切换笔记 · Delete 擦除 · Ctrl / ⌘ + Z 撤销</p>
  </section>
</template>

<style scoped>
.game-controls {
  margin-top: 8px;
}
.tools-row {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 4px;
}
.tool-button {
  height: 62px;
  min-width: 0;
  padding: 4px 2px;
  border-radius: 10px;
}
.tool-button :deep(.n-button__content) {
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
}
.tool-icon {
  width: 24px;
  height: 24px;
  color: var(--accent);
}
.tool-button[aria-pressed='true'] .tool-icon {
  color: var(--accent-contrast);
}
.touch-number-entry {
  display: none;
  margin-top: 6px;
}
.input-status {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-top: 10px;
  color: var(--muted);
  font-size: 12px;
}
.selection-message {
  margin: 0;
}
.input-mode {
  flex-shrink: 0;
  color: var(--accent);
}
.keyboard-guide {
  margin: 8px 0 0;
  color: var(--muted);
  font-size: 12px;
}
@media (pointer: coarse), (max-width: 800px) {
  .touch-number-entry {
    display: block;
  }
  .keyboard-guide {
    display: none;
  }
  .tool-button {
    height: 56px;
  }
}
</style>
