<script setup lang="ts">
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Tag from 'primevue/tag'

type ProductPerformance = {
  productId: string
  productName: string
  prospects: number
  contactedOrLater: number
  replied: number
  activeOpportunities: number
  won: number
  lost: number
  activePipelineValueXpf: number
  wonValueXpf: number
  replyRate: number | null
  closedWinRate: number | null
  averageWonValueXpf: number | null
}

type ProductAnalytics = {
  generatedAt: string
  products: ProductPerformance[]
}

type LearningConfidence = 'collecting' | 'usable' | 'strong'
type LearningDimension = 'product' | 'activity' | 'product_activity'

type LearningSegment = {
  key: string
  dimension: LearningDimension
  label: string
  productId: string | null
  productName: string | null
  activity: string | null
  prospects: number
  contacted: number
  replied: number
  opportunities: number
  won: number
  lost: number
  wonValueXpf: number
  replyRate: number | null
  opportunityRate: number | null
  closedWinRate: number | null
  confidence: LearningConfidence
  radarAdjustment: number
  learningReason: string
}

type LearningSnapshot = {
  generatedAt: string
  thresholds: {
    minContactedForAdjustment: number
    strongContacted: number
    priorStrength: number
  }
  baseline: {
    prospects: number
    contacted: number
    replied: number
    opportunities: number
    won: number
    lost: number
    wonValueXpf: number
    replyRate: number | null
    opportunityRate: number | null
    closedWinRate: number | null
  }
  replyIntents: Array<{ intent: string; count: number }>
  segments: LearningSegment[]
}

const { api } = useApi()
const toast = useToast()
const loading = ref(false)
const analytics = ref<ProductAnalytics | null>(null)
const learning = ref<LearningSnapshot | null>(null)

const attributed = computed(() =>
  (analytics.value?.products || []).filter((row) => row.productId !== 'unattributed'),
)

const totals = computed(() => {
  const rows = attributed.value
  return {
    prospects: rows.reduce((sum, row) => sum + row.prospects, 0),
    activeValue: rows.reduce((sum, row) => sum + row.activePipelineValueXpf, 0),
    wonValue: rows.reduce((sum, row) => sum + row.wonValueXpf, 0),
    won: rows.reduce((sum, row) => sum + row.won, 0),
  }
})

const learningSegments = computed(() =>
  (learning.value?.segments || [])
    .filter((row) => row.contacted > 0)
    .sort((a, b) => {
      if (a.confidence !== b.confidence) {
        const rank = { strong: 2, usable: 1, collecting: 0 }
        return rank[b.confidence] - rank[a.confidence]
      }
      if (b.radarAdjustment !== a.radarAdjustment) return b.radarAdjustment - a.radarAdjustment
      return b.contacted - a.contacted
    })
    .slice(0, 40),
)

const usableLearningCount = computed(() =>
  (learning.value?.segments || []).filter((row) => row.confidence !== 'collecting').length,
)

const activeAdjustmentCount = computed(() =>
  (learning.value?.segments || []).filter((row) => row.radarAdjustment !== 0).length,
)

async function load() {
  loading.value = true
  try {
    ;[analytics.value, learning.value] = await Promise.all([
      api<ProductAnalytics>('commercial/analytics/products'),
      api<LearningSnapshot>('commercial/analytics/learning'),
    ])
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'Performance produits',
      detail: e instanceof Error ? e.message : String(e),
      life: 5000,
    })
  } finally {
    loading.value = false
  }
}

function formatXpf(value: number | null | undefined) {
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(value || 0)} XPF`
}

function formatRate(value: number | null) {
  if (value == null) return '—'
  return `${new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 }).format(value)}`
}

function replySeverity(value: number | null) {
  if (value == null) return 'secondary'
  if (value >= 0.25) return 'success'
  if (value >= 0.1) return 'info'
  return 'warn'
}

function confidenceLabel(value: LearningConfidence) {
  if (value === 'strong') return 'Solide'
  if (value === 'usable') return 'Utilisable'
  return 'Collecte'
}

function confidenceSeverity(value: LearningConfidence) {
  if (value === 'strong') return 'success'
  if (value === 'usable') return 'info'
  return 'secondary'
}

function dimensionLabel(value: LearningDimension) {
  if (value === 'product_activity') return 'Produit + métier'
  if (value === 'product') return 'Produit'
  return 'Métier'
}

function adjustmentLabel(value: number) {
  if (!value) return '0'
  return `${value > 0 ? '+' : ''}${value}`
}

function adjustmentSeverity(value: number) {
  if (value > 0) return 'success'
  if (value < 0) return 'warn'
  return 'secondary'
}

function intentLabel(intent: string) {
  const labels: Record<string, string> = {
    price: 'Prix',
    interested: 'Intéressé',
    demo: 'Démo',
    later: 'Plus tard',
    meeting: 'Rendez-vous',
    not_interested: 'Refus',
    unsubscribe: 'Désinscription',
    question: 'Question',
    unknown: 'Inconnu',
  }
  return labels[intent] || intent
}

onMounted(load)
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1>Performance Atelys</h1>
        <p>Compare les produits et laisse Aurel apprendre progressivement de vos vrais résultats commerciaux.</p>
      </div>
      <Button icon="pi pi-refresh" label="Actualiser" text :loading="loading" @click="load" />
    </div>

    <div class="performance-kpis">
      <div class="card kpi">
        <span class="muted">Prospects attribués</span>
        <strong>{{ totals.prospects }}</strong>
      </div>
      <div class="card kpi">
        <span class="muted">Opportunités actives</span>
        <strong>{{ formatXpf(totals.activeValue) }}</strong>
      </div>
      <div class="card kpi">
        <span class="muted">Ventes gagnées</span>
        <strong>{{ totals.won }}</strong>
      </div>
      <div class="card kpi">
        <span class="muted">CA gagné</span>
        <strong>{{ formatXpf(totals.wonValue) }}</strong>
      </div>
    </div>

    <div class="card" style="padding: 0; overflow: hidden">
      <DataTable :value="analytics?.products || []" :loading="loading" striped-rows size="small">
        <Column field="productName" header="Produit" sortable>
          <template #body="{ data }">
            <div class="stack" style="gap: 0.15rem">
              <strong>{{ data.productName }}</strong>
              <span v-if="data.productId === 'unattributed'" class="muted">À qualifier / valider</span>
            </div>
          </template>
        </Column>
        <Column field="prospects" header="Prospects" sortable />
        <Column field="contactedOrLater" header="Contactés+" sortable />
        <Column field="replied" header="Réponses" sortable />
        <Column header="Taux réponse" sortable sort-field="replyRate">
          <template #body="{ data }">
            <Tag :value="formatRate(data.replyRate)" :severity="replySeverity(data.replyRate)" />
          </template>
        </Column>
        <Column field="activeOpportunities" header="Actifs" sortable />
        <Column header="Pipeline XPF" sortable sort-field="activePipelineValueXpf">
          <template #body="{ data }">{{ formatXpf(data.activePipelineValueXpf) }}</template>
        </Column>
        <Column field="won" header="Gagnés" sortable />
        <Column field="lost" header="Perdus" sortable />
        <Column header="Win rate clos" sortable sort-field="closedWinRate">
          <template #body="{ data }">{{ formatRate(data.closedWinRate) }}</template>
        </Column>
        <Column header="CA gagné" sortable sort-field="wonValueXpf">
          <template #body="{ data }"><strong>{{ formatXpf(data.wonValueXpf) }}</strong></template>
        </Column>
        <Column header="Panier gagné moyen" sortable sort-field="averageWonValueXpf">
          <template #body="{ data }">{{ data.averageWonValueXpf == null ? '—' : formatXpf(data.averageWonValueXpf) }}</template>
        </Column>
      </DataTable>
    </div>

    <div class="page-header learning-header">
      <div>
        <h2>Aurel apprend</h2>
        <p>Le Radar n'ajuste ses priorités qu'après un volume minimum de résultats comparables.</p>
      </div>
    </div>

    <div v-if="learning" class="learning-kpis">
      <div class="card kpi">
        <span class="muted">Base contactée</span>
        <strong>{{ learning.baseline.contacted }}</strong>
      </div>
      <div class="card kpi">
        <span class="muted">Réponse moyenne</span>
        <strong>{{ formatRate(learning.baseline.replyRate) }}</strong>
      </div>
      <div class="card kpi">
        <span class="muted">Opportunité moyenne</span>
        <strong>{{ formatRate(learning.baseline.opportunityRate) }}</strong>
      </div>
      <div class="card kpi">
        <span class="muted">Segments utilisables</span>
        <strong>{{ usableLearningCount }}</strong>
      </div>
      <div class="card kpi">
        <span class="muted">Corrections actives</span>
        <strong>{{ activeAdjustmentCount }}</strong>
      </div>
    </div>

    <div v-if="learning?.replyIntents?.length" class="card">
      <strong>Ce que disent les réponses</strong>
      <div class="intent-row">
        <Tag
          v-for="item in learning.replyIntents"
          :key="item.intent"
          :value="`${intentLabel(item.intent)} · ${item.count}`"
          severity="secondary"
        />
      </div>
    </div>

    <div class="card" style="padding: 0; overflow: hidden">
      <DataTable :value="learningSegments" :loading="loading" striped-rows size="small" paginator :rows="20">
        <Column field="label" header="Segment" sortable style="min-width: 220px">
          <template #body="{ data }">
            <div class="stack" style="gap: 0.2rem">
              <strong>{{ data.label }}</strong>
              <span class="muted">{{ dimensionLabel(data.dimension) }}</span>
            </div>
          </template>
        </Column>
        <Column field="contacted" header="Contactés" sortable />
        <Column field="replied" header="Réponses" sortable />
        <Column header="Taux réponse" sortable sort-field="replyRate">
          <template #body="{ data }">{{ formatRate(data.replyRate) }}</template>
        </Column>
        <Column field="opportunities" header="Opportunités" sortable />
        <Column header="Taux opportunité" sortable sort-field="opportunityRate">
          <template #body="{ data }">{{ formatRate(data.opportunityRate) }}</template>
        </Column>
        <Column field="won" header="Gagnés" sortable />
        <Column header="Win rate clos" sortable sort-field="closedWinRate">
          <template #body="{ data }">{{ formatRate(data.closedWinRate) }}</template>
        </Column>
        <Column header="Confiance" sortable sort-field="contacted">
          <template #body="{ data }">
            <Tag :value="confidenceLabel(data.confidence)" :severity="confidenceSeverity(data.confidence)" />
          </template>
        </Column>
        <Column header="Impact Radar" sortable sort-field="radarAdjustment">
          <template #body="{ data }">
            <Tag :value="adjustmentLabel(data.radarAdjustment)" :severity="adjustmentSeverity(data.radarAdjustment)" />
          </template>
        </Column>
      </DataTable>
    </div>

    <div class="card">
      <strong>Règle d'apprentissage</strong>
      <p class="muted" style="margin-bottom: 0">
        Aurel observe les taux de réponse, les opportunités et les ventes par produit et métier. Avant {{ learning?.thresholds.minContactedForAdjustment ?? 8 }} contacts comparables, il collecte seulement. Ensuite, la correction du Radar reste volontairement limitée à ±8 points et ne peut pas, à elle seule, transformer un prospect en prospect chaud. Les signaux réels du prospect restent prioritaires.
      </p>
    </div>
  </div>
</template>

<style scoped>
.performance-kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1rem;
}
.learning-kpis {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 1rem;
}
.kpi {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.kpi strong {
  font-size: 1.35rem;
}
.learning-header {
  margin-top: 0.5rem;
}
.learning-header h2 {
  margin: 0;
}
.intent-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.75rem;
}
@media (max-width: 1100px) {
  .learning-kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 900px) {
  .performance-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .learning-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
