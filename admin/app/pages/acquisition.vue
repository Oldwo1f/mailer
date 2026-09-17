<script setup lang="ts">
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import InputNumber from 'primevue/inputnumber'
import Tag from 'primevue/tag'
import ToggleSwitch from 'primevue/toggleswitch'

type Strategy = 'accelerate' | 'explore' | 'steady' | 'pause'

type Mission = {
  key: string
  productId: string
  productName: string
  activity: string
  keywords: string
  marketName: string
  currency: string
  priority: number
  strategy: Strategy
  batchSize: 10
  autoEligible: boolean
  reason: string
  learningConfidence: 'collecting' | 'usable' | 'strong'
  contactedComparable: number
  radarAdjustment: number
}

type AcquisitionState = {
  generatedAt: string
  policy: {
    enabled: boolean
    minHoursBetweenRuns: number
    maxRuns24h: number
    batchSize: 10
    autoAcceptHighConfidence: boolean
  }
  searchProvider: string | null
  autoRunAllowed: boolean
  blockedReason: string | null
  runs24h: number
  nextRunAt: string | null
  activeJob: {
    id: string
    status: string
    keywords: string
    listName: string
    found: number
    batchSize: number
  } | null
  topMission: Mission | null
  missions: Mission[]
  learningBaseline: {
    contacted: number
    replied: number
    opportunities: number
    won: number
    wonValueXpf: number
    replyRate: number | null
    opportunityRate: number | null
  }
}

const { api } = useApi()
const toast = useToast()
const loading = ref(false)
const saving = ref(false)
const running = ref<string | null>(null)
const state = ref<AcquisitionState | null>(null)

const policy = reactive({
  enabled: true,
  minHoursBetweenRuns: 12,
  maxRuns24h: 2,
  autoAcceptHighConfidence: true,
})

async function load() {
  loading.value = true
  try {
    state.value = await api<AcquisitionState>('commercial/acquisition')
    if (state.value) Object.assign(policy, state.value.policy)
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'Aurel Acquisition',
      detail: e instanceof Error ? e.message : String(e),
      life: 5000,
    })
  } finally {
    loading.value = false
  }
}

async function savePolicy() {
  saving.value = true
  try {
    state.value = await api<AcquisitionState>('commercial/acquisition/policy', {
      method: 'PATCH',
      body: { ...policy },
    })
    toast.add({ severity: 'success', summary: 'Politique enregistrée', life: 2500 })
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'Aurel Acquisition',
      detail: e instanceof Error ? e.message : String(e),
      life: 4500,
    })
  } finally {
    saving.value = false
  }
}

async function runMission(mission: Mission) {
  running.value = mission.key
  try {
    await api('commercial/acquisition/run', {
      method: 'POST',
      body: { missionKey: mission.key },
    })
    toast.add({
      severity: 'success',
      summary: 'Mission lancée',
      detail: `${mission.productName} · ${mission.activity}`,
      life: 3500,
    })
    await load()
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'Mission non lancée',
      detail: e instanceof Error ? e.message : String(e),
      life: 4500,
    })
  } finally {
    running.value = null
  }
}

function strategyLabel(value: Strategy) {
  if (value === 'accelerate') return 'Accélérer'
  if (value === 'explore') return 'Explorer'
  if (value === 'steady') return 'Cadence normale'
  return 'Pause'
}

function strategySeverity(value: Strategy) {
  if (value === 'accelerate') return 'success'
  if (value === 'explore') return 'info'
  if (value === 'steady') return 'secondary'
  return 'warn'
}

function confidenceLabel(value: Mission['learningConfidence']) {
  if (value === 'strong') return 'Fort'
  if (value === 'usable') return 'Utilisable'
  return 'Collecte'
}

function formatRate(value: number | null | undefined) {
  if (value == null) return '—'
  return new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 }).format(value)
}

function formatXpf(value: number | null | undefined) {
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(value || 0)} XPF`
}

onMounted(load)
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1>Aurel Acquisition</h1>
        <p>La boucle qui décide quoi prospecter davantage — et quoi laisser tomber.</p>
      </div>
      <Button label="Actualiser" icon="pi pi-refresh" text :loading="loading" @click="load" />
    </div>

    <div v-if="state" class="kpis">
      <div class="card kpi">
        <span class="muted">État</span>
        <Tag :value="state.policy.enabled ? 'Autopilot actif' : 'En pause'" :severity="state.policy.enabled ? 'success' : 'secondary'" />
      </div>
      <div class="card kpi">
        <span class="muted">Recherche</span>
        <strong>{{ state.searchProvider || 'Indisponible' }}</strong>
      </div>
      <div class="card kpi">
        <span class="muted">Missions / 24 h</span>
        <strong>{{ state.runs24h }}/{{ state.policy.maxRuns24h }}</strong>
      </div>
      <div class="card kpi">
        <span class="muted">Taux de réponse appris</span>
        <strong>{{ formatRate(state.learningBaseline.replyRate) }}</strong>
      </div>
      <div class="card kpi">
        <span class="muted">Opportunités</span>
        <strong>{{ state.learningBaseline.opportunities }}</strong>
      </div>
      <div class="card kpi">
        <span class="muted">CA gagné appris</span>
        <strong>{{ formatXpf(state.learningBaseline.wonValueXpf) }}</strong>
      </div>
    </div>

    <div v-if="state" class="card status-card">
      <div>
        <strong>{{ state.autoRunAllowed ? 'Aurel peut lancer une mission' : 'Aurel attend' }}</strong>
        <p class="muted" style="margin: .35rem 0 0">
          {{ state.autoRunAllowed ? `Prochaine cible : ${state.topMission?.productName || '—'} · ${state.topMission?.activity || '—'}` : state.blockedReason }}
        </p>
      </div>
      <Tag
        v-if="state.activeJob"
        :value="`${state.activeJob.status} · ${state.activeJob.found}/${state.activeJob.batchSize}`"
        severity="info"
      />
    </div>

    <div class="card settings-grid">
      <div class="setting-line">
        <div>
          <strong>Boucle automatique</strong>
          <p class="muted">Aurel peut lancer seul des lots de 10 prospects en Polynésie.</p>
        </div>
        <ToggleSwitch v-model="policy.enabled" />
      </div>
      <div class="setting-line">
        <div>
          <strong>Auto-validation forte</strong>
          <p class="muted">Accepte Product Matcher seulement si le score est ≥ 70, confiance forte et produit attendu.</p>
        </div>
        <ToggleSwitch v-model="policy.autoAcceptHighConfidence" />
      </div>
      <div>
        <label>Heures minimum entre deux missions</label>
        <InputNumber v-model="policy.minHoursBetweenRuns" :min="6" :max="72" show-buttons />
      </div>
      <div>
        <label>Maximum de missions sur 24 h</label>
        <InputNumber v-model="policy.maxRuns24h" :min="1" :max="4" show-buttons />
      </div>
      <div class="save-row">
        <Button label="Enregistrer" icon="pi pi-save" :loading="saving" @click="savePolicy" />
      </div>
    </div>

    <div class="card" style="padding: 0; overflow: hidden">
      <DataTable :value="state?.missions || []" :loading="loading" striped-rows size="small" paginator :rows="12">
        <Column header="Priorité" sortable sort-field="priority" style="width: 110px">
          <template #body="{ data }"><strong>{{ data.priority }}/100</strong></template>
        </Column>
        <Column field="productName" header="Produit" sortable />
        <Column field="activity" header="Segment" sortable style="min-width: 190px" />
        <Column header="Stratégie" sortable sort-field="strategy">
          <template #body="{ data }">
            <Tag :value="strategyLabel(data.strategy)" :severity="strategySeverity(data.strategy)" />
          </template>
        </Column>
        <Column header="Apprentissage" style="min-width: 145px">
          <template #body="{ data }">
            <div class="stack" style="gap: .2rem">
              <span>{{ confidenceLabel(data.learningConfidence) }} · {{ data.contactedComparable }} contacts</span>
              <span class="muted">{{ data.radarAdjustment >= 0 ? '+' : '' }}{{ data.radarAdjustment }} pts</span>
            </div>
          </template>
        </Column>
        <Column header="Pourquoi" style="min-width: 320px">
          <template #body="{ data }"><span>{{ data.reason }}</span></template>
        </Column>
        <Column header="" style="width: 130px">
          <template #body="{ data }">
            <Button
              label="Lancer 10"
              size="small"
              icon="pi pi-play"
              :disabled="!data.autoEligible || Boolean(state?.activeJob)"
              :loading="running === data.key"
              @click="runMission(data)"
            />
          </template>
        </Column>
      </DataTable>
    </div>
  </div>
</template>

<style scoped>
.kpis {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: .8rem;
}
.kpi { display: flex; flex-direction: column; gap: .35rem; min-width: 0; }
.kpi strong { font-size: 1.15rem; }
.status-card { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.settings-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem 1.5rem; }
.setting-line { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.setting-line p { margin: .25rem 0 0; }
label { display: block; margin-bottom: .35rem; font-weight: 600; }
.save-row { grid-column: 1 / -1; display: flex; justify-content: flex-end; }
@media (max-width: 1100px) { .kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 750px) {
  .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .settings-grid { grid-template-columns: 1fr; }
}
</style>
