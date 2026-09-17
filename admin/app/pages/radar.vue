<script setup lang="ts">
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Tag from 'primevue/tag'

 type RadarTier = 'cold' | 'promising' | 'hot'
 type DemoEnergyMode = 'none' | 'prepare' | 'generate' | 'generated'

 type RadarItem = {
  prospectId: string
  company: string
  contactName: string | null
  leadStatus: string
  score: number
  tier: RadarTier
  productName: string | null
  dealValueXpf: number
  sent: number
  opens: number
  clicks: number
  replied: boolean
  signals: string[]
  nextAction: string
  demoEligible: boolean
  demoMode: DemoEnergyMode
  demoReason: string
  updatedAt: string | null
}

 type RadarResult = {
  generatedAt: string
  summary: {
    totalActive: number
    cold: number
    promising: number
    hot: number
    demoEligible: number
    repliesNeedingAttention: number
    activePipelineValueXpf: number
  }
  items: RadarItem[]
}

const { api } = useApi()
const toast = useToast()
const loading = ref(false)
const radar = ref<RadarResult | null>(null)
const tierFilter = ref<RadarTier | 'all'>('all')

const filtered = computed(() => {
  const rows = radar.value?.items || []
  return tierFilter.value === 'all' ? rows : rows.filter((row) => row.tier === tierFilter.value)
})

async function load() {
  loading.value = true
  try {
    radar.value = await api<RadarResult>('commercial/radar')
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'Aurel Radar',
      detail: e instanceof Error ? e.message : String(e),
      life: 4500,
    })
  } finally {
    loading.value = false
  }
}

function tierLabel(tier: RadarTier) {
  if (tier === 'hot') return 'Chaud'
  if (tier === 'promising') return 'Prometteur'
  return 'Froid'
}

function tierSeverity(tier: RadarTier) {
  if (tier === 'hot') return 'danger'
  if (tier === 'promising') return 'warn'
  return 'secondary'
}

function demoLabel(mode: DemoEnergyMode) {
  if (mode === 'generated') return 'Démo prête'
  if (mode === 'generate') return 'Générer'
  if (mode === 'prepare') return 'Préparer seulement'
  return 'Aucune démo'
}

function demoSeverity(mode: DemoEnergyMode) {
  if (mode === 'generated') return 'success'
  if (mode === 'generate') return 'info'
  if (mode === 'prepare') return 'warn'
  return 'secondary'
}

function formatXpf(value: number | null | undefined) {
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(value || 0)} XPF`
}

function actionPath(item: RadarItem) {
  if (item.demoMode === 'generate' || item.demoMode === 'generated') return '/demo-personalizer'
  if (!item.productName) return '/product-matcher'
  return '/pipeline'
}

onMounted(load)
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1>Aurel Radar</h1>
        <p>Qui mérite notre énergie maintenant — et qui doit rester au repos.</p>
      </div>
      <div class="row">
        <NuxtLink to="/pipeline"><Button label="Pipeline" icon="pi pi-chart-line" text /></NuxtLink>
        <Button label="Actualiser" icon="pi pi-refresh" text :loading="loading" @click="load" />
      </div>
    </div>

    <div v-if="radar" class="radar-kpis">
      <button class="card kpi clickable" @click="tierFilter = 'hot'">
        <span class="muted">Prospects chauds</span>
        <strong>{{ radar.summary.hot }}</strong>
      </button>
      <button class="card kpi clickable" @click="tierFilter = 'promising'">
        <span class="muted">Prometteurs</span>
        <strong>{{ radar.summary.promising }}</strong>
      </button>
      <button class="card kpi clickable" @click="tierFilter = 'cold'">
        <span class="muted">À laisser au repos</span>
        <strong>{{ radar.summary.cold }}</strong>
      </button>
      <div class="card kpi">
        <span class="muted">Démo justifiée</span>
        <strong>{{ radar.summary.demoEligible }}</strong>
      </div>
      <div class="card kpi">
        <span class="muted">Réponses à traiter</span>
        <strong>{{ radar.summary.repliesNeedingAttention }}</strong>
      </div>
      <div class="card kpi">
        <span class="muted">Pipeline actif</span>
        <strong>{{ formatXpf(radar.summary.activePipelineValueXpf) }}</strong>
      </div>
    </div>

    <div class="card radar-rule">
      <div>
        <strong>Règle anti-gaspillage</strong>
        <p class="muted">
          Froid = aucun rendu. Prometteur = préparation légère. Chaud = vraie démo seulement si un signal commercial le justifie.
        </p>
      </div>
      <Button
        v-if="tierFilter !== 'all'"
        label="Afficher tout"
        icon="pi pi-times"
        text
        @click="tierFilter = 'all'"
      />
    </div>

    <div class="card" style="padding: 0; overflow: hidden">
      <DataTable
        :value="filtered"
        :loading="loading"
        data-key="prospectId"
        paginator
        :rows="20"
        striped-rows
        size="small"
      >
        <Column header="Priorité" sortable sort-field="score" style="min-width: 130px">
          <template #body="{ data }">
            <div class="stack" style="gap: 0.3rem">
              <Tag :value="tierLabel(data.tier)" :severity="tierSeverity(data.tier)" />
              <strong>{{ data.score }}/100</strong>
            </div>
          </template>
        </Column>

        <Column field="company" header="Entreprise" sortable style="min-width: 180px">
          <template #body="{ data }">
            <div class="stack" style="gap: 0.15rem">
              <strong>{{ data.company }}</strong>
              <span class="muted">{{ data.contactName || data.productName || '—' }}</span>
            </div>
          </template>
        </Column>

        <Column header="Signaux" style="min-width: 220px">
          <template #body="{ data }">
            <div class="signals">
              <Tag v-for="signal in data.signals" :key="signal" :value="signal" severity="secondary" />
              <span v-if="!data.signals.length" class="muted">Aucun signal fort</span>
            </div>
          </template>
        </Column>

        <Column header="Action suivante" style="min-width: 240px">
          <template #body="{ data }">
            <strong>{{ data.nextAction }}</strong>
          </template>
        </Column>

        <Column header="Énergie démo" style="min-width: 180px">
          <template #body="{ data }">
            <div class="stack" style="gap: 0.3rem">
              <Tag :value="demoLabel(data.demoMode)" :severity="demoSeverity(data.demoMode)" />
              <span class="muted">{{ data.demoReason }}</span>
            </div>
          </template>
        </Column>

        <Column header="Engagement" style="min-width: 130px">
          <template #body="{ data }">
            <div class="stack" style="gap: 0.15rem">
              <span>{{ data.sent }} envoi(s)</span>
              <span>{{ data.opens }} ouverture(s)</span>
              <span>{{ data.clicks }} clic(s)</span>
            </div>
          </template>
        </Column>

        <Column header="Valeur" sortable sort-field="dealValueXpf" style="min-width: 120px">
          <template #body="{ data }">{{ formatXpf(data.dealValueXpf) }}</template>
        </Column>

        <Column header="" style="width: 110px">
          <template #body="{ data }">
            <NuxtLink :to="actionPath(data)">
              <Button label="Traiter" icon="pi pi-arrow-right" size="small" />
            </NuxtLink>
          </template>
        </Column>
      </DataTable>
    </div>
  </div>
</template>

<style scoped>
.radar-kpis {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 0.85rem;
}
.kpi {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.35rem;
  min-width: 0;
}
.kpi strong {
  font-size: 1.45rem;
}
.clickable {
  border: 1px solid var(--mailer-border);
  text-align: left;
  cursor: pointer;
  font: inherit;
}
.clickable:hover {
  transform: translateY(-1px);
}
.radar-rule {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}
.radar-rule p {
  margin: 0.35rem 0 0;
}
.signals {
  display: flex;
  gap: 0.3rem;
  flex-wrap: wrap;
}
@media (max-width: 1200px) {
  .radar-kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 700px) {
  .radar-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
