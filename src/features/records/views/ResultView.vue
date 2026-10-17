<script setup lang="ts">
import { computed, onScopeDispose, watch } from 'vue'
import { NAlert, NButton } from 'naive-ui'
import { RouterLink, useRoute } from 'vue-router'
import { useRecordsStore } from '@/features/records/stores/useRecordsStore'
import { sessionBoard } from '@/features/game/model/session'
import { DIFFICULTY_NAMES, formatDuration } from '@/features/game/model/presentation'
import { getVariantPresentation, parseVariantQuery } from '@/features/game/model/variants'
import { modeName } from '@/features/records/model/records'
import { useDelayedProgress } from '@/shared/composables/useDelayedProgress'
import SudokuBoard from '@/shared/components/SudokuBoard.vue'

const records = useRecordsStore()
const reader = Symbol('result-view')
onScopeDispose(() => records.releaseReader(reader))
const route = useRoute()
const session = computed(() => records.result?.session ?? null)
watch(
  () => route.params.id,
  (id) => {
    void records.loadResult(typeof id === 'string' ? id : '', reader)
  },
  { immediate: true },
)
const board = computed(() => (session.value ? sessionBoard(session.value) : []))
const showProgress = useDelayedProgress(() => records.busy)
const backTarget = computed(() => {
  const query = parseVariantQuery(route.query.variant)
  const variant = session.value?.puzzle.rules.kind ?? (query.valid ? query.value : 'classic')

  return { path: '/records', query: { variant, tab: 'history' } }
})
</script>

<template>
  <section class="result-page">
    <header>
      <p class="eyebrow">完成历史 / RECORD</p>
      <h1>已完成的棋局</h1>
      <p class="muted">查看当时完成的棋盘和成绩，记录保持原样。</p>
    </header>

    <NAlert v-if="records.error" type="error" :show-icon="false" class="feedback-message">
      {{ records.error }}
      <NButton :disabled="records.busy" @click="records.retry">重试读取</NButton>
    </NAlert>
    <div class="loading-slot" :aria-busy="records.busy">
      <p v-if="showProgress" role="status" aria-live="polite">正在读取完成记录…</p>
    </div>

    <div v-if="records.loaded && session" class="result-layout">
      <section class="result-board" aria-label="已完成的只读棋盘">
        <SudokuBoard
          :board="board"
          :givens="session.puzzle.givens"
          :notes="session.notes"
          :rules="session.puzzle.rules"
          :selected-cell="null"
          :conflicts="[]"
          :hint-cells="[]"
          :related-cells="[]"
          :disabled="true"
          :obscured="false"
          :show-selected-rules="false"
        />
        <p class="muted rule-copy">
          {{ getVariantPresentation(session.puzzle.rules.kind).ruleText }}
        </p>
      </section>
      <section class="panel result-summary" aria-label="完成成绩">
        <p class="eyebrow">已完成 · 只读查看</p>
        <h2>{{ getVariantPresentation(session.puzzle.rules.kind).label }}</h2>
        <dl>
          <div>
            <dt>模式</dt>
            <dd>{{ modeName(session) }}</dd>
          </div>
          <div>
            <dt>难度</dt>
            <dd>{{ DIFFICULTY_NAMES[session.puzzle.difficulty] }}</dd>
          </div>
          <div>
            <dt>完成用时</dt>
            <dd>{{ formatDuration(session.elapsedMs) }}</dd>
          </div>
          <div>
            <dt>完成时间</dt>
            <dd>
              {{
                session.completion
                  ? new Date(session.completion.completedAt).toLocaleString('zh-CN')
                  : '—'
              }}
            </dd>
          </div>
          <div>
            <dt>辅助情况</dt>
            <dd>{{ session.assistance.assisted ? '辅助完成' : '无辅助完成' }}</dd>
          </div>
        </dl>
        <p class="muted assistance-counts">
          提示 {{ session.assistance.hintCount }} 次 · 检查 {{ session.assistance.checkCount }} 次 ·
          候选数 {{ session.assistance.candidateCount }} 次
        </p>
      </section>
    </div>
    <div
      v-else-if="!records.loaded && !records.error"
      class="result-layout"
      aria-busy="true"
      aria-label="完成记录尚未读取"
    >
      <div class="result-placeholder panel" aria-hidden="true"></div>
      <div class="panel result-summary">
        <h2>—</h2>
        <p>完成用时 —</p>
        <p>完成时间 —</p>
        <p>辅助情况 —</p>
      </div>
    </div>
    <NAlert
      v-else-if="records.loaded && !records.busy"
      type="info"
      :show-icon="false"
      class="feedback-message"
    >
      找不到这条完成记录。记录可能已被清空，或被恢复的备份替换。
    </NAlert>

    <RouterLink v-slot="{ href, navigate }" :to="backTarget" custom>
      <NButton tag="a" :href="href" class="history-back" @click="navigate">查看完成历史</NButton>
    </RouterLink>
  </section>
</template>

<style scoped>
.loading-slot {
  min-height: 32px;
}
.loading-slot p {
  margin: 4px 0;
}
.result-placeholder {
  width: 100%;
  aspect-ratio: 1;
}

.result-page {
  padding-top: var(--page-top-space);
}
header {
  margin-bottom: var(--page-heading-space);
}
h1 {
  margin: 8px 0 12px;
  font-size: 30px;
}
h2 {
  margin: 8px 0 20px;
  font-size: 24px;
}
.eyebrow {
  margin: 0;
  color: var(--accent);
  font-size: 12px;
  letter-spacing: 2px;
}
.result-layout {
  display: grid;
  grid-template-columns: minmax(0, 560px) minmax(260px, 1fr);
  align-items: start;
  gap: 32px;
}
.result-board {
  min-width: 0;
}
.rule-copy,
.assistance-counts {
  font-size: 13px;
  line-height: 1.7;
}
.result-summary {
  background: var(--accent-soft);
}
dl {
  display: grid;
  gap: 16px;
  margin: 0;
}
dl > div {
  display: grid;
  grid-template-columns: 80px minmax(0, 1fr);
  gap: 16px;
}
dt {
  color: var(--muted);
}
dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.history-back {
  margin-top: 24px;
  min-height: 44px;
}
@media (max-width: 800px) {
  .result-layout {
    grid-template-columns: minmax(0, 1fr);
    gap: 20px;
  }
  .result-board {
    width: 100%;
    max-width: 560px;
    justify-self: center;
  }
  h1 {
    font-size: 25px;
  }
}
</style>
