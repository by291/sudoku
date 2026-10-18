<script setup lang="ts">
import { NAlert, NButton, NCard } from 'naive-ui'
import { computed, ref, watch, useTemplateRef } from 'vue'
import { storeToRefs } from 'pinia'
import { RouterLink } from 'vue-router'
import type { LogicalStep } from '@/sudoku/contracts'
import type { Difficulty, Digit } from '@/sudoku/contracts'
import type { SudokuVariant } from '@/sudoku/contracts'
import { getVariantPresentation } from '@/features/game/model/variants'
import type { SessionMetadata } from '@/features/game/model/session'
import { useGameStore } from '@/features/game/stores/useGameStore'
import { usePreferencesStore } from '@/features/settings/stores/usePreferencesStore'
import { useGameKeyboard } from '@/features/game/composables/useGameKeyboard'
import { useGameLifecycle } from '@/features/game/composables/useGameLifecycle'
import { DIFFICULTY_NAMES, formatDuration } from '@/features/game/model/presentation'
import SudokuBoard from '@/shared/components/SudokuBoard.vue'
import SelectedCellRules from '@/shared/components/SelectedCellRules.vue'
import GameControls from '@/features/game/components/GameControls.vue'
import HintPanel from '@/features/game/components/HintPanel.vue'
import ConfirmationDialog from '@/shared/components/ConfirmationDialog.vue'
import GameSetupDialog from '@/features/game/components/GameSetupDialog.vue'
import GameSettingsDialog from '@/features/game/components/GameSettingsDialog.vue'
import GenerationStatus from '@/features/game/components/GenerationStatus.vue'
import { useGameEntry } from '@/features/game/composables/useGameEntry'
import { useBoardSize } from '@/features/game/composables/useBoardSize'
import { useDelayedProgress } from '@/shared/composables/useDelayedProgress'

const props = withDefaults(
  defineProps<{
    metadata?: SessionMetadata
    heading?: string
    practiceDifficulty?: Difficulty
    practiceVariant?: SudokuVariant
    autoRestore?: boolean
  }>(),
  {
    metadata: () => ({ kind: 'free' }),
    heading: '自由游玩',
    practiceDifficulty: 'easy',
    practiceVariant: 'classic',
    autoRestore: true,
  },
)
const emit = defineEmits<{ chooseDaily: [] }>()

const game = useGameStore()
const {
  session,
  board,
  phase,
  editable,
  selectedCell,
  noteMode,
  hint,
  hintLoading,
  notesLoading,
  conflictAnalysisState,
  conflicts,
  checkedCells,
  checkIsCurrent,
  canRetryGeneration,
  error,
  saveState,
  saveMessage,
  readOnly,
  elapsedMs,
  canUndo,
  canRedo,
  activeVariant,
  conflictEvaluation,
  ruleMetadata,
} = storeToRefs(game)

const entry = useGameEntry({
  metadata: () => props.metadata,
  autoRestore: () => props.autoRestore,
  practiceVariant: () => props.practiceVariant,
  practiceDifficulty: () => props.practiceDifficulty,
  chooseDaily: () => emit('chooseDaily'),
})
const {
  ready,
  initializationError,
  queryVariant,
  active,
  nextVariant,
  difficulty,
  setupOpen,
  targetSummary,
  targetPending,
  targetError,
  retryTarget,
  targetLoading,
  initialize,
  start,
  syncSessionRoute,
  retryGeneration,
  startSelected,
  resumeTarget,
} = entry

const boardSpace = useTemplateRef<HTMLElement>('boardSpace')
const boardSizeStyle = useBoardSize(boardSpace)
const hasSession = computed(() => !!active.value && !!session.value)
const displayedMetadata = computed(() =>
  hasSession.value ? session.value?.metadata : props.metadata,
)
const showPlaySurface = computed(
  () => hasSession.value || !ready.value || phase.value === 'generating' || !!error.value,
)
const fitViewport = computed(
  () =>
    showPlaySurface.value &&
    phase.value !== 'completed' &&
    !readOnly.value &&
    !error.value &&
    !saveMessage.value,
)

const settingsOpen = ref(false)
const generating = computed(() => phase.value === 'generating')
const showPreparationProgress = useDelayedProgress(() => !ready.value || generating.value)
const showConflictProgress = useDelayedProgress(
  () => conflictAnalysisState.value === 'pending' && phase.value === 'playing',
)
const showNotesProgress = useDelayedProgress(notesLoading)
const showHintProgress = useDelayedProgress(hintLoading)
const analysisMessage = computed(() => {
  if (!hasSession.value || phase.value !== 'playing') {
    return ''
  }

  if (conflictAnalysisState.value === 'failed') {
    return '线索检查暂时无法完成，仅显示已确认的冲突。'
  }

  if (showNotesProgress.value) {
    return '正在生成候选数，修改局面会取消本次计算。'
  }

  if (showHintProgress.value) {
    return '正在寻找逻辑提示…'
  }

  return showConflictProgress.value ? '正在检查线索，仅显示已确认的冲突。' : ''
})

const inputEditable = computed(
  () =>
    hasSession.value &&
    editable.value &&
    selectedCell.value !== null &&
    session.value?.puzzle.givens[selectedCell.value] === 0,
)
const selectedNotes = computed(() =>
  hasSession.value &&
  phase.value !== 'paused' &&
  phase.value !== 'generating' &&
  selectedCell.value !== null
    ? (session.value?.notes[selectedCell.value] ?? 0)
    : 0,
)
const selectionMessage = computed(() => {
  if (!hasSession.value || generating.value) {
    return ''
  }

  if (readOnly.value) {
    return '当前为只读状态，请先取得编辑权。'
  }

  if (phase.value === 'paused') {
    return '游戏已暂停，继续后可以填写。'
  }

  if (phase.value === 'completed') {
    return '本局已完成。'
  }

  if (selectedCell.value === null) {
    return '先选择一个空格，再填写数字。'
  }

  const position = `第${Math.floor(selectedCell.value / 9) + 1}行第${(selectedCell.value % 9) + 1}列`

  return inputEditable.value ? `已选 ${position}` : `${position}是题目给定，不能修改。`
})

const preferences = usePreferencesStore()
const showTimer = computed({
  get: () => preferences.settings.showTimer,
  set: (value: boolean) => {
    void preferences.update({ showTimer: value })
  },
})
const highlightConflicts = computed({
  get: () => preferences.settings.highlightConflicts,
  set: (value: boolean) => {
    void preferences.update({ highlightConflicts: value })
  },
})

const confirmation = ref<'restart' | 'new' | 'reload' | null>(null)
const confirmationContent = computed(() => {
  if (confirmation.value === 'reload') {
    return {
      title: '重新载入最新存档？',
      description:
        '将以本机最新存档替换当前页面内容，未保存的填写和笔记会丢失。其他标签页仍在编辑时，本页保持只读。',
      confirmLabel: '确认重新载入',
    }
  }

  if (confirmation.value === 'restart') {
    return {
      title: '重新开始这道题？',
      description:
        props.metadata.kind === 'daily'
          ? '将清除填写和笔记，保留累计用时、辅助次数与正式挑战资格。'
          : '将清除本局填写，重新计时。已经完成的成绩仍会保留。',
      confirmLabel: '确认开始',
    }
  }

  return {
    title: '开始新的一局？',
    description: `新题准备好后将替换${getVariantPresentation(nextVariant.value).label}的存档。其他玩法会保留。取消或出题失败会保留原局。`,
    confirmLabel: '确认开始',
  }
})

const displayedHintStep = ref<LogicalStep | null>(null)
watch(hint, () => {
  displayedHintStep.value = null
})
const hintCells = computed(() => {
  if (hint.value?.kind === 'review-entry') {
    return [hint.value.cell]
  }

  if (hint.value?.kind === 'deduction') {
    const step = displayedHintStep.value ?? hint.value.steps[0]

    return step?.evidence.cells ?? []
  }

  return []
})
const highlightedCells = computed(() => [...new Set([...hintCells.value, ...checkedCells.value])])
const displayedConflicts = computed(() => (highlightConflicts.value ? conflicts.value : []))
const relatedCells = computed(() =>
  session.value && selectedCell.value !== null
    ? (ruleMetadata.value?.relatedCells[selectedCell.value] ?? [])
    : [],
)

const saveLabel = computed(
  () =>
    ({ idle: '尚未保存', saving: '正在保存…', saved: '已保存到本机', failed: '尚未保存' })[
      saveState.value
    ],
)

useGameKeyboard()
const { departing } = useGameLifecycle()
watch(
  departing,
  (value) => {
    if (value) {
      // Library dialogs teleport outside the inert game surface and must relinquish input as well.
      settingsOpen.value = false
      setupOpen.value = false
      confirmation.value = null
    }
  },
  { flush: 'sync' },
)
const livePresentation = computed(() => ({
  session: session.value,
  board: board.value,
  phase: phase.value,
  editable: editable.value,
  selectedCell: selectedCell.value,
  noteMode: noteMode.value,
  hint: hint.value,
  hintLoading: hintLoading.value,
  notesLoading: notesLoading.value,
  conflictAnalysisState: conflictAnalysisState.value,
  checkedCells: checkedCells.value,
  checkIsCurrent: checkIsCurrent.value,
  readOnly: readOnly.value,
  elapsedMs: elapsedMs.value,
  canUndo: canUndo.value,
  canRedo: canRedo.value,
  activeVariant: activeVariant.value,
  conflictEvaluation: conflictEvaluation.value,
  inputEditable: inputEditable.value,
  selectedNotes: selectedNotes.value,
  selectionMessage: selectionMessage.value,
  analysisMessage: analysisMessage.value,
  highlightedCells: highlightedCells.value,
  displayedConflicts: displayedConflicts.value,
  relatedCells: relatedCells.value,
  saveLabel: saveLabel.value,
  fitViewport: fitViewport.value,
}))
// Keep the last painted position while saving. The inert surface blocks input until failure or exit.
const presentation = computed<typeof livePresentation.value>((previous) =>
  departing.value && previous ? previous : livePresentation.value,
)

async function requestNew(event?: MouseEvent) {
  if (event?.currentTarget instanceof HTMLElement) {
    event.currentTarget.focus()
  }

  if (await entry.requestNew()) {
    confirmation.value = 'new'
  }
}

function requestReload(event: MouseEvent) {
  if (event.currentTarget instanceof HTMLElement) {
    event.currentTarget.focus()
  }

  confirmation.value = 'reload'
}

function requestRestart(event?: MouseEvent) {
  if (event?.currentTarget instanceof HTMLElement) {
    event.currentTarget.focus()
  }

  confirmation.value = 'restart'
}

async function confirm() {
  const intention = confirmation.value
  confirmation.value = null

  if (intention === 'reload') {
    await game.reloadLatestSession()
  } else if (intention === 'restart') {
    if (props.metadata.kind === 'daily') {
      await game.restartDaily()
    } else {
      const transition = await game.restartFree()
      if (transition?.status === 'ready') {
        await syncSessionRoute()
      }
    }
  } else {
    await start()
  }
}

function enterDigit(digit: Digit) {
  if (selectedCell.value !== null) {
    game.dispatch({
      kind: noteMode.value ? 'toggle-note' : 'enter',
      cell: selectedCell.value,
      digit,
    })
  }
}

function toggleQuickNote(digit: Digit) {
  if (inputEditable.value && selectedCell.value !== null) {
    game.dispatch({ kind: 'toggle-note', cell: selectedCell.value, digit })
  }
}

function erase() {
  if (selectedCell.value !== null) {
    game.dispatch({ kind: 'erase', cell: selectedCell.value })
  }
}
</script>
<template>
  <section
    class="game-page"
    :inert="departing || undefined"
    :aria-busy="departing"
    :data-viewport-fit="presentation.fitViewport ? '' : undefined"
    :style="boardSizeStyle"
  >
    <div v-if="!showPlaySurface" class="page-heading">
      <p class="eyebrow">一格一念 / {{ heading }}</p>
      <h1>{{ heading }}</h1>
    </div>
    <slot :active="active" :departing="departing" />
    <NAlert
      v-if="!queryVariant.valid && metadata.kind !== 'daily'"
      class="feedback-message"
      type="error"
      :show-icon="false"
    >
      无法识别指定的玩法，请选择有效的数独类型。
      <RouterLink v-slot="{ href, navigate }" to="/play/free" custom>
        <NButton tag="a" :href="href" @click="navigate">返回标准数独</NButton>
      </RouterLink>
    </NAlert>
    <NAlert v-if="initializationError" class="feedback-message" type="error" :show-icon="false">
      {{ initializationError }} <NButton @click="initialize">重新读取</NButton>
    </NAlert>
    <NAlert v-if="error" class="feedback-message" type="error" :show-icon="false">
      {{ error }}
      <NButton v-if="canRetryGeneration" @click="retryGeneration">重试出题</NButton>
    </NAlert>
    <template v-if="showPlaySurface">
      <NAlert
        v-if="
          hasSession &&
          presentation.conflictEvaluation.status === 'budget-exhausted' &&
          presentation.conflictAnalysisState === 'ready' &&
          presentation.phase === 'playing'
        "
        class="feedback-message"
        type="warning"
        :show-icon="false"
        >冲突检查超出预算，仅显示已确认的冲突，尚不能保证其他线索有效。</NAlert
      >
      <NCard
        v-if="hasSession && presentation.readOnly"
        class="feedback-message"
        size="small"
        role="status"
      >
        当前无法编辑：本局正在其他标签页编辑，或存档已变化。可重新载入最新存档；其他页面退出后，可重新取得编辑权。
        <NButton @click="requestReload">重新载入</NButton>
      </NCard>
      <NAlert
        v-if="hasSession && saveMessage"
        class="feedback-message"
        type="error"
        :show-icon="false"
      >
        {{ saveMessage }}
        <NButton v-if="!presentation.readOnly" @click="game.retrySave">重试保存</NButton>
      </NAlert>
      <div
        class="game-layout"
        :class="{
          'has-feedback':
            presentation.hint || presentation.checkedCells.length || presentation.checkIsCurrent,
        }"
      >
        <div class="play-surface">
          <header class="session-heading">
            <h1>
              {{ heading }} ·
              {{
                getVariantPresentation(hasSession ? presentation.activeVariant : nextVariant).label
              }}
            </h1>
            <p v-if="displayedMetadata?.kind === 'daily'" class="session-context">
              {{ displayedMetadata.challengeDate }} ·
              {{ displayedMetadata.formalAttempt ? '正式挑战' : '练习重玩' }}
            </p>
            <div class="session-bar">
              <p
                v-if="presentation.analysisMessage"
                class="analysis-status"
                role="status"
                :title="presentation.analysisMessage"
              >
                {{ presentation.analysisMessage }}
              </p>
              <div v-else-if="hasSession && presentation.session" class="session-summary">
                <span
                  >{{ DIFFICULTY_NAMES[presentation.session.puzzle.difficulty] }}
                  <span class="badge">{{
                    presentation.session.assistance.assisted ? '已使用辅助' : '独立思考'
                  }}</span>
                </span>
                <span class="save-status" role="status">{{ presentation.saveLabel }}</span>
              </div>
              <span v-else class="session-summary">{{ DIFFICULTY_NAMES[difficulty] }}</span>
              <span
                class="session-timer"
                :class="{ 'timer-hidden': !showTimer || !hasSession }"
                :aria-hidden="!showTimer || !hasSession"
                aria-label="游戏用时"
              >
                {{ formatDuration(hasSession ? presentation.elapsedMs : 0) }}
              </span>
              <NButton v-if="hasSession && presentation.phase === 'playing'" @click="game.pause"
                >暂停</NButton
              >
              <NButton
                v-else-if="hasSession && presentation.phase === 'paused'"
                @click="game.resume"
              >
                {{ presentation.readOnly ? '尝试接管' : '继续游戏' }}
              </NButton>
            </div>
          </header>
          <div ref="boardSpace" class="board-space">
            <div class="board-wrap">
              <SudokuBoard
                v-if="hasSession && presentation.session"
                :board="presentation.board"
                :givens="presentation.session.puzzle.givens"
                :notes="presentation.session.notes"
                :rules="presentation.session.puzzle.rules"
                :show-selected-rules="false"
                :related-cells="presentation.relatedCells"
                :selected-cell="presentation.selectedCell"
                :conflicts="presentation.displayedConflicts"
                :hint-cells="presentation.highlightedCells"
                :disabled="presentation.phase === 'paused' || presentation.phase === 'generating'"
                :obscured="presentation.phase === 'paused' || presentation.phase === 'generating'"
                @select="game.selectCell"
              />
              <div v-else class="board-placeholder" aria-hidden="true" />
              <div v-if="generating || !ready" class="preparation-cover">
                <GenerationStatus
                  v-if="showPreparationProgress && !setupOpen"
                  :message="generating ? '正在生成题目…' : '正在读取存档…'"
                  :description="
                    generating ? '正在检查唯一解与难度，请稍候。' : '对局准备好后即可继续。'
                  "
                />
                <NButton v-if="generating && !setupOpen" @click="game.cancelLoading"
                  >取消出题</NButton
                >
              </div>
              <div v-else-if="hasSession && presentation.phase === 'paused'" class="pause-cover">
                <span>稍作停留</span
                ><NButton type="primary" @click="game.resume">
                  {{ presentation.readOnly ? '尝试接管' : '继续游戏' }}
                </NButton>
              </div>
            </div>
          </div>
          <GameControls
            :inactive="departing"
            :editable="hasSession && presentation.editable"
            :input-editable="presentation.inputEditable"
            :selection-message="presentation.selectionMessage"
            :announce-selection="!generating"
            :note-mode="presentation.noteMode"
            :selected-notes="presentation.selectedNotes"
            :can-undo="hasSession && presentation.canUndo"
            :can-redo="hasSession && presentation.canRedo"
            :hint-loading="presentation.hintLoading"
            :notes-loading="presentation.notesLoading"
            :can-restart="
              hasSession &&
              !presentation.readOnly &&
              presentation.phase !== 'generating' &&
              !(metadata.kind === 'daily' && presentation.phase === 'completed')
            "
            :can-start-new="
              ready &&
              presentation.phase !== 'generating' &&
              (metadata.kind === 'daily' || !presentation.readOnly) &&
              queryVariant.valid
            "
            :new-game-label="metadata.kind === 'daily' ? '选择其他挑战' : '新开一局'"
            @digit="enterDigit"
            @quick-note="toggleQuickNote"
            @erase="erase"
            @note="game.toggleNoteMode"
            @undo="game.dispatch({ kind: 'undo' })"
            @redo="game.dispatch({ kind: 'redo' })"
            @candidates="game.dispatch({ kind: 'generate-notes' })"
            @check="game.dispatch({ kind: 'check' })"
            @hint="game.requestHint"
            @settings="settingsOpen = true"
            @new="requestNew()"
            @restart="requestRestart()"
          />
        </div>
        <div v-if="hasSession && presentation.session" class="game-feedback">
          <SelectedCellRules
            class="selected-context"
            :rules="presentation.session.puzzle.rules"
            :selected-cell="presentation.selectedCell"
            :obscured="presentation.phase === 'paused' || presentation.phase === 'generating'"
          />
          <HintPanel
            v-if="presentation.hint"
            :hint="presentation.hint"
            @highlight="displayedHintStep = $event"
            @apply="game.applyHint"
            @dismiss="game.dismissHint"
          />
          <NCard
            v-if="presentation.checkedCells.length"
            class="feedback-message"
            size="small"
            role="status"
          >
            标有圆点的 {{ presentation.checkedCells.length }} 格需要重新检查。
          </NCard>
          <p v-else-if="presentation.checkIsCurrent && !presentation.hint" class="muted">
            检查结果：当前没有发现错误填写。
          </p>
        </div>
      </div>
      <div
        v-if="hasSession && presentation.session && presentation.phase === 'completed'"
        class="panel completion"
        role="status"
      >
        <h2>解开了，做得很好。</h2>
        <p>
          {{ DIFFICULTY_NAMES[presentation.session.puzzle.difficulty] }} ·
          {{ formatDuration(presentation.elapsedMs) }} ·
          {{ presentation.session.assistance.assisted ? '辅助完成' : '无辅助完成' }}
        </p>
        <p>{{ saveState === 'saved' ? '成绩已保存到本机。' : '本局已完成，成绩仍待保存。' }}</p>
        <RouterLink v-slot="{ href, navigate }" to="/records" custom>
          <NButton tag="a" type="primary" secondary :href="href" @click="navigate">
            查看个人记录 <span aria-hidden="true"> →</span>
          </NButton>
        </RouterLink>
      </div>
    </template>
    <div
      v-else-if="ready && presentation.phase !== 'generating' && metadata.kind !== 'daily'"
      class="panel empty-game"
    >
      <span aria-hidden="true">▦</span>
      <h2>让思绪落在这九宫格里</h2>
      <p class="muted">选择一个适合自己的难度，随时暂停，也可以跟着提示学习。</p>
      <NButton
        type="primary"
        size="large"
        :disabled="!queryVariant.valid || presentation.readOnly"
        @click="requestNew"
        >开始游戏</NButton
      >
    </div>
    <GameSetupDialog
      v-if="setupOpen && !departing"
      v-model:variant="nextVariant"
      v-model:difficulty="difficulty"
      :saved-summary="targetSummary"
      :blocked="targetPending || !!targetError"
      :retryable="true"
      :busy="targetLoading"
      :generating="generating"
      :error="targetError"
      @retry="retryTarget"
      @cancel="setupOpen = false"
      @start="startSelected"
      @resume="resumeTarget"
    />
    <GameSettingsDialog
      v-if="settingsOpen && active && !departing"
      v-model:show="settingsOpen"
      v-model:show-timer="showTimer"
      v-model:highlight-conflicts="highlightConflicts"
    >
      <h3 class="settings-heading">玩法规则</h3>
      <p class="rule-summary">{{ getVariantPresentation(presentation.activeVariant).ruleText }}</p>
      <h3 class="settings-heading">辅助与成绩</h3>
      <p class="rule-summary">使用逻辑提示、检查填写或生成候选数，会将本局记为「辅助完成」。</p>
      <slot name="settings" />
    </GameSettingsDialog>
    <ConfirmationDialog
      v-if="confirmation && !departing"
      :title="confirmationContent.title"
      :description="confirmationContent.description"
      :confirm-label="confirmationContent.confirmLabel"
      :destructive="confirmation === 'reload'"
      @cancel="confirmation = null"
      @confirm="confirm"
    />
  </section>
</template>
<style scoped>
.game-page {
  padding-top: 16px;
}
.rule-summary {
  color: var(--muted);
  line-height: 1.7;
}
.page-heading {
  max-width: 560px;
  margin: 0 auto;
}
.page-heading h1 {
  margin: 4px 0;
  font-size: 28px;
}
.eyebrow {
  color: var(--muted);
  font-size: 12px;
  letter-spacing: 1px;
  margin: 0;
}
.session-heading {
  margin-bottom: 12px;
}
.session-heading h1 {
  margin: 0 0 8px;
  font-size: 22px;
  line-height: 1.3;
}
.session-bar {
  min-height: 48px;
  display: flex;
  align-items: center;
  gap: 14px;
}
.session-bar > :first-child {
  margin-right: auto;
}
.session-summary {
  display: grid;
  gap: 2px;
}
.analysis-status {
  flex: 1;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--muted);
  font-size: 12px;
}
.session-timer {
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}
.timer-hidden {
  visibility: hidden;
}
.save-status {
  color: var(--muted);
  font-size: 12px;
}
.selected-context {
  margin: 0 0 16px;
}
.badge {
  display: inline-block;
  padding: 3px 8px;
  border-radius: 16px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 11px;
  margin-left: 8px;
}
.game-layout {
  display: grid;
  grid-template-columns: minmax(0, 560px);
  justify-content: center;
  gap: 24px;
  align-items: start;
}
.game-layout.has-feedback,
.game-layout:has(.selected-context) {
  grid-template-columns: minmax(0, 560px) minmax(0, 340px);
}
.play-surface {
  width: 100%;
  max-width: clamp(320px, calc(100dvh - 440px), 560px);
  margin: 0 auto;
}
.session-context {
  margin: 0;
  font-size: 12px;
  color: var(--muted);
}
.game-feedback :deep(.hint-panel) {
  margin-top: 0;
}
.game-feedback:empty {
  display: none;
}
.board-wrap {
  position: relative;
  aspect-ratio: 1;
}
.board-placeholder {
  width: 100%;
  height: 100%;
  border: 1px solid var(--border);
  border-radius: 2px;
  background: var(--surface);
}
.preparation-cover {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 16px;
}
.preparation-cover :deep(.generation-status) {
  max-width: 100%;
}
.board-space {
  min-width: 0;
}
.pause-cover {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 18px;
  font-size: 24px;
}
.settings-heading {
  margin: 20px 0 8px;
  font-size: 14px;
}
.completion {
  margin-top: 24px;
}
.completion h2 {
  margin-top: 0;
}
.empty-game {
  text-align: center;
  padding: 48px 24px;
  margin-top: 24px;
}
.empty-game > span {
  font-size: 70px;
  color: var(--accent);
}
@media (min-width: 801px) and (min-height: 720px) and (pointer: fine) {
  .game-page[data-viewport-fit] {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    padding-bottom: 16px;
  }
  [data-viewport-fit] .game-layout {
    flex: 1;
    min-height: 0;
    grid-template-rows: minmax(0, 1fr);
    align-items: stretch;
  }
  [data-viewport-fit] .play-surface {
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%;
    max-width: 560px;
  }
  [data-viewport-fit] .board-space {
    display: grid;
    place-items: start center;
    flex: 1;
    min-height: 320px;
    max-height: 560px;
  }
  [data-viewport-fit] .board-wrap {
    width: var(--board-side, 320px);
    max-width: 100%;
  }
  [data-viewport-fit] .play-surface > :not(.board-space) {
    flex-shrink: 0;
    align-self: center;
    width: var(--board-side, 320px);
    max-width: 100%;
  }
}
@media (max-width: 800px) {
  .game-page[data-viewport-fit] {
    display: flex;
    flex-direction: column;
    flex: 1;
  }
  .game-page[data-viewport-fit]::before,
  .game-page[data-viewport-fit]::after {
    content: '';
    flex: 2 0 0;
  }
  .game-page[data-viewport-fit]::after {
    flex-grow: 3;
  }
  .game-page[data-viewport-fit] > * {
    flex-shrink: 0;
  }
  .game-layout,
  .game-layout.has-feedback,
  .game-layout:has(.selected-context) {
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
  }
  .play-surface {
    max-width: 560px;
  }
  .page-heading {
    max-width: 560px;
  }
  .game-page {
    padding-top: 16px;
  }
  .eyebrow {
    display: none;
  }
  .page-heading h1 {
    font-size: 22px;
    margin: 0 0 4px;
  }
  .session-bar {
    gap: 6px;
  }
  .badge {
    margin-left: 4px;
  }
}
@media (pointer: coarse) {
  .play-surface,
  .page-heading {
    max-width: 560px;
  }
}
</style>
