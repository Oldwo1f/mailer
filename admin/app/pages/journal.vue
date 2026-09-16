<script setup lang="ts">
import Button from 'primevue/button'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tag from 'primevue/tag'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Dialog from 'primevue/dialog'
import Toolbar from 'primevue/toolbar'
import type { Campaign, SendDetail, SendJournalPage, SendRow } from '~/types/mailer'

const { api } = useApi()
const toast = useToast()

const loading = ref(false)
const rows = ref<SendRow[]>([])
const total = ref(0)
const filter = ref('')
const status = ref<string>('all')
const campaignId = ref<string | null>(null)
const campaigns = ref<Campaign[]>([])
const page = ref(0)
const rowsPerPage = 25

const detailVisible = ref(false)
const detailLoading = ref(false)
const detail = ref<SendDetail | null>(null)

const statusOptions = [
  { label: 'Tous les statuts', value: 'all' },
  { label: 'Envoyés', value: 'sent' },
  { label: 'En file', value: 'queued' },
  { label: 'En cours', value: 'sending' },
  { label: 'Échoués', value: 'failed' },
  { label: 'Ignorés', value: 'skipped' },
]

function statusSeverity(s: string) {
  const map: Record<string, string> = {
    sent: 'success',
    queued: 'info',
    sending: 'info',
    failed: 'danger',
    skipped: 'secondary',
  }
  return map[s] || 'secondary'
}

async function loadCampaigns() {
  campaigns.value = await api<Campaign[]>('campaigns')
}

async function load() {
  loading.value = true
  try {
    const query: Record<string, string> = {
      limit: String(rowsPerPage),
      offset: String(page.value * rowsPerPage),
      status: status.value,
    }
    if (campaignId.value) query.campaignId = campaignId.value
    if (filter.value.trim()) query.q = filter.value.trim()

    const res = await api<SendJournalPage>('sends', { query })
    rows.value = res.items
    total.value = res.total
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

async function openDetail(row: SendRow) {
  detailVisible.value = true
  detailLoading.value = true
  detail.value = null
  try {
    detail.value = await api<SendDetail>(`sends/${row.id}`)
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'Erreur',
      detail: e instanceof Error ? e.message : String(e),
      life: 4000,
    })
    detailVisible.value = false
  } finally {
    detailLoading.value = false
  }
}

function onPage(ev: { page: number }) {
  page.value = ev.page
  load()
}

let searchTimer: ReturnType<typeof setTimeout> | null = null
watch([status, campaignId], () => {
  page.value = 0
  load()
})
watch(filter, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    page.value = 0
    load()
  }, 300)
})

onMounted(async () => {
  await loadCampaigns()
  await load()
})
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1>Journal d’emails</h1>
        <p>{{ total }} envoi(s) · historique, ouvertures et clics</p>
      </div>
      <Button icon="pi pi-refresh" text @click="load" :loading="loading" />
    </div>

    <Toolbar class="card" style="padding: 0.75rem 1rem; border: 1px solid var(--mailer-border)">
      <template #start>
        <div class="row" style="flex-wrap: wrap">
          <InputText
            v-model="filter"
            placeholder="Rechercher email, entreprise, campagne…"
            style="min-width: 260px"
          />
          <Select
            v-model="status"
            :options="statusOptions"
            option-label="label"
            option-value="value"
            style="min-width: 160px"
          />
          <Select
            v-model="campaignId"
            :options="[{ id: null, name: 'Toutes les campagnes' }, ...campaigns]"
            option-label="name"
            option-value="id"
            style="min-width: 220px"
          />
        </div>
      </template>
    </Toolbar>

    <div class="card" style="padding: 0; overflow: hidden">
      <DataTable
        :value="rows"
        :loading="loading"
        :lazy="true"
        :paginator="true"
        :rows="rowsPerPage"
        :total-records="total"
        data-key="id"
        size="small"
        striped-rows
        @page="onPage"
      >
        <Column header="Date" style="width: 10rem">
          <template #body="{ data }">
            {{
              data.sentAt
                ? new Date(data.sentAt).toLocaleString('fr-FR')
                : data.createdAt
                  ? new Date(data.createdAt).toLocaleString('fr-FR')
                  : '—'
            }}
          </template>
        </Column>
        <Column header="Destinataire">
          <template #body="{ data }">
            <div class="stack" style="gap: 0.1rem">
              <span class="mono">{{ data.toEmail }}</span>
              <span class="muted" style="font-size: 0.8rem">{{ data.company || '—' }}</span>
            </div>
          </template>
        </Column>
        <Column header="Objet">
          <template #body="{ data }">
            <div class="stack" style="gap: 0.1rem">
              <span>{{ data.subject || '—' }}</span>
              <span v-if="data.stepName" class="muted" style="font-size: 0.8rem">
                {{ data.stepName }}
              </span>
            </div>
          </template>
        </Column>
        <Column header="Campagne">
          <template #body="{ data }">
            <NuxtLink
              v-if="data.campaignId"
              :to="`/campaigns/${data.campaignId}`"
              style="color: #0f766e; font-weight: 600"
            >
              {{ data.campaignName || 'Campagne' }}
            </NuxtLink>
            <span v-else>—</span>
          </template>
        </Column>
        <Column header="Statut" style="width: 7rem">
          <template #body="{ data }">
            <Tag :value="data.status" :severity="statusSeverity(data.status)" />
            <div v-if="data.error" class="muted" style="font-size: 0.75rem; margin-top: 0.15rem">
              {{ data.error }}
            </div>
          </template>
        </Column>
        <Column header="Ouv." style="width: 4rem">
          <template #body="{ data }">{{ data.openCount }}</template>
        </Column>
        <Column header="Clics" style="width: 4rem">
          <template #body="{ data }">{{ data.clickCount }}</template>
        </Column>
        <Column header="" style="width: 4rem">
          <template #body="{ data }">
            <Button icon="pi pi-eye" text rounded @click="openDetail(data)" />
          </template>
        </Column>
      </DataTable>
    </div>

    <Dialog
      v-model:visible="detailVisible"
      modal
      header="Détail de l’envoi"
      style="width: min(720px, 96vw)"
      :dismissable-mask="true"
    >
      <div v-if="detailLoading" class="muted">Chargement…</div>
      <div v-else-if="detail" class="stack">
        <div class="form-grid">
          <div>
            <label class="field-label">Destinataire</label>
            <div class="mono">{{ detail.toEmail }}</div>
            <div class="muted">{{ detail.company }}</div>
          </div>
          <div>
            <label class="field-label">Statut</label>
            <Tag :value="detail.status" :severity="statusSeverity(detail.status)" />
          </div>
          <div>
            <label class="field-label">Campagne</label>
            <NuxtLink
              v-if="detail.campaignId"
              :to="`/campaigns/${detail.campaignId}`"
              style="color: #0f766e"
            >
              {{ detail.campaignName }}
            </NuxtLink>
          </div>
          <div>
            <label class="field-label">Envoyé</label>
            <div>
              {{
                detail.sentAt
                  ? new Date(detail.sentAt).toLocaleString('fr-FR')
                  : '—'
              }}
            </div>
          </div>
        </div>
        <div>
          <label class="field-label">Objet</label>
          <div>{{ detail.subject || '—' }}</div>
        </div>
        <div v-if="detail.error">
          <label class="field-label">Erreur</label>
          <div style="color: #b91c1c">{{ detail.error }}</div>
        </div>
        <div>
          <label class="field-label">
            Tracking — {{ detail.openCount }} ouverture(s), {{ detail.clickCount }} clic(s)
          </label>
          <div v-if="detail.clicks?.length" class="stack" style="gap: 0.25rem">
            <div v-for="c in detail.clicks" :key="c.id" class="muted" style="font-size: 0.85rem">
              {{ new Date(c.clickedAt).toLocaleString('fr-FR') }}
              —
              <a :href="c.url" target="_blank" rel="noopener">{{ c.url }}</a>
            </div>
          </div>
        </div>
        <div v-if="detail.html">
          <label class="field-label">Aperçu</label>
          <div class="preview-html" v-html="detail.html" />
        </div>
      </div>
      <template #footer>
        <Button label="Fermer" @click="detailVisible = false" />
      </template>
    </Dialog>
  </div>
</template>
