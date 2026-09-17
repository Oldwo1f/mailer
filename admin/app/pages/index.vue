<script setup lang="ts">
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'

 type ActionLog = {
  id: string
  actionType: string
  status: string
  summary: string
  createdAt: string
 }

 type PriorityAction = {
  prospectId: string
  company: string
  leadStatus: string
  productName: string | null
  action: string | null
  deferredFollowUpAt: string | null
  updatedAt: string
 }

 type LearningSegment = {
  label: string
  contacted: number
  radarAdjustment: number
  replyRate: number | null
  opportunityRate: number | null
 }

 type Experiment = {
  key: string
  variants: Array<{
    variant: string
    prospects: number
    sent: number
    opens: number
    clicks: number
    replies: number
    won: number
  }>
 }

 type AurelReport = {
  generatedAt: string
  summary: {
    prospects: number
    contacted: number
    replies: number
    opportunities: number
    won: number
    lost: number
    wonValueXpf: number
    sentEmails: number
    openedEmails: number
    clickedEmails: number
    activeCampaigns: number
    deferredDue: number
    deferredUpcoming: number
  }
  rates: {
    replyRate: number | null
    openRate: number | null
    clickRate: number | null
    closedWinRate: number | null
  }
  acquisition: {
    missions24h: number
    totalMissions: number
    totalSearchRequests: number
    prospectsFound: number
  }
  efficiency: {
    wonValueXpf: number
    valuePerSentEmailXpf: number | null
    valuePerSearchRequestXpf: number | null
    note: string
  }
  learning: {
    topPositive: LearningSegment[]
    topNegative: LearningSegment[]
  }
  experiments: Experiment[]
  priorityActions: PriorityAction[]
  recentActions: ActionLog[]
 }

const { api } = useApi()
const toast = useToast()
const report = ref<AurelReport | null>(null)
const loading = ref(true)
const runningFollowUps = ref(false)

async function load() {
  loading.value = true
  try {
    report.value = await api<AurelReport>('aurel/report')
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'Aurel au rapport',
      detail: e instanceof Error ? e.message : String(e),
      life: 4500,
    })
  } finally {
    loading.value = false
  }
}

async function runFollowUps() {
  runningFollowUps.value = true
  try {
    const result = await api<{ processed: number }>('aurel/followups/run', { method: 'POST' })
    toast.add({
      severity: 'success',
      summary: 'Relances différées',
      detail: `${result.processed} relance(s) traitée(s).`,
      life: 3000,
    })
    await load()
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'Relances différées',
      detail: e instanceof Error ? e.message : String(e),
      life: 4500,
    })
  } finally {
    runningFollowUps.value = false
  }
}

function pct(value: number | null) {
  if (value == null) return '—'
  return new Intl.NumberFormat('fr-FR', {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(value)
}

function xpf(value: number | null | undefined) {
  if (value == null) return '—'
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(value)} XPF`
}

function statusSeverity(value: string) {
  if (value === 'error' || value === 'blocked') return 'warn'
  return 'success'
}

onMounted(load)
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1>Aurel au rapport.</h1>
        <p>Ce que le système fait, apprend et doit traiter maintenant.</p>
      </div>
      <div class="row">
        <Button
          label="Traiter les relances dues"
          icon="pi pi-clock"
          text
          :loading="runningFollowUps"
          @click="runFollowUps"
        />
        <Button label="Actualiser" icon="pi pi-refresh" text :loading="loading" @click="load" />
      </div>
    </div>

    <div v-if="report" class="kpi-grid report-kpis">
      <div class="kpi">
        <div class="label">Pipeline actif</div>
        <div class="value">{{ report.summary.opportunities }}</div>
        <div class="muted">{{ report.summary.replies }} réponse(s)</div>
      </div>
      <div class="kpi">
        <div class="label">Ventes gagnées</div>
        <div class="value">{{ report.summary.won }}</div>
        <div class="muted">{{ xpf(report.summary.wonValueXpf) }}</div>
      </div>
      <div class="kpi">
        <div class="label">Taux de réponse</div>
        <div class="value">{{ pct(report.rates.replyRate) }}</div>
        <div class="muted">{{ report.summary.contacted }} contactés</div>
      </div>
      <div class="kpi">
        <div class="label">Campagnes actives</div>
        <div class="value">{{ report.summary.activeCampaigns }}</div>
        <div class="muted">{{ report.summary.sentEmails }} email(s) envoyés</div>
      </div>
      <div class="kpi">
        <div class="label">Relances dues</div>
        <div class="value">{{ report.summary.deferredDue }}</div>
        <div class="muted">{{ report.summary.deferredUpcoming }} à venir</div>
      </div>
      <div class="kpi">
        <div class="label">Acquisition 24 h</div>
        <div class="value">{{ report.acquisition.missions24h }}</div>
        <div class="muted">{{ report.acquisition.prospectsFound }} prospect(s) trouvés au total</div>
      </div>
    </div>

    <div class="two-cols">
      <div class="card">
        <div class="card-head">
          <div>
            <strong>À traiter maintenant</strong>
            <p class="muted">Cas commerciaux qui méritent encore de l’attention.</p>
          </div>
          <NuxtLink to="/radar"><Button label="Radar" text size="small" /></NuxtLink>
        </div>
        <div v-if="!report?.priorityActions.length" class="muted">Rien de prioritaire pour le moment.</div>
        <div v-else class="action-list">
          <div v-for="item in report.priorityActions" :key="item.prospectId" class="action-row">
            <div>
              <strong>{{ item.company }}</strong>
              <div class="muted">{{ item.productName || 'Produit à confirmer' }} · {{ item.leadStatus }}</div>
            </div>
            <div class="action-copy">{{ item.action }}</div>
          </div>
        </div>
      </div>

      <div class="card">
        <strong>Rendement opérationnel</strong>
        <div class="efficiency-grid" v-if="report">
          <div>
            <span class="muted">CA gagné / email envoyé</span>
            <strong>{{ xpf(report.efficiency.valuePerSentEmailXpf) }}</strong>
          </div>
          <div>
            <span class="muted">CA gagné / recherche web</span>
            <strong>{{ xpf(report.efficiency.valuePerSearchRequestXpf) }}</strong>
          </div>
          <div>
            <span class="muted">Ouverture</span>
            <strong>{{ pct(report.rates.openRate) }}</strong>
          </div>
          <div>
            <span class="muted">Win rate dossiers clos</span>
            <strong>{{ pct(report.rates.closedWinRate) }}</strong>
          </div>
        </div>
        <p class="muted" style="margin-bottom: 0">{{ report?.efficiency.note }}</p>
      </div>
    </div>

    <div class="two-cols">
      <div class="card">
        <strong>Aurel apprend — segments qui montent</strong>
        <div v-if="!report?.learning.topPositive.length" class="muted learning-empty">
          Pas encore assez de données pour favoriser un segment.
        </div>
        <div v-else class="learning-list">
          <div v-for="segment in report.learning.topPositive" :key="segment.label" class="learning-row">
            <span>{{ segment.label }}</span>
            <Tag :value="`+${segment.radarAdjustment} pts`" severity="success" />
          </div>
        </div>
      </div>

      <div class="card">
        <strong>Segments à ralentir</strong>
        <div v-if="!report?.learning.topNegative.length" class="muted learning-empty">
          Aucun segment suffisamment documenté ne sous-performe nettement.
        </div>
        <div v-else class="learning-list">
          <div v-for="segment in report.learning.topNegative" :key="segment.label" class="learning-row">
            <span>{{ segment.label }}</span>
            <Tag :value="`${segment.radarAdjustment} pts`" severity="warn" />
          </div>
        </div>
      </div>
    </div>

    <div class="card" v-if="report?.experiments.length">
      <div class="card-head">
        <div>
          <strong>Expériences commerciales A/B</strong>
          <p class="muted">Petits lots alternés : on observe avant de modifier les règles.</p>
        </div>
      </div>
      <DataTable :value="report.experiments.flatMap(exp => exp.variants.map(v => ({ ...v, key: exp.key })))" size="small" striped-rows>
        <Column field="key" header="Expérience" />
        <Column field="variant" header="Variante" />
        <Column field="prospects" header="Prospects" />
        <Column field="sent" header="Envoyés" />
        <Column field="opens" header="Ouverts" />
        <Column field="clicks" header="Clics" />
        <Column field="replies" header="Réponses" />
        <Column field="won" header="Gagnés" />
      </DataTable>
    </div>

    <div class="card" style="padding: 0; overflow: hidden">
      <div class="card-head padded">
        <div>
          <strong>Journal d’autonomie</strong>
          <p class="muted">Les dernières décisions prises automatiquement par Aurel.</p>
        </div>
      </div>
      <DataTable :value="report?.recentActions || []" :loading="loading" size="small" striped-rows>
        <Column field="createdAt" header="Date" style="width: 180px">
          <template #body="{ data }">{{ new Date(data.createdAt).toLocaleString('fr-FR') }}</template>
        </Column>
        <Column field="actionType" header="Action" style="width: 190px" />
        <Column field="summary" header="Décision" />
        <Column field="status" header="État" style="width: 110px">
          <template #body="{ data }"><Tag :value="data.status" :severity="statusSeverity(data.status)" /></template>
        </Column>
      </DataTable>
    </div>
  </div>
</template>

<style scoped>
.report-kpis { grid-template-columns: repeat(6, minmax(0, 1fr)); }
.two-cols { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
.card-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; }
.card-head p { margin: 0.25rem 0 0; }
.padded { padding: 1rem 1rem 0.75rem; }
.action-list, .learning-list { display: flex; flex-direction: column; gap: 0.75rem; margin-top: 0.85rem; }
.action-row { display: grid; grid-template-columns: minmax(150px, 0.7fr) minmax(220px, 1.3fr); gap: 1rem; align-items: start; padding-bottom: 0.75rem; border-bottom: 1px solid var(--mailer-border); }
.action-row:last-child { border-bottom: 0; padding-bottom: 0; }
.action-copy { line-height: 1.4; }
.efficiency-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; margin: 1rem 0; }
.efficiency-grid div { display: flex; flex-direction: column; gap: 0.25rem; }
.efficiency-grid strong { font-size: 1.15rem; }
.learning-row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.learning-empty { margin-top: 0.85rem; }
@media (max-width: 1200px) { .report-kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 800px) { .two-cols { grid-template-columns: 1fr; } .report-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } .action-row { grid-template-columns: 1fr; } }
</style>
