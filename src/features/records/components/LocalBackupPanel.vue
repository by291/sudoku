<script setup lang="ts">
import { ref, useTemplateRef, onScopeDispose } from 'vue'
import { NAlert, NButton, NCard } from 'naive-ui'
import { useRecordsStore } from '@/features/records/stores/useRecordsStore'
import { getVariantPresentation } from '@/features/game/model/variants'
import { BACKUP_LIMITS } from '@/storage/backup'
import ConfirmationDialog from '@/shared/components/ConfirmationDialog.vue'
import ResponsiveDialog from '@/shared/components/ResponsiveDialog.vue'
import { useDelayedProgress } from '@/shared/composables/useDelayedProgress'

const records = useRecordsStore()
const backupButton = useTemplateRef<InstanceType<typeof NButton>>('backupButton')
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
const reading = ref(false)
const confirming = ref(false)
const open = ref(false)
const showReading = useDelayedProgress(reading)
const showBusy = useDelayedProgress(() => records.busy)
let fileGeneration = 0
onScopeDispose(() => fileGeneration++)

function openBackupDialog() {
  const trigger: unknown = backupButton.value?.$el
  if (trigger instanceof HTMLElement) {
    // The retry link disappears on opening; capture the persistent trigger for focus restoration.
    trigger.focus()
  }
  open.value = true
  void records.inspectBackup()
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
  records.cancelRestore()
  records.backupError = null
  if (file.size > BACKUP_LIMITS.bytes) {
    records.backupError = '备份文件超过 25 MiB，本机数据没有改变。'
    return
  }
  reading.value = true
  try {
    const text = await file.text()
    if (current === fileGeneration) {
      await records.previewRestore(text)
    }
  } catch {
    if (current === fileGeneration) {
      records.backupError = '备份文件读取失败，请重新选择文件。'
    }
  } finally {
    if (current === fileGeneration) {
      reading.value = false
    }
  }
}

function requestRestore(event: MouseEvent) {
  if (event.currentTarget instanceof HTMLElement) {
    event.currentTarget.focus()
  }
  confirming.value = true
}

async function confirmRestore() {
  confirming.value = false
  await records.restoreBackup()
  if (!records.backupError && !records.backupPreview) {
    open.value = false
  }
}
</script>

<template>
  <section class="panel backup-panel" aria-labelledby="backup-heading">
    <h2 id="backup-heading">本地备份与恢复</h2>
    <p class="muted">把存档、成绩、课程进度和设置保存为文件，留作浏览器数据丢失后的恢复副本。</p>
    <NButton ref="backupButton" @click="openBackupDialog">备份与恢复</NButton>
    <NAlert
      v-if="!open && records.backupError"
      class="backup-feedback"
      type="error"
      :show-icon="false"
    >
      <p>{{ records.backupError }}</p>
      <NButton @click="openBackupDialog">查看并重试</NButton>
    </NAlert>
  </section>
  <ResponsiveDialog v-model:show="open" title="本地备份与恢复">
    <p class="muted">导出文件留存副本，或选择备份文件预览后恢复。</p>
    <div class="backup-actions">
      <NButton :disabled="records.busy || reading" @click="downloadBackup">导出备份</NButton>
      <NButton :disabled="records.busy || reading" @click="fileInput?.click()"
        >选择备份文件</NButton
      >
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
    <NAlert v-if="records.backupError" class="backup-feedback" type="error" :show-icon="false">
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
      <p>
        备份格式：1 · 导出时间：{{
          new Date(records.backupPreview.exportedAt).toLocaleString('zh-CN')
        }}
      </p>
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
        恢复会替换本机全部存档、成绩、课程进度和设置。先导出当前数据，可以保留另一份副本。
      </p>
      <div class="backup-actions">
        <NButton :disabled="records.busy" @click="records.cancelRestore">取消预览</NButton>
        <NButton type="primary" :disabled="records.busy" @click="requestRestore"
          >替换本机数据</NButton
        >
      </div>
    </NCard>
    <template #footer><NButton @click="open = false">关闭备份</NButton></template>
  </ResponsiveDialog>
  <ConfirmationDialog
    v-if="confirming"
    destructive
    title="恢复备份并替换本机数据？"
    description="将用预览中的备份替换全部本机数据，其他标签页会停止旧游戏。现有数据无法自动撤销，请确认已保留需要的副本。"
    confirm-label="确认恢复"
    @cancel="confirming = false"
    @confirm="confirmRestore"
  />
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
