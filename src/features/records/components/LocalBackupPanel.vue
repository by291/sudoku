<script setup lang="ts">
import { ref, useTemplateRef, onScopeDispose } from 'vue'
import { NAlert, NButton, NCard } from 'naive-ui'
import { useRecordsStore } from '@/features/records/stores/useRecordsStore'
import { getVariantPresentation } from '@/features/game/model/variants'
import { BACKUP_LIMITS } from '@/storage/backup'
import { useDelayedProgress } from '@/shared/composables/useDelayedProgress'

const records = useRecordsStore()
const importButton = useTemplateRef<InstanceType<typeof NButton>>('importButton')
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
const reading = ref(false)
const showReading = useDelayedProgress(reading)
const showBusy = useDelayedProgress(() => records.backupBusy)
let fileGeneration = 0
onScopeDispose(() => fileGeneration++)

function focusImport() {
  const trigger: unknown = importButton.value?.$el
  if (trigger instanceof HTMLElement) {
    trigger.focus()
  }
}

async function downloadBackup() {
  const text = await records.exportBackup()
  if (text === null) {
    return
  }
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `sudoku-backup-${new Date().toISOString().replaceAll(':', '-')}.json`
  link.click()
  // The browser consumes the object URL asynchronously when starting the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  void records.inspectBackup()
}

async function readBackupFile(event: Event) {
  if (!(event.target instanceof HTMLInputElement)) {
    return
  }
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) {
    return
  }
  const current = ++fileGeneration
  records.beginBackupFileSelection()
  if (file.size > BACKUP_LIMITS.bytes) {
    records.reportBackupFileError('too-large')
    return
  }
  reading.value = true
  try {
    const text = await file.text()
    if (current === fileGeneration) {
      await records.previewRestore(text)
      void records.inspectBackup()
    }
  } catch {
    if (current === fileGeneration) {
      records.reportBackupFileError('unreadable')
    }
  } finally {
    if (current === fileGeneration) {
      reading.value = false
    }
  }
}

function cancelPreview() {
  records.cancelRestore()
  focusImport()
}

async function confirmRestore() {
  await records.restoreBackup()
  if (!records.backupError && !records.backupPreview) {
    focusImport()
  }
}
</script>

<template>
  <section class="panel backup-panel" aria-labelledby="backup-heading">
    <h2 id="backup-heading">本地备份与恢复</h2>
    <p class="muted">把存档、成绩、课程进度和设置保存为文件，留作浏览器数据丢失后的恢复副本。</p>
    <div class="backup-actions" :aria-busy="records.busy || reading">
      <NButton
        ref="importButton"
        :disabled="records.busy || reading"
        :aria-describedby="records.backupError ? 'backup-error' : undefined"
        @click="fileInput?.click()"
        >导入备份</NButton
      >
      <NButton :disabled="records.busy || reading" @click="downloadBackup">导出备份</NButton>
      <input
        ref="fileInput"
        class="file-input"
        type="file"
        :disabled="records.busy || reading"
        accept=".json,application/json"
        aria-label="选择备份文件"
        @change="readBackupFile"
      />
    </div>
    <p v-if="showReading" role="status">正在读取备份文件…</p>
    <p v-else-if="showBusy" role="status">正在处理备份…</p>
    <p v-if="records.notice" class="muted">{{ records.notice }}</p>
    <NAlert
      v-if="records.backupError"
      id="backup-error"
      class="backup-feedback"
      type="error"
      :show-icon="false"
    >
      {{ records.backupError }}
    </NAlert>
    <NCard
      v-if="records.backupPreview"
      class="backup-preview"
      size="small"
      role="region"
      aria-label="备份预览"
    >
      <h3>备份预览</h3>
      <p>备份创建于 {{ new Date(records.backupPreview.exportedAt).toLocaleString('zh-CN') }}</p>
      <p>
        存档 {{ records.backupPreview.sessions }} 个 · 成绩 {{ records.backupPreview.results }} 条 ·
        课程进度 {{ records.backupPreview.lessons }} 条 · 设置 1 组
      </p>
      <table>
        <thead>
          <tr>
            <th scope="col">玩法</th>
            <th scope="col">存档</th>
            <th scope="col">成绩</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in records.backupPreview.variants" :key="item.variant">
            <th scope="row">{{ getVariantPresentation(item.variant).label }}</th>
            <td>{{ item.sessions }}</td>
            <td>{{ item.results }}</td>
          </tr>
        </tbody>
      </table>
      <p class="muted">
        导入会替换本机全部存档、成绩、课程进度和设置，其他标签页会停止旧游戏。请先导出需要保留的数据。
      </p>
      <div class="backup-actions">
        <NButton :disabled="records.busy" @click="cancelPreview">取消预览</NButton>
        <NButton type="primary" :disabled="records.busy" @click="confirmRestore"
          >确认导入并替换</NButton
        >
      </div>
    </NCard>
  </section>
</template>

<style scoped>
.backup-panel {
  margin: 24px 0;
}
h2 {
  margin-top: 0;
  font-size: 20px;
}
h3 {
  margin-top: 0;
  font-size: 16px;
}
.backup-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.file-input {
  display: none;
}
.backup-feedback,
.backup-preview {
  margin-top: 20px;
}
.backup-preview {
  overflow-wrap: anywhere;
}
table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  margin-bottom: 16px;
}
th,
td {
  padding: 10px 6px;
  border-bottom: 1px solid var(--border);
}
@media (max-width: 600px) {
  .backup-panel {
    padding: 16px;
  }
}
</style>
