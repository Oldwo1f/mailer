<script setup lang="ts">
import Button from 'primevue/button'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tag from 'primevue/tag'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Dialog from 'primevue/dialog'
import Checkbox from 'primevue/checkbox'
import Toolbar from 'primevue/toolbar'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import ProgressBar from 'primevue/progressbar'
import type { DiscoverJob, ImportResult, Prospect, ProspectListSummary } from '~/types/mailer'

const { api } = useApi()
const toast = useToast()
const confirm = useConfirm()

const prospects = ref<Prospect[]>([])
const lists = ref<ProspectListSummary[]>([])
const selected = ref<Prospect[]>([])
const loading = ref(false)
const enriching = ref(false)
const importing = ref(false)
const deduping = ref(false)
const installing = ref(false)
const filter = ref('')
const showStarredOnly = ref(false)
const selectedListId = ref<string | null>(null)
const dialogVisible = ref(false)
const importVisible = ref(false)
const discoverVisible = ref(false)
const discovering = ref(false)
const discoverJob = ref<DiscoverJob | null>(null)
const discoverToastFor = ref<string | null>(null)
const editing = ref<Prospect | null>(null)
const form = reactive({
  company: '',
  emails: '',
  contactName: '',
  starred: false,
  notes: '',
})

const importForm = reactive({
  listId: null as string | null,
  newListName: '',
  createNew: false,
  previewCount: 0,
  rawJson: null as unknown,
})

const discoverForm = reactive({
  keywords: '',
  location: 'Polynésie française',
  listId: null as string | null,
  createNew: false,
  newListName: '',
  batchSize: 10 as 10 | 50 | 100,
})

const batchOptions = [
  { label: '10', value: 10 },
  { label: '50', value: 50 },
  { label: '100', value: 100 },
]

let discoverPoll: ReturnType<typeof setInterval> | null = null

const discoverProgress = computed(() => {
  const job = discoverJob.value
  if (!job?.batchSize) return 0
  if (job.status === 'done') return 100
  return Math.min(100, Math.round((job.found / job.batchSize) * 100))
})

const discoverActive = computed(() => {
  const s = discoverJob.value?.status
  return s === 'queued' || s === 'running'
})

const filtered = computed(() => {
  let list = prospects.value
  if (showStarredOnly.value) list = list.filter((p) => p.starred)
  const q = filter.value.trim().toLowerCase()
  if (!q) return list
  return list.filter(
    (p) =>
      p.company.toLowerCase().includes(q) ||
      (p.contactName || '').toLowerCase().includes(q) ||
      p.emails.some((e) => e.toLowerCase().includes(q)) ||
      (p.profile?.commune || '').toLowerCase().includes(q) ||
      (p.profile?.type || '').toLowerCase().includes(q),
  )
})

const listOptions = computed(() => [
  { label: 'Toutes les listes', value: null as string | null },
  ...lists.value.map((l) => ({
    label: `${l.name} (${l.prospectCount})`,
    value: l.id as string | null,
  })),
])

async function loadLists() {
  lists.value = await api<ProspectListSummary[]>('lists')
}

async function load() {
  loading.value = true
  try {
    const query: Record<string, string> = {}
    if (selectedListId.value) query.listId = selectedListId.value
    prospects.value = await api<Prospect[]>('prospects', { query })
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'Erreur',
      detail: e instanceof Error ? e.message : String(e),
      life: 4000,
    })
  } finally {
    loading.value = false
  }
}

async function refresh() {
  await loadLists()
  await load()
}

function openCreate() {
  editing.value = null
  form.company = ''
  form.emails = ''
  form.contactName = ''
  form.starred = false
  form.notes = ''
  dialogVisible.value = true
}

function openEdit(p: Prospect) {
  editing.value = p
  form.company = p.company
  form.emails = p.emails.join('; ')
  form.contactName = p.contactName || ''
  form.starred = p.starred
  form.notes = p.notes || ''
  dialogVisible.value = true
}

async function save() {
  const emails = form.emails
    .split(/[;,]/)
    .map((e) => e.trim())
    .filter(Boolean)
  if (!form.company.trim() || !emails.length) {
    toast.add({
      severity: 'warn',
      summary: 'Champs requis',
      detail: 'Entreprise et au moins un email',
      life: 3000,
    })
    return
  }
  try {
    const body = {
      company: form.company.trim(),
      emails,
      starred: form.starred,
      notes: form.notes || null,
      contactName: form.contactName.trim() || null,
    }
    if (editing.value) {
      await api(`prospects/${editing.value.id}`, { method: 'PATCH', body })
    } else {
      await api('prospects', { method: 'POST', body })
    }
    dialogVisible.value = false
    await refresh()
    toast.add({ severity: 'success', summary: 'Enregistré', life: 2500 })
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'Erreur',
      detail: e instanceof Error ? e.message : String(e),
      life: 4000,
    })
  }
}

function remove(p: Prospect) {
  confirm.require({
    message: `Supprimer ${p.company} ?`,
    header: 'Confirmation',
    icon: 'pi pi-exclamation-triangle',
    accept: async () => {
      await api(`prospects/${p.id}`, { method: 'DELETE' })
      await refresh()
    },
  })
}

async function enrichOne(p: Prospect) {
  enriching.value = true
  try {
    await api(`prospects/${p.id}/enrich`, { method: 'POST' })
    await load()
    toast.add({
      severity: 'success',
      summary: 'Enrichi',
      detail: p.company,
      life: 2500,
    })
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'Enrichissement',
      detail: e instanceof Error ? e.message : String(e),
      life: 5000,
    })
  } finally {
    enriching.value = false
  }
}

async function enrichSelected() {
  if (!selected.value.length) return
  enriching.value = true
  try {
    const results = await api<Array<{ id: string; ok: boolean; error?: string }>>(
      'prospects/enrich',
      {
        method: 'POST',
        body: { ids: selected.value.map((p) => p.id) },
      },
    )
    await load()
    const ok = results.filter((r) => r.ok).length
    toast.add({
      severity: 'success',
      summary: 'Enrichissement',
      detail: `${ok}/${results.length} OK`,
      life: 4000,
    })
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'Erreur',
      detail: e instanceof Error ? e.message : String(e),
      life: 5000,
    })
  } finally {
    enriching.value = false
  }
}

async function enrichList() {
  if (!selectedListId.value) {
    toast.add({
      severity: 'warn',
      summary: 'Liste requise',
      detail: 'Sélectionnez une liste à enrichir',
      life: 3000,
    })
    return
  }
  enriching.value = true
  try {
    const results = await api<Array<{ id: string; ok: boolean }>>(
      `lists/${selectedListId.value}/enrich`,
      { method: 'POST' },
    )
    await load()
    const ok = results.filter((r) => r.ok).length
    toast.add({
      severity: 'success',
      summary: 'Liste enrichie',
      detail: `${ok}/${results.length} OK`,
      life: 4000,
    })
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'Erreur',
      detail: e instanceof Error ? e.message : String(e),
      life: 5000,
    })
  } finally {
    enriching.value = false
  }
}

async function toggleStar(p: Prospect) {
  await api(`prospects/${p.id}`, {
    method: 'PATCH',
    body: { starred: !p.starred },
  })
  await load()
}

const IMPORT_ENVELOPE_KEYS = ['records', 'data', 'prospects', 'prospect'] as const

function extractImportRecords(payload: unknown): unknown[] | null {
  if (Array.isArray(payload)) return payload
  if (!payload || typeof payload !== 'object') return null
  const obj = payload as Record<string, unknown>
  for (const key of IMPORT_ENVELOPE_KEYS) {
    const value = obj[key]
    if (Array.isArray(value)) return value
  }
  return null
}

function openImport() {
  importForm.listId = selectedListId.value
  importForm.createNew = !selectedListId.value
  importForm.newListName = ''
  importForm.previewCount = 0
  importForm.rawJson = null
  importVisible.value = true
}

function onFileSelected(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result))
      const records = extractImportRecords(parsed)
      if (!records) {
        throw new Error(
          'JSON attendu : tableau [...] ou objet { prospects: [...] } (clés : records, data, prospects, prospect)',
        )
      }
      importForm.rawJson = parsed
      importForm.previewCount = records.length
      if (!importForm.newListName && file.name) {
        importForm.newListName = file.name.replace(/\.json$/i, '')
      }
    } catch (e) {
      toast.add({
        severity: 'error',
        summary: 'Fichier invalide',
        detail: e instanceof Error ? e.message : String(e),
        life: 4000,
      })
      importForm.rawJson = null
      importForm.previewCount = 0
    }
  }
  reader.readAsText(file)
}

async function runImport() {
  if (!importForm.rawJson) {
    toast.add({
      severity: 'warn',
      summary: 'Fichier requis',
      detail: 'Choisissez un fichier JSON',
      life: 3000,
    })
    return
  }
  importing.value = true
  try {
    let listId = importForm.listId
    if (importForm.createNew || !listId) {
      if (!importForm.newListName.trim()) {
        toast.add({
          severity: 'warn',
          summary: 'Nom de liste requis',
          life: 3000,
        })
        return
      }
      const created = await api<{ id: string }>('lists', {
        method: 'POST',
        body: { name: importForm.newListName.trim() },
      })
      listId = created.id
    }
    const result = await api<ImportResult>(`lists/${listId}/import`, {
      method: 'POST',
      body: importForm.rawJson,
    })
    importVisible.value = false
    selectedListId.value = listId
    await refresh()
    toast.add({
      severity: 'success',
      summary: 'Import terminé',
      detail: `${result.imported} créés · ${result.merged} fusionnés · ${result.skipped} sans email · ${result.invalid} invalides`,
      life: 6000,
    })
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'Import',
      detail: e instanceof Error ? e.message : String(e),
      life: 5000,
    })
  } finally {
    importing.value = false
  }
}

function runDedupe() {
  const scope = selectedListId.value ? 'cette liste' : 'tous les prospects'
  confirm.require({
    message: `Dédoublonner ${scope} ? Les fiches fusionnées (même email ou même entreprise) seront consolidées.`,
    header: 'Dédoublonnage',
    icon: 'pi pi-filter',
    accept: async () => {
      deduping.value = true
      try {
        const path = selectedListId.value
          ? `lists/${selectedListId.value}/dedupe`
          : 'lists/dedupe'
        const result = await api<{ merged: number; removed: number }>(path, {
          method: 'POST',
        })
        await refresh()
        toast.add({
          severity: 'success',
          summary: 'Dédoublonnage',
          detail: `${result.merged} fusion(s) · ${result.removed} fiche(s) retirée(s)`,
          life: 4000,
        })
      } catch (e) {
        toast.add({
          severity: 'error',
          summary: 'Erreur',
          detail: e instanceof Error ? e.message : String(e),
          life: 5000,
        })
      } finally {
        deduping.value = false
      }
    },
  })
}

async function installDefaults() {
  installing.value = true
  try {
    const result = await api<{ lists: number; imported: number; merged: number }>(
      'lists/install-defaults',
      { method: 'POST' },
    )
    await refresh()
    toast.add({
      severity: 'success',
      summary: 'Listes PF',
      detail: `${result.lists} liste(s) créée(s) · ${result.imported} importés · ${result.merged} fusionnés`,
      life: 5000,
    })
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'Erreur',
      detail: e instanceof Error ? e.message : String(e),
      life: 5000,
    })
  } finally {
    installing.value = false
  }
}

watch(selectedListId, () => {
  selected.value = []
  load()
})

function stopDiscoverPoll() {
  if (discoverPoll) {
    clearInterval(discoverPoll)
    discoverPoll = null
  }
}

async function syncDiscoverJob(id: string) {
  const job = await api<DiscoverJob>(`discover/${id}`)
  discoverJob.value = job
  if (job.status === 'done' || job.status === 'error' || job.status === 'cancelled') {
    stopDiscoverPoll()
    discovering.value = false
    selectedListId.value = job.listId
    await refresh()
    if (discoverToastFor.value === job.id) return
    discoverToastFor.value = job.id
    if (job.status === 'done') {
      toast.add({
        severity: 'success',
        summary: 'Découverte terminée',
        detail: job.message || `${job.found} prospect(s)`,
        life: 6000,
      })
    } else if (job.status === 'error') {
      toast.add({
        severity: 'error',
        summary: 'Découverte',
        detail: job.message || 'Erreur',
        life: 6000,
      })
    }
  }
}

function startDiscoverPoll(id: string) {
  stopDiscoverPoll()
  void syncDiscoverJob(id).catch(() => {})
  discoverPoll = setInterval(() => {
    syncDiscoverJob(id).catch(() => {})
  }, 2000)
}

async function resumeActiveDiscover() {
  try {
    const [running, queued] = await Promise.all([
      api<DiscoverJob[]>('discover', { query: { status: 'running' } }),
      api<DiscoverJob[]>('discover', { query: { status: 'queued' } }),
    ])
    const active = running[0] || queued[0]
    if (!active) return
    discoverJob.value = active
    discovering.value = true
    discoverVisible.value = true
    startDiscoverPoll(active.id)
  } catch {
    /* ignore */
  }
}

function openDiscover() {
  discoverForm.listId = selectedListId.value
  discoverForm.createNew = !selectedListId.value
  discoverForm.newListName = ''
  if (!discoverActive.value) {
    discoverForm.keywords = ''
    discoverForm.location = 'Polynésie française'
    discoverForm.batchSize = 10
    if (!discoverJob.value || discoverJob.value.status !== 'done') {
      discoverJob.value = null
    }
  }
  discoverVisible.value = true
}

function resetDiscoverForm() {
  discoverJob.value = null
  discovering.value = false
  discoverToastFor.value = null
  discoverForm.keywords = ''
  discoverForm.newListName = ''
}

async function startDiscover() {
  if (!discoverForm.keywords.trim()) {
    toast.add({
      severity: 'warn',
      summary: 'Mots-clés requis',
      detail: 'Ex. spa, salon de coiffure Punaauia',
      life: 3000,
    })
    return
  }
  if (discoverForm.createNew && !discoverForm.newListName.trim()) {
    toast.add({
      severity: 'warn',
      summary: 'Nom de liste requis',
      life: 3000,
    })
    return
  }
  if (!discoverForm.createNew && !discoverForm.listId) {
    toast.add({
      severity: 'warn',
      summary: 'Liste requise',
      detail: 'Choisissez une liste ou créez-en une',
      life: 3000,
    })
    return
  }
  discovering.value = true
  try {
    const body: Record<string, unknown> = {
      keywords: discoverForm.keywords.trim(),
      location: discoverForm.location.trim() || 'Polynésie française',
      batchSize: discoverForm.batchSize,
    }
    if (discoverForm.createNew) {
      body.newListName = discoverForm.newListName.trim()
    } else {
      body.listId = discoverForm.listId
    }
    const job = await api<DiscoverJob>('discover', { method: 'POST', body })
    discoverJob.value = job
    startDiscoverPoll(job.id)
  } catch (e) {
    discovering.value = false
    toast.add({
      severity: 'error',
      summary: 'Découverte',
      detail: e instanceof Error ? e.message : String(e),
      life: 5000,
    })
  }
}

async function cancelDiscover() {
  if (!discoverJob.value) return
  try {
    const job = await api<DiscoverJob>(`discover/${discoverJob.value.id}/cancel`, {
      method: 'POST',
    })
    discoverJob.value = job
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'Annulation',
      detail: e instanceof Error ? e.message : String(e),
      life: 4000,
    })
  }
}

onMounted(async () => {
  await refresh()
  await resumeActiveDiscover()
})

onUnmounted(stopDiscoverPoll)
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1>Prospects</h1>
        <p>
          {{ prospects.length }} entreprises
          <span v-if="selectedListId">dans la liste filtrée</span>
          · import JSON, recherche web, dédoublonnage, enrichissement IA
        </p>
      </div>
      <div class="row">
        <Button
          label="Listes PF"
          icon="pi pi-download"
          severity="secondary"
          outlined
          :loading="installing"
          v-tooltip.top="'Charger Nightlife, Beauté, Restaurants, Artisans, Hébergements'"
          @click="installDefaults"
        />
        <Button
          label="Recherche de prospect"
          icon="pi pi-search"
          severity="secondary"
          :loading="discovering"
          v-tooltip.top="'Trouver de nouveaux prospects avec email via la recherche web'"
          @click="openDiscover"
        />
        <Button label="Importer" icon="pi pi-upload" severity="secondary" @click="openImport" />
        <Button label="Ajouter" icon="pi pi-plus" @click="openCreate" />
      </div>
    </div>

    <Toolbar class="card" style="padding: 0.75rem 1rem; border: 1px solid var(--mailer-border)">
      <template #start>
        <div class="row" style="flex-wrap: wrap">
          <Select
            v-model="selectedListId"
            :options="listOptions"
            option-label="label"
            option-value="value"
            placeholder="Liste"
            style="min-width: 220px"
          />
          <InputText v-model="filter" placeholder="Rechercher…" style="min-width: 200px" />
          <div class="row">
            <Checkbox v-model="showStarredOnly" binary input-id="starred" />
            <label for="starred">Étoilés</label>
          </div>
        </div>
      </template>
      <template #end>
        <div class="row" style="flex-wrap: wrap">
          <Button
            label="Dédoublonner"
            icon="pi pi-filter"
            severity="secondary"
            outlined
            :loading="deduping"
            @click="runDedupe"
          />
          <Button
            label="Enrichir la liste"
            icon="pi pi-sparkles"
            severity="secondary"
            :disabled="!selectedListId"
            :loading="enriching"
            @click="enrichList"
          />
          <Button
            label="Enrichir la sélection"
            icon="pi pi-sparkles"
            :disabled="!selected.length"
            :loading="enriching"
            @click="enrichSelected"
          />
          <Button icon="pi pi-refresh" text @click="refresh" />
        </div>
      </template>
    </Toolbar>

    <div class="card" style="padding: 0; overflow: hidden">
      <DataTable
        v-model:selection="selected"
        :value="filtered"
        :loading="loading"
        data-key="id"
        paginator
        :rows="15"
        striped-rows
        selection-mode="multiple"
        size="small"
      >
        <Column selection-mode="multiple" header-style="width: 3rem" />
        <Column header="" style="width: 3rem">
          <template #body="{ data }">
            <Button
              :icon="data.starred ? 'pi pi-star-fill' : 'pi pi-star'"
              text
              rounded
              size="small"
              :severity="data.starred ? 'warn' : 'secondary'"
              @click="toggleStar(data)"
            />
          </template>
        </Column>
        <Column field="company" header="Entreprise" sortable />
        <Column header="Contact">
          <template #body="{ data }">
            {{ data.contactName || '—' }}
          </template>
        </Column>
        <Column header="Emails">
          <template #body="{ data }">
            <div class="stack" style="gap: 0.15rem">
              <span v-for="e in data.emails" :key="e" class="mono">{{ e }}</span>
            </div>
          </template>
        </Column>
        <Column header="Type / Commune">
          <template #body="{ data }">
            <div class="stack" style="gap: 0.1rem">
              <span v-if="data.profile?.type">{{ data.profile.type }}</span>
              <span v-if="data.profile?.commune" class="muted">{{ data.profile.commune }}</span>
              <span v-if="!data.profile?.type && !data.profile?.commune">—</span>
            </div>
          </template>
        </Column>
        <Column header="Listes">
          <template #body="{ data }">
            <div class="row" style="flex-wrap: wrap; gap: 0.25rem">
              <Tag
                v-for="l in data.lists || []"
                :key="l.id"
                :value="l.name"
                severity="info"
              />
              <span v-if="!(data.lists || []).length" class="muted">—</span>
            </div>
          </template>
        </Column>
        <Column header="Enrichissement">
          <template #body="{ data }">
            <div v-if="data.enrichment" class="enrichment-box">
              <div v-if="data.enrichment.activity"><strong>Activité:</strong> {{ data.enrichment.activity }}</div>
              <div v-if="data.enrichment.location"><strong>Zone:</strong> {{ data.enrichment.location }}</div>
              <div v-if="data.enrichment.hook"><strong>Hook:</strong> {{ data.enrichment.hook }}</div>
              <a
                v-if="data.enrichment.website"
                :href="data.enrichment.website"
                target="_blank"
                rel="noopener"
                style="color: #0f766e"
              >{{ data.enrichment.website }}</a>
            </div>
            <span v-else class="muted">—</span>
          </template>
        </Column>
        <Column header="Statut" style="width: 8rem">
          <template #body="{ data }">
            <Tag
              v-if="data.unsubscribedAt"
              value="Désinscrit"
              severity="danger"
            />
            <Tag v-else value="Actif" severity="success" />
          </template>
        </Column>
        <Column header="" style="width: 10rem">
          <template #body="{ data }">
            <div class="row">
              <Button
                icon="pi pi-sparkles"
                text
                rounded
                :loading="enriching"
                v-tooltip.top="'Enrichir'"
                @click="enrichOne(data)"
              />
              <Button icon="pi pi-pencil" text rounded @click="openEdit(data)" />
              <Button
                icon="pi pi-trash"
                text
                rounded
                severity="danger"
                @click="remove(data)"
              />
            </div>
          </template>
        </Column>
      </DataTable>
    </div>

    <Dialog
      v-model:visible="dialogVisible"
      :header="editing ? 'Modifier le prospect' : 'Nouveau prospect'"
      modal
      style="width: min(520px, 95vw)"
    >
      <div class="stack">
        <div>
          <label class="field-label">Entreprise</label>
          <InputText v-model="form.company" class="w-full" style="width: 100%" />
        </div>
        <div>
          <label class="field-label">Nom du contact (optionnel)</label>
          <InputText v-model="form.contactName" style="width: 100%" />
        </div>
        <div>
          <label class="field-label">Emails (séparés par ;)</label>
          <Textarea v-model="form.emails" rows="3" style="width: 100%" />
        </div>
        <div>
          <label class="field-label">Notes / besoins</label>
          <Textarea v-model="form.notes" rows="2" style="width: 100%" />
        </div>
        <div class="row">
          <Checkbox v-model="form.starred" binary input-id="form-starred" />
          <label for="form-starred">Étoilé</label>
        </div>
      </div>
      <template #footer>
        <Button label="Annuler" text @click="dialogVisible = false" />
        <Button label="Enregistrer" @click="save" />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="importVisible"
      header="Importer une liste JSON"
      modal
      style="width: min(560px, 95vw)"
    >
      <div class="stack">
        <p class="muted" style="margin: 0">
          Tableau JSON, ou objet avec <code>prospects</code> / <code>prospect</code>
          / <code>records</code> / <code>data</code>.
          Contrat minimum : <code>nom</code> / <code>company</code> + email(s).
        </p>
        <div>
          <label class="field-label">Fichier JSON</label>
          <input type="file" accept=".json,application/json" @change="onFileSelected" />
          <div v-if="importForm.previewCount" class="muted" style="margin-top: 0.35rem">
            {{ importForm.previewCount }} enregistrement(s) détecté(s)
          </div>
        </div>
        <div class="row">
          <Checkbox v-model="importForm.createNew" binary input-id="create-list" />
          <label for="create-list">Créer une nouvelle liste</label>
        </div>
        <div v-if="importForm.createNew">
          <label class="field-label">Nom de la liste</label>
          <InputText v-model="importForm.newListName" style="width: 100%" />
        </div>
        <div v-else>
          <label class="field-label">Liste cible</label>
          <Select
            v-model="importForm.listId"
            :options="lists"
            option-label="name"
            option-value="id"
            placeholder="Choisir…"
            style="width: 100%"
          />
        </div>
      </div>
      <template #footer>
        <Button label="Annuler" text @click="importVisible = false" />
        <Button label="Importer" icon="pi pi-upload" :loading="importing" @click="runImport" />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="discoverVisible"
      header="Recherche de prospect"
      modal
      style="width: min(640px, 95vw)"
    >
      <div class="stack">
        <p class="muted" style="margin: 0">
          Recherche web, scrape des pages contact / mentions légales, puis
          recherche dédiée d’emails (jamais inventés). Les doublons (même email
          ou même entreprise) sont fusionnés dans la liste cible.
        </p>

        <div>
          <label class="field-label">Mots-clés</label>
          <Textarea
            v-model="discoverForm.keywords"
            rows="2"
            style="width: 100%"
            :disabled="discoverActive"
            placeholder="Ex. spa, salon de coiffure, institut de beauté"
          />
          <div class="muted" style="margin-top: 0.35rem">
            Une virgule sépare plusieurs thématiques.
          </div>
        </div>

        <div>
          <label class="field-label">Zone</label>
          <InputText
            v-model="discoverForm.location"
            style="width: 100%"
            :disabled="discoverActive"
            placeholder="Polynésie française"
          />
        </div>

        <div>
          <label class="field-label">Prospects à trouver (avec email)</label>
          <SelectButton
            v-model="discoverForm.batchSize"
            :options="batchOptions"
            option-label="label"
            option-value="value"
            :allow-empty="false"
            :disabled="discoverActive"
          />
          <div class="muted" style="margin-top: 0.35rem">
            Durée indicative : 10 ≈ quelques minutes · 50 ≈ 10–20 min · 100 ≈ 20–40 min
            (quotas recherche / scrape).
          </div>
        </div>

        <div class="row">
          <Checkbox
            v-model="discoverForm.createNew"
            binary
            input-id="discover-create-list"
            :disabled="discoverActive"
          />
          <label for="discover-create-list">Créer une nouvelle liste</label>
        </div>
        <div v-if="discoverForm.createNew">
          <label class="field-label">Nom de la liste</label>
          <InputText
            v-model="discoverForm.newListName"
            style="width: 100%"
            :disabled="discoverActive"
            placeholder="Ex. Spas Punaauia"
          />
        </div>
        <div v-else>
          <label class="field-label">Liste à compléter</label>
          <Select
            v-model="discoverForm.listId"
            :options="lists"
            option-label="name"
            option-value="id"
            placeholder="Choisir…"
            style="width: 100%"
            :disabled="discoverActive"
          />
        </div>

        <div v-if="discoverJob" class="stack" style="gap: 0.5rem">
          <div class="row" style="justify-content: space-between">
            <Tag
              :value="discoverJob.status"
              :severity="
                discoverJob.status === 'done'
                  ? 'success'
                  : discoverJob.status === 'error'
                    ? 'danger'
                    : discoverJob.status === 'cancelled'
                      ? 'warn'
                      : 'info'
              "
            />
            <span class="muted">
              {{ discoverJob.found }}/{{ discoverJob.batchSize }} nouveaux
              · {{ discoverJob.merged }} déjà connus
              · {{ discoverJob.skipped }} sans email
            </span>
          </div>
          <ProgressBar :value="discoverProgress" />
          <div class="muted">
            {{ discoverJob.message }}
            <span v-if="discoverJob.searches">
              · {{ discoverJob.searches }} recherche(s)
              · {{ discoverJob.scrapes }} scrape(s)
            </span>
          </div>
          <div
            v-if="discoverJob.log?.length"
            class="mono"
            style="
              max-height: 160px;
              overflow: auto;
              background: #f8fafc;
              border: 1px solid var(--mailer-border);
              border-radius: 8px;
              padding: 0.6rem 0.75rem;
              font-size: 0.78rem;
              line-height: 1.45;
            "
          >
            <div v-for="(line, i) in discoverJob.log.slice(-12)" :key="i">
              {{ line.text }}
            </div>
          </div>
          <div
            v-if="discoverJob.results?.prospects?.length"
            class="stack"
            style="gap: 0.25rem"
          >
            <div class="field-label">Ajoutés</div>
            <div
              v-for="p in discoverJob.results.prospects.slice(-8)"
              :key="p.id"
              class="row"
              style="justify-content: space-between; gap: 0.5rem"
            >
              <span>{{ p.company }}</span>
              <span class="mono muted">{{ p.emails[0] }}</span>
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <Button
          v-if="discoverActive"
          label="Annuler la recherche"
          severity="danger"
          text
          @click="cancelDiscover"
        />
        <Button
          v-else-if="discoverJob?.status === 'done' || discoverJob?.status === 'error' || discoverJob?.status === 'cancelled'"
          label="Nouvelle recherche"
          text
          @click="resetDiscoverForm"
        />
        <Button label="Fermer" text @click="discoverVisible = false" />
        <Button
          v-if="!discoverJob"
          label="Lancer"
          icon="pi pi-search"
          :loading="discovering"
          @click="startDiscover"
        />
      </template>
    </Dialog>
  </div>
</template>
