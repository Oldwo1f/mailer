<script setup lang="ts">
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import type { Prospect } from '~/types/mailer'
import type { ProductRecommendation } from '~/types/product-matcher'

type LeadStatus =
  | 'new'
  | 'contacted'
  | 'replied'
  | 'interested'
  | 'demo'
  | 'meeting'
  | 'quote'
  | 'won'
  | 'lost'

type PipelineProspect = Prospect & {
  productRecommendation?: ProductRecommendation | null
  leadStatus: LeadStatus
  dealValueXpf: number | null
  replyDetectedAt: string | null
  lastReplyFrom: string | null
  lastReplySubject: string | null
  wonAt: string | null
  lostReason: string | null
}

type PipelineSummary = {
  total: number
  counts: Record<LeadStatus, number>
  repliedOrLater: number
  wonValueXpf: number
  activePipelineValueXpf: number
}

const { api } = useApi()
const toast = useToast()
const loading = ref(false)
const savingId = ref<string | null>(null)
const prospects = ref<PipelineProspect[]>([])
const summary = ref<PipelineSummary | null>(null)
const filter = ref('')
const statusFilter = ref<LeadStatus | null>(null)

const statusOptions: Array<{ label: string; value: LeadStatus }> = [
  { label: 'Nouveau', value: 'new' },
  { label: 'Contacté', value: 'contacted' },
  { label: 'Répondu', value: 'replied' },
  { label: 'Intéressé', value: 'interested' },
  { label: 'Démo', value: 'demo' },
  { label: 'Rendez-vous', value: 'meeting' },
  { label: 'Devis', value: 'quote' },
  { label: 'Gagné', value: 'won' },
  { label: 'Perdu', value: 'lost' },
]

const filtered = computed(() => {
  const q = filter.value.trim().toLowerCase()
  return prospects.value.filter((p) => {
    if (statusFilter.value && p.leadStatus !== statusFilter.value) return false
    if (!q) return true
    return (
      p.company.toLowerCase().includes(q) ||
      (p.contactName || '').toLowerCase().includes(q) ||
      p.emails.some((email) => email.toLowerCase().includes(q)) ||
      (p.productRecommendation?.productName || '').toLowerCase().includes(q)
    )
  })
})

async function load() {
  loading.value = true
  try {
    ;[prospects.value, summary.value] = await Promise.all([
      api<PipelineProspect[]>('commercial/pipeline'),
      api<PipelineSummary>('commercial/summary'),
    ])
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'Pipeline commercial',
      detail: e instanceof Error ? e.message : String(e),
      life: 5000,
    })
  } finally {
    loading.value = false
  }
}

async function patchProspect(
  prospect: PipelineProspect,
  patch: Partial<Pick<PipelineProspect, 'leadStatus' | 'dealValueXpf' | 'lostReason'>>,
) {
  savingId.value = prospect.id
  try {
    await api(`commercial/prospects/${prospect.id}`, {
      method: 'PATCH',
      body: patch,
    })
    await load()
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'Mise à jour',
      detail: e instanceof Error ? e.message : String(e),
      life: 4000,
    })
  } finally {
    savingId.value = null
  }
}

function statusSeverity(status: LeadStatus) {
  if (status === 'won') return 'success'
  if (status === 'lost') return 'danger'
  if (['replied', 'interested', 'demo', 'meeting', 'quote'].includes(status)) return 'info'
  if (status === 'contacted') return 'warn'
  return 'secondary'
}

function formatXpf(value: number | null | undefined) {
  return `${new Intl.NumberFormat('fr-FR').format(value || 0)} XPF`
}

onMounted(load)
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1>Pipeline commercial</h1>
        <p>Des premiers contacts jusqu’au chiffre d’affaires gagné.</p>
      </div>
      <Button icon="pi pi-refresh" label="Actualiser" text :loading="loading" @click="load" />
    </div>

    <div v-if="summary" class="pipeline-kpis">
      <div class="card kpi">
        <span class="muted">Prospects</span>
        <strong>{{ summary.total }}</strong>
      </div>
      <div class="card kpi">
        <span class="muted">Réponses détectées</span>
        <strong>{{ summary.repliedOrLater }}</strong>
      </div>
      <div class="card kpi">
        <span class="muted">Pipeline actif</span>
        <strong>{{ formatXpf(summary.activePipelineValueXpf) }}</strong>
      </div>
      <div class="card kpi">
        <span class="muted">CA gagné</span>
        <strong>{{ formatXpf(summary.wonValueXpf) }}</strong>
      </div>
    </div>

    <div class="card row" style="flex-wrap: wrap">
      <InputText v-model="filter" placeholder="Entreprise, email, produit…" style="min-width: 260px" />
      <Select
        v-model="statusFilter"
        :options="[{ label: 'Tous les statuts', value: null }, ...statusOptions]"
        option-label="label"
        option-value="value"
        placeholder="Statut"
        style="min-width: 190px"
      />
    </div>

    <div class="card" style="padding: 0; overflow: hidden">
      <DataTable :value="filtered" :loading="loading" data-key="id" paginator :rows="15" striped-rows size="small">
        <Column field="company" header="Entreprise" sortable>
          <template #body="{ data }">
            <div class="stack" style="gap: 0.15rem">
              <strong>{{ data.company }}</strong>
              <span class="muted">{{ data.contactName || data.emails?.[0] || '—' }}</span>
            </div>
          </template>
        </Column>
        <Column header="Produit">
          <template #body="{ data }">
            {{ data.productRecommendation?.productName || '—' }}
          </template>
        </Column>
        <Column header="Statut" style="min-width: 180px">
          <template #body="{ data }">
            <div class="stack" style="gap: 0.35rem">
              <Tag :value="statusOptions.find((s) => s.value === data.leadStatus)?.label || data.leadStatus" :severity="statusSeverity(data.leadStatus)" />
              <Select
                :model-value="data.leadStatus"
                :options="statusOptions"
                option-label="label"
                option-value="value"
                size="small"
                :disabled="savingId === data.id"
                @update:model-value="(value) => patchProspect(data, { leadStatus: value })"
              />
            </div>
          </template>
        </Column>
        <Column header="Valeur" style="min-width: 160px">
          <template #body="{ data }">
            <InputNumber
              :model-value="data.dealValueXpf"
              locale="fr-FR"
              :min="0"
              :use-grouping="true"
              suffix=" XPF"
              :disabled="savingId === data.id"
              @blur="(event) => {
                const raw = String(event.target?.value || '').replace(/[^0-9]/g, '')
                patchProspect(data, { dealValueXpf: raw ? Number(raw) : null })
              }"
            />
          </template>
        </Column>
        <Column header="Réponse">
          <template #body="{ data }">
            <div v-if="data.replyDetectedAt" class="stack" style="gap: 0.1rem">
              <span>{{ new Date(data.replyDetectedAt).toLocaleString('fr-FR') }}</span>
              <span v-if="data.lastReplySubject" class="muted">{{ data.lastReplySubject }}</span>
            </div>
            <span v-else class="muted">—</span>
          </template>
        </Column>
      </DataTable>
    </div>

    <div class="card">
      <strong>Arrêt automatique des relances</strong>
      <p class="muted" style="margin-bottom: 0">
        Dès qu’une réponse est enregistrée par le webhook entrant, les emails encore en file pour ce prospect sont ignorés. Les statuts Intéressé, Démo, Rendez-vous, Devis, Gagné et Perdu bloquent aussi les relances automatiques.
      </p>
    </div>
  </div>
</template>

<style scoped>
.pipeline-kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1rem;
}
.kpi {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.kpi strong {
  font-size: 1.45rem;
}
@media (max-width: 900px) {
  .pipeline-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
