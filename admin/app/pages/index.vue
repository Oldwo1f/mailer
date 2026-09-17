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
    <section class="atelys-hero">
      <div class="hero-orbit" aria-hidden="true">
        <span class="orbit-dot orbit-dot-a" />
        <span class="orbit-dot orbit-dot-b" />
      </div>
      <div class="hero-copy">
        <div class="eyebrow">ATELYS · CENTRE DE CONTRÔLE COMMERCIAL</div>
        <h1>Aurel au rapport.</h1>
        <p>Une vue claire de ce que l’atelier prospecte, apprend et transforme — sans perdre le fil humain.</p>
        <div class="hero-meta">
          <span class="live-dot" />
          <span>Système autonome actif</span>
          <span class="hero-separator">·</span>
          <span>Polynésie française</span>
        </div>
      </div>
      <div class="hero-actions">
        <Button
          label="Traiter les relances dues"
          icon="pi pi-clock"
          outlined
          :loading="runningFollowUps"
          @click="runFollowUps"
        />
        <Button label="Actualiser" icon="pi pi-refresh" text :loading="loading" @click="load" />
      </div>
    </section>

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
.atelys-hero {
  position: relative;
  overflow: hidden;
  min-height: 214px;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 2rem;
  padding: 2rem 2.1rem 1.8rem;
  border: 1px solid rgba(116, 68, 60, 0.12);
  border-radius: 24px;
  background:
    radial-gradient(circle at 90% 20%, rgba(223, 159, 103, 0.16), transparent 15rem),
    radial-gradient(circle at 68% 110%, rgba(255, 250, 242, 0.08), transparent 20rem),
    linear-gradient(135deg, #261321 0%, #32192b 58%, #1c1019 100%);
  color: #f8efe7;
  box-shadow: 0 20px 55px rgba(54, 24, 43, 0.12);
}

.hero-copy {
  position: relative;
  z-index: 2;
  max-width: 760px;
}

.eyebrow {
  margin-bottom: 0.8rem;
  color: #d59a67;
  font-size: 0.68rem;
  font-weight: 760;
  letter-spacing: 0.16em;
}

.atelys-hero h1 {
  margin: 0;
  font-family: ui-serif, Georgia, Cambria, 'Times New Roman', serif;
  font-size: clamp(2.2rem, 4.2vw, 4rem);
  font-weight: 500;
  letter-spacing: -0.055em;
  line-height: 0.98;
  color: #fff9f2;
}

.atelys-hero p {
  max-width: 620px;
  margin: 1rem 0 0;
  color: #cdbeb7;
  font-size: 0.97rem;
  line-height: 1.6;
}

.hero-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin-top: 1.2rem;
  color: #9f8d85;
  font-size: 0.72rem;
  letter-spacing: 0.025em;
}

.live-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: #d99a60;
  box-shadow: 0 0 14px rgba(217, 154, 96, 0.62);
}

.hero-separator {
  color: #735e58;
}

.hero-actions {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 0.45rem;
  flex-wrap: wrap;
}

.hero-actions :deep(.p-button-outlined) {
  color: #f1ded0 !important;
  border-color: rgba(222, 166, 116, 0.35) !important;
  background: rgba(255, 255, 255, 0.025) !important;
}

.hero-actions :deep(.p-button-text) {
  color: #bdaaa1 !important;
}

.hero-orbit {
  position: absolute;
  right: 5.4rem;
  top: -8.2rem;
  width: 300px;
  height: 300px;
  border: 1px solid rgba(222, 154, 95, 0.13);
  border-radius: 50%;
  transform: rotate(-18deg);
}

.hero-orbit::before {
  content: '';
  position: absolute;
  inset: 38px -30px;
  border: 1px solid rgba(222, 154, 95, 0.085);
  border-radius: 50%;
  transform: rotate(42deg);
}

.orbit-dot {
  position: absolute;
  display: block;
  border-radius: 999px;
  background: #db995f;
  box-shadow: 0 0 18px rgba(219, 153, 95, 0.55);
}

.orbit-dot-a {
  width: 6px;
  height: 6px;
  left: 30px;
  top: 153px;
}

.orbit-dot-b {
  width: 4px;
  height: 4px;
  right: 13px;
  bottom: 70px;
}

.report-kpis {
  grid-template-columns: repeat(6, minmax(0, 1fr));
}

.report-kpis .kpi:nth-child(2) .value {
  color: #8e4d36;
}

.report-kpis .kpi:nth-child(5) .value {
  color: #9d653f;
}

.two-cols {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.9rem;
}

.card-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}

.card-head p {
  margin: 0.28rem 0 0;
}

.card > strong,
.card-head strong {
  color: #38262b;
  font-size: 0.92rem;
  letter-spacing: -0.01em;
}

.padded {
  padding: 1.1rem 1.25rem 0.82rem;
}

.action-list,
.learning-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: 0.9rem;
}

.action-row {
  display: grid;
  grid-template-columns: minmax(150px, 0.7fr) minmax(220px, 1.3fr);
  gap: 1rem;
  align-items: start;
  padding: 0.2rem 0 0.85rem;
  border-bottom: 1px solid var(--mailer-border);
}

.action-row:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}

.action-row strong {
  color: #3c292d;
}

.action-copy {
  color: #5c4b49;
  line-height: 1.48;
}

.efficiency-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.8rem;
  margin: 1rem 0;
}

.efficiency-grid div {
  display: flex;
  flex-direction: column;
  gap: 0.32rem;
  padding: 0.85rem;
  border-radius: 13px;
  background: rgba(245, 236, 227, 0.7);
  border: 1px solid rgba(96, 58, 60, 0.07);
}

.efficiency-grid strong {
  font-family: ui-serif, Georgia, Cambria, 'Times New Roman', serif;
  font-size: 1.22rem;
  font-weight: 560;
  color: #4a302f;
}

.learning-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.2rem 0;
}

.learning-empty {
  margin-top: 0.85rem;
}

@media (max-width: 1200px) {
  .report-kpis {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .atelys-hero {
    align-items: flex-start;
    flex-direction: column;
  }
}

@media (max-width: 800px) {
  .atelys-hero {
    min-height: 0;
    padding: 1.45rem 1.25rem;
    border-radius: 18px;
  }

  .hero-orbit {
    right: -8rem;
  }

  .two-cols {
    grid-template-columns: 1fr;
  }

  .report-kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .action-row {
    grid-template-columns: 1fr;
  }
}
</style>
