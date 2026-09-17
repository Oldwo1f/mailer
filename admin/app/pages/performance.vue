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

const { api } = useApi()
const toast = useToast()
const loading = ref(false)
const analytics = ref<ProductAnalytics | null>(null)

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

async function load() {
  loading.value = true
  try {
    analytics.value = await api<ProductAnalytics>('commercial/analytics/products')
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

onMounted(load)
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1>Performance Atelys</h1>
        <p>Compare les produits sur les réponses, opportunités et revenus réels.</p>
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

    <div class="card">
      <strong>Lecture des indicateurs</strong>
      <p class="muted" style="margin-bottom: 0">
        Le taux de réponse utilise les prospects déjà contactés. Le win rate utilise uniquement les dossiers clos (gagnés + perdus). Le pipeline actif additionne uniquement Intéressé, Démo, Rendez-vous et Devis. Les recommandations non validées restent séparées pour éviter d’attribuer artificiellement une vente à un produit.
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
.kpi {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.kpi strong {
  font-size: 1.35rem;
}
@media (max-width: 900px) {
  .performance-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
