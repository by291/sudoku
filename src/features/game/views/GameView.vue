<script setup lang="ts">
import { NAlert, NButton, NCard, NRadioGroup, NRadioButton, NCheckbox, NSelect } from 'naive-ui'
import { computed, ref, watch, onScopeDispose } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import type { LogicalStep } from '@/core/sudoku/techniques'
import type { Difficulty, Digit } from '@/core/sudoku/types'
import { compileRules } from '@/core/sudoku/rules'
import { createGenerationInput } from '@/core/sudoku/generation'
import type { SudokuVariant } from '@/core/sudoku/rules'
import { isSudokuVariant } from '@/core/sudoku/rules'
import {
  VARIANT_OPTIONS,
  VARIANT_NAMES,
  VARIANT_RULE_TEXT,
  parseVariantQuery,
} from '@/features/game/model/variants'
import type { SessionRecord } from '@/storage/records'
import type { SessionMetadata } from '@/features/game/model/session'
import { useGameStore } from '@/features/game/stores/useGameStore'
import { useGameRuntime } from '@/infrastructure/runtime'
import { usePreferencesStore } from '@/features/settings/stores/usePreferencesStore'
import { useGameKeyboard } from '@/features/game/composables/useGameKeyboard'
import { useGameLifecycle } from '@/features/game/composables/useGameLifecycle'
import { DIFFICULTY_NAMES, formatDuration } from '@/features/game/model/presentation'
import SudokuBoard from '@/shared/components/SudokuBoard.vue'
import GameControls from '@/features/game/components/GameControls.vue'
import HintPanel from '@/features/game/components/HintPanel.vue'
import ConfirmationDialog from '@/shared/components/ConfirmationDialog.vue'
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
const route = useRoute()
const router = useRouter()
const runtime = useGameRuntime()
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
} = storeToRefs(game)
const difficulty = ref<Difficulty>(props.practiceDifficulty)
const variantOptions = [...VARIANT_OPTIONS]
const variantMenuOpen = ref(false)
const nextVariant = ref<SudokuVariant>(props.practiceVariant)
const queryVariant = computed(() => parseVariantQuery(route.query.variant))
const targetSession = ref<SessionRecord | null>(null)
let targetLookup = 0
async function refreshTarget() {
  const epoch = ++targetLookup
  if (props.metadata.kind !== 'free') return
  const result = await game.findFreeSession(nextVariant.value)
  if (epoch !== targetLookup) return
  targetSession.value = result.ok ? result.value : null
  if (!result.ok)
    initializationError.value = '目标玩法存档读取失败。新开一局可暂存在内存中，请保持页面打开。'
}
function updateVariant(value: unknown) {
  if (isSudokuVariant(value)) nextVariant.value = value
}
watch(nextVariant, () => {
  void refreshTarget()
})
function updateDifficulty(value: string | number | boolean) {
  if (value === 'easy' || value === 'medium' || value === 'hard') difficulty.value = value
}
const inputEditable = computed(
  () =>
    editable.value &&
    selectedCell.value !== null &&
    session.value?.puzzle.givens[selectedCell.value] === 0,
)
const selectionMessage = computed(() => {
  if (readOnly.value) return '当前为只读状态，请先取得编辑权。'
  if (phase.value === 'paused') return '游戏已暂停，继续后可以填写。'
  if (phase.value === 'completed') return '本局已完成。'
  if (selectedCell.value === null) return '先选择一个空格，再填写数字。'
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
  if (confirmation.value === 'reload')
    return {
      title: '重新载入最新存档？',
      description:
        '将以本机最新存档替换当前页面内容，未保存的填写和笔记会丢失。其他标签页仍在编辑时，本页保持只读。',
      confirmLabel: '确认重新载入',
    }
  if (confirmation.value === 'restart')
    return {
      title: '重新开始这道题？',
      description:
        props.metadata.kind === 'daily'
          ? '将清除填写和笔记，保留累计用时、辅助次数与正式挑战资格。'
          : '将清除本局填写，重新计时。已经完成的成绩仍会保留。',
      confirmLabel: '确认开始',
    }
  return {
    title: '开始新的一局？',
    description: `新题准备好后将替换${VARIANT_NAMES[nextVariant.value]}的存档。其他玩法会保留。取消或出题失败会保留原局。`,
    confirmLabel: '确认开始',
  }
})
const ready = ref(false)
const replacementAvailable = ref(false)
const initializationError = ref<string | null>(null)
let initialization = 0
let disposed = false
onScopeDispose(() => {
  disposed = true
  initialization++
  targetLookup++
})
const active = computed(
  () =>
    session.value &&
    session.value.mode === props.metadata.kind &&
    (props.metadata.kind !== 'learning' ||
      (session.value.metadata.kind === 'learning' &&
        session.value.metadata.lessonId === props.metadata.lessonId)),
)
const displayedHintStep = ref<LogicalStep | null>(null)
watch(hint, () => {
  displayedHintStep.value = null
})
const hintCells = computed(() =>
  hint.value?.kind === 'review-entry'
    ? [hint.value.cell]
    : hint.value?.kind === 'deduction'
      ? ((displayedHintStep.value ?? hint.value.steps[0])?.evidence.cells ?? [])
      : [],
)
const highlightedCells = computed(() => [...new Set([...hintCells.value, ...checkedCells.value])])
const displayedConflicts = computed(() => (highlightConflicts.value ? conflicts.value : []))
const relatedCells = computed(() =>
  session.value && selectedCell.value !== null
    ? compileRules(session.value.puzzle.rules).relatedCells[selectedCell.value]
    : [],
)
const saveLabel = computed(
  () =>
    ({ idle: '尚未保存', saving: '正在保存…', saved: '已保存到本机', failed: '尚未保存' })[
      saveState.value
    ],
)
async function initialize() {
  const current = ++initialization
  const requestedId = typeof route.query.session === 'string' ? route.query.session : null
  ready.value = false
  initializationError.value = null
  if (!queryVariant.value.valid) {
    ready.value = true
    return
  }
  // Updating the URL after a successful transition must not pause or reload that session.
  if (props.autoRestore && requestedId === session.value?.id && active.value) {
    nextVariant.value = activeVariant.value
    ready.value = true
    void refreshTarget()
    return
  }
  nextVariant.value =
    props.metadata.kind === 'learning' ? props.practiceVariant : queryVariant.value.value
  if (props.autoRestore) {
    const records = requestedId
      ? await game.findSession(requestedId)
      : props.metadata.kind === 'free'
        ? await game.findFreeSession(nextVariant.value)
        : await game.findPracticeSession()
    if (current !== initialization) return
    if (!records.ok)
      initializationError.value = '读取存档失败。新开一局可暂存在内存中，请保持页面打开。'
    else {
      replacementAvailable.value = !!records.value
      const id = requestedId
      const record = records.value
      if (
        record &&
        record.session.mode === props.metadata.kind &&
        (props.metadata.kind !== 'learning' ||
          (record.session.metadata.kind === 'learning' &&
            record.session.metadata.lessonId === props.metadata.lessonId))
      ) {
        const transition = await game.restoreSession(record.session.id)
        if (current !== initialization) return
        if (transition.status === 'ready') nextVariant.value = record.session.puzzle.rules.kind
      } else {
        await game.clearActiveSession()
        if (current !== initialization) return
        if (id) initializationError.value = '存档与当前模式不匹配，或已被清除。'
      }
    }
  }
  if (current !== initialization) return
  ready.value = true
  void refreshTarget()
}
watch(
  () => [
    route.query.session,
    route.query.variant,
    props.practiceVariant,
    props.metadata.kind,
    props.metadata.kind === 'learning' ? props.metadata.lessonId : '',
  ],
  () => {
    void initialize()
  },
  { immediate: true },
)
useGameKeyboard()
useGameLifecycle()
async function start() {
  if (!queryVariant.value.valid) return
  const transition = await game.startGame(
    createGenerationInput(nextVariant.value, difficulty.value, runtime.createId()),
    props.metadata,
  )
  if (transition.status === 'ready') await syncSessionRoute()
  if (disposed) return
  await refreshTarget()
}
async function syncSessionRoute() {
  if (disposed || props.metadata.kind === 'daily' || !active.value || !session.value) return
  await router.replace({
    query: { ...route.query, variant: activeVariant.value, session: session.value.id },
  })
}
async function retryGeneration() {
  const transition = await game.retryGeneration()
  if (transition?.status === 'ready') await syncSessionRoute()
}
async function requestNew(event: MouseEvent) {
  if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus()
  await refreshTarget()
  if (
    targetSession.value ||
    (props.metadata.kind === 'learning' && (active.value || replacementAvailable.value))
  )
    confirmation.value = 'new'
  else void start()
}
async function resumeTarget() {
  if (!targetSession.value) return
  const transition = await game.restoreSession(targetSession.value.session.id)
  if (transition.status === 'ready') {
    await game.resume()
    await syncSessionRoute()
  }
}
function requestReload(event: MouseEvent) {
  if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus()
  confirmation.value = 'reload'
}
function requestRestart(event: MouseEvent) {
  if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus()
  confirmation.value = 'restart'
}
async function confirm() {
  const intention = confirmation.value
  confirmation.value = null
  if (intention === 'reload') {
    await game.reloadLatestSession()
  } else if (intention === 'restart') {
    if (props.metadata.kind === 'daily') await game.restartDaily()
    else {
      const transition = await game.restartFree()
      if (transition?.status === 'ready') await syncSessionRoute()
    }
  } else await start()
}
function enterDigit(digit: Digit) {
  if (selectedCell.value !== null)
    game.dispatch({
      kind: noteMode.value ? 'toggle-note' : 'enter',
      cell: selectedCell.value,
      digit,
    })
}
function erase() {
  if (selectedCell.value !== null) game.dispatch({ kind: 'erase', cell: selectedCell.value })
}
</script>
<template>
  <section class="game-page">
    <div class="page-heading">
      <div>
        <p class="eyebrow">一格一念 / {{ heading }}</p>
        <h1>
          {{ heading }}<template v-if="active"> · {{ VARIANT_NAMES[activeVariant] }}</template>
        </h1>
      </div>
      <RouterLink to="/">返回首页</RouterLink>
    </div>
    <slot />
    <NAlert
      v-if="!queryVariant.valid && metadata.kind !== 'daily'"
      class="feedback-message"
      type="error"
      :show-icon="false"
    >
      无法识别指定的玩法，请选择有效的数独类型。<RouterLink to="/play/free"
        >返回标准数独</RouterLink
      >
    </NAlert>
    <NAlert v-if="initializationError" class="feedback-message" type="error" :show-icon="false">
      {{ initializationError }} <NButton @click="initialize">重新读取</NButton>
    </NAlert>
    <NAlert v-if="error" class="feedback-message" type="error" :show-icon="false">
      {{ error }}
      <NButton v-if="canRetryGeneration" @click="retryGeneration">重试出题</NButton>
    </NAlert>
    <p v-if="!ready" role="status">正在读取存档…</p>
    <div v-if="metadata.kind !== 'daily'" class="setup-row">
      <label v-if="metadata.kind === 'free'" class="variant-field"
        >下一局玩法
        <NSelect
          v-model:show="variantMenuOpen"
          filterable
          :value="nextVariant"
          :options="variantOptions"
          :disabled="phase === 'generating' || !queryVariant.valid"
          :input-props="{
            role: 'combobox',
            'aria-label': '下一局玩法',
            'aria-expanded': variantMenuOpen,
            'aria-controls': 'next-variant-menu',
          }"
          :menu-props="{ id: 'next-variant-menu', role: 'listbox', 'aria-label': '玩法选项' }"
          :node-props="
            (option) => ({ role: 'option', 'aria-selected': option.value === nextVariant })
          "
          @update:value="updateVariant"
        />
      </label>
      <span id="difficulty-label">难度</span>
      <NRadioGroup
        :value="difficulty"
        name="next-difficulty"
        role="radiogroup"
        aria-labelledby="difficulty-label"
        :disabled="phase === 'generating' || metadata.kind === 'learning'"
        @update:value="updateDifficulty"
      >
        <NRadioButton v-for="(name, value) in DIFFICULTY_NAMES" :key="value" :value="value">{{
          name
        }}</NRadioButton>
      </NRadioGroup>
      <NButton
        :type="active ? 'default' : 'primary'"
        :disabled="!ready || phase === 'generating' || readOnly || !queryVariant.valid"
        @click="requestNew"
      >
        {{ active ? '新开一局' : '开始游戏' }}
      </NButton>
    </div>
    <NCard
      v-if="
        metadata.kind === 'free' &&
        targetSession &&
        !targetSession.session.completion &&
        targetSession.session.id !== session?.id
      "
      class="feedback-message"
      size="small"
    >
      {{ VARIANT_NAMES[nextVariant] }}有未完成的存档。可以继续，或新开一局替换此玩法存档。
      <NButton @click="resumeTarget">继续{{ VARIANT_NAMES[nextVariant] }}存档</NButton>
    </NCard>
    <NCard v-if="phase === 'generating'" class="feedback-message" size="small" role="status">
      正在为你准备一道有唯一解的题目… <NButton @click="game.cancelLoading">取消出题</NButton>
    </NCard>
    <template v-if="active && session">
      <p class="rule-summary">{{ VARIANT_RULE_TEXT[activeVariant] }}</p>
      <NAlert
        v-if="conflictEvaluation.status === 'budget-exhausted'"
        class="feedback-message"
        type="warning"
        :show-icon="false"
        >冲突检查超出预算，仅显示已确认的冲突，尚不能保证其他线索有效。</NAlert
      >
      <ul
        v-if="highlightConflicts && conflictEvaluation.violations.length && phase === 'playing'"
        class="rule-violations"
      >
        <li v-for="violation in conflictEvaluation.violations" :key="violation.constraintId">
          {{ violation.message }}
        </li>
      </ul>
      <NCard v-if="readOnly" class="feedback-message" size="small" role="status">
        当前无法编辑：本局正在其他标签页编辑，或存档已变化。可重新载入最新存档；其他页面退出后，可重新取得编辑权。
        <NButton @click="requestReload">重新载入</NButton>
      </NCard>
      <NAlert v-if="saveMessage" class="feedback-message" type="error" :show-icon="false">
        {{ saveMessage }} <NButton v-if="!readOnly" @click="game.retrySave">重试保存</NButton>
      </NAlert>
      <div class="session-bar">
        <span
          >{{ DIFFICULTY_NAMES[session.puzzle.difficulty] }}
          <span class="badge">{{
            session.assistance.assisted ? '已使用辅助' : '独立思考'
          }}</span></span
        ><span v-if="showTimer" aria-label="游戏用时">{{ formatDuration(elapsedMs) }}</span
        ><NButton v-if="phase === 'playing'" @click="game.pause">暂停</NButton
        ><NButton v-else-if="phase === 'paused'" @click="game.resume">
          {{ readOnly ? '尝试接管' : '继续游戏' }}
        </NButton>
      </div>
      <div class="game-layout">
        <div>
          <div class="board-wrap">
            <SudokuBoard
              :board="board"
              :givens="session.puzzle.givens"
              :notes="session.notes"
              :rules="session.puzzle.rules"
              :related-cells="relatedCells"
              :selected-cell="selectedCell"
              :conflicts="displayedConflicts"
              :hint-cells="highlightedCells"
              :disabled="phase === 'paused' || phase === 'generating'"
              :obscured="phase === 'paused' || phase === 'generating'"
              @select="game.selectCell"
            />
            <div v-if="phase === 'paused'" class="pause-cover">
              <span>稍作停留</span
              ><NButton type="primary" @click="game.resume">
                {{ readOnly ? '尝试接管' : '继续游戏' }}
              </NButton>
            </div>
          </div>
          <div class="board-footer">
            <span role="status">{{ saveLabel }}</span
            ><span>方向键移动 · N 切换笔记</span>
          </div>
        </div>
        <div>
          <GameControls
            :editable="editable"
            :input-editable="inputEditable"
            :selection-message="selectionMessage"
            :note-mode="noteMode"
            :can-undo="canUndo"
            :can-redo="canRedo"
            :hint-loading="hintLoading"
            @digit="enterDigit"
            @erase="erase"
            @note="game.toggleNoteMode"
            @undo="game.dispatch({ kind: 'undo' })"
            @redo="game.dispatch({ kind: 'redo' })"
            @candidates="game.dispatch({ kind: 'generate-notes' })"
            @check="game.dispatch({ kind: 'check' })"
            @hint="game.requestHint"
          /><HintPanel
            v-if="hint"
            :hint="hint"
            @highlight="displayedHintStep = $event"
            @apply="game.applyHint"
            @dismiss="game.dismissHint"
          />
          <NCard v-if="checkedCells.length" class="feedback-message" size="small" role="status">
            标有圆点的 {{ checkedCells.length }} 格需要重新检查。
          </NCard>
          <p v-else-if="checkIsCurrent && !hint" class="muted">检查结果：当前没有发现错误填写。</p>
        </div>
      </div>
      <div v-if="phase === 'completed'" class="panel completion" role="status">
        <h2>解开了，做得很好。</h2>
        <p>
          {{ DIFFICULTY_NAMES[session.puzzle.difficulty] }} · {{ formatDuration(elapsedMs) }} ·
          {{ session.assistance.assisted ? '辅助完成' : '无辅助完成' }}
        </p>
        <p>{{ saveState === 'saved' ? '成绩已保存到本机。' : '本局已完成，成绩仍待保存。' }}</p>
        <RouterLink to="/records">查看个人记录</RouterLink>
      </div>
      <div class="game-preferences">
        <NCheckbox v-model:checked="showTimer" class="preference">显示计时</NCheckbox>
        <NCheckbox v-model:checked="highlightConflicts" class="preference">高亮冲突</NCheckbox>
        <NButton
          :disabled="
            readOnly ||
            phase === 'generating' ||
            (metadata.kind === 'daily' && phase === 'completed')
          "
          @click="requestRestart"
        >
          重新开始本题
        </NButton>
      </div>
    </template>
    <div v-else-if="ready && phase !== 'generating'" class="panel empty-game">
      <span aria-hidden="true">▦</span>
      <h2>让思绪落在这九宫格里</h2>
      <p class="muted">选择一个适合自己的难度，随时暂停，也可以跟着提示学习。</p>
    </div>
    <ConfirmationDialog
      v-if="confirmation"
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
  padding-top: 24px;
}
.variant-field {
  display: grid;
  gap: 8px;
  width: 240px;
  max-width: 100%;
}
.rule-summary {
  color: var(--muted);
  line-height: 1.7;
}
.rule-violations {
  color: var(--error);
  font-size: 14px;
}
.page-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.page-heading h1 {
  margin: 4px 0 16px;
  font-size: 30px;
}
.eyebrow {
  color: var(--muted);
  font-size: 12px;
  letter-spacing: 1px;
  margin: 0;
}
.setup-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin: 0 0 16px;
}
.setup-row :deep(.n-radio-button) {
  padding: 0 12px;
}
.session-bar {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 12px 0;
}
.session-bar > :first-child {
  margin-right: auto;
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
  grid-template-columns: minmax(0, 580px) minmax(0, 340px);
  gap: 28px;
  align-items: start;
}
.board-wrap {
  position: relative;
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
.board-footer {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
  color: var(--muted);
  margin-top: 12px;
}
.game-preferences {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  align-items: center;
  margin-top: 24px;
  font-size: 14px;
}
.preference {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  min-height: 44px;
  padding: 6px 8px;
  cursor: pointer;
}
.preference:focus-visible {
  outline: 3px solid var(--accent);
  outline-offset: 3px;
}
.game-preferences button {
  margin-left: auto;
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
@media (max-width: 700px) {
  .game-layout {
    grid-template-columns: minmax(0, 1fr);
    gap: 20px;
  }
  .game-page {
    padding-top: 16px;
  }
  .eyebrow {
    display: none;
  }
  .page-heading h1 {
    font-size: 25px;
    margin: 0 0 12px;
  }
  .setup-row {
    flex-wrap: wrap;
    font-size: 14px;
  }
  .setup-row :deep(.n-radio-button) {
    padding: 0 10px;
  }
  .session-bar {
    gap: 6px;
  }
  .badge {
    margin-left: 4px;
  }
  .board-footer {
    flex-wrap: wrap;
    font-size: 12px;
  }
  .game-preferences {
    gap: 12px;
  }
}
</style>
