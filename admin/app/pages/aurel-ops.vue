<script setup lang="ts">
import Button from 'primevue/button'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Tag from 'primevue/tag'
import Checkbox from 'primevue/checkbox'

 type OpsSnapshot = {
  generatedAt: string
  bookingReady: boolean
  config: {
    bookingUrl: string | null
    costPerSearchXpf: number
    costPerEmailXpf: number
    costPerAiGenerationXpf: number
    hotPipelineFollowUpsEnabled: boolean
  }
  directRoi: {
    costsConfigured: boolean
    wonValueXpf: number
    searchRequests: number
    sentEmails: number
    aiGenerations: number
    searchCostXpf: number
    emailCostXpf: number
    aiCostXpf: number
    trackedDirectCostXpf: number
    contributionAfterTrackedCostsXpf: number
    roi: number | null
    note: string
  }
 }

const { api } = useApi()
const toast = useToast()
const loading = ref(false)
const saving = ref(false)
const snapshot = ref<OpsSnapshot | null>(null)
const form = reactive({
  bookingUrl: '',
  costPerSearchXpf: 0,
  costPerEmailXpf: 0,
  costPerAiGenerationXpf: 0,
  hotPipelineFollowUpsEnabled: true,
})

async function load() {
  loading.value = true
  try {
    snapshot.value = await api<OpsSnapshot>('aurel/ops')
    const cfg = snapshot.value.config
    form.bookingUrl = cfg.bookingUrl || ''
    form.costPerSearchXpf = cfg.costPerSearchXpf
    form.costPerEmailXpf = cfg.costPerEmailXpf
    form.costPerAiGenerationXpf = cfg.costPerAiGenerationXpf
    form.hotPipelineFollowUpsEnabled = cfg.hotPipelineFollowUpsEnabled
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'Aurel Ops',
      detail: e instanceof Error ? e.message : String(e),
      life: 4500,
    })
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  try {
    snapshot.value = await api<OpsSnapshot>('aurel/ops', {
      method: 'PUT',
      body: {
        bookingUrl: form.bookingUrl.trim() || null,
        costPerSearchXpf: form.costPerSearchXpf || 0,
        costPerEmailXpf: form.costPerEmailXpf || 0,
        costPerAiGenerationXpf: form.costPerAiGenerationXpf || 0,
        hotPipelineFollowUpsEnabled: form.hotPipelineFollowUpsEnabled,
      },
    })
    toast.add({ severity: 'success', summary: 'Aurel Ops enregistré', life: 2500 })
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'Aurel Ops',
      detail: e instanceof Error ? e.message : String(e),
      life: 4500,
    })
  } finally {
    saving.value = false
  }
}

function xpf(value: number | null | undefined) {
  if (value == null) return '—'
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(value)} XPF`
}

function pct(value: number | null) {
  if (value == null) return '—'
  return new Intl.NumberFormat('fr-FR', {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(value)
}

onMounted(load)
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1>Aurel Ops</h1>
        <p>Rendez-vous, relances chaudes et coûts directs suivis.</p>
      </div>
      <div class="row">
        <Button label="Actualiser" icon="pi pi-refresh" text :loading="loading" @click="load" />
        <Button label="Enregistrer" icon="pi pi-save" :loading="saving" @click="save" />
      </div>
    </div>

    <div class="two-cols">
      <div class="card stack">
        <div class="row" style="justify-content: space-between; align-items: center">
          <div>
            <strong>Rendez-vous autonomes</strong>
            <p class="muted" style="margin: 0.25rem 0 0">
              Aurel envoie ce lien uniquement lorsqu’un prospect demande explicitement un rendez-vous.
            </p>
          </div>
          <Tag
            :value="snapshot?.bookingReady ? 'Prêt' : 'Lien requis'"
            :severity="snapshot?.bookingReady ? 'success' : 'warn'"
          />
        </div>
        <label class="stack" style="gap: 0.35rem">
          <span>Lien Google Calendar / Calendly / autre réservation</span>
          <InputText v-model="form.bookingUrl" placeholder="https://..." />
        </label>
        <p class="muted" style="margin: 0">
          Tant que ce champ est vide, aucune réponse automatique de rendez-vous n’est envoyée.
        </p>
      </div>

      <div class="card stack">
        <strong>Orchestration prospects chauds</strong>
        <label class="row" style="gap: 0.6rem; align-items: center">
          <Checkbox v-model="form.hotPipelineFollowUpsEnabled" binary />
          <span>Relancer automatiquement les étapes Intéressé, Démo et Devis lorsqu’elles stagnent.</span>
        </label>
        <p class="muted" style="margin: 0">
          Intéressé : 4 jours · Démo : 3 jours · Devis : 4 jours. Gagné, perdu et désinscrit bloquent toujours les envois.
        </p>
      </div>
    </div>

    <div class="card stack">
      <div>
        <strong>Coûts directs pour calculer le ROI</strong>
        <p class="muted" style="margin: 0.25rem 0 0">
          Saisis tes coûts moyens réels. Zéro signifie « non suivi » et aucun prix n’est inventé par Aurel.
        </p>
      </div>
      <div class="cost-grid">
        <label class="stack" style="gap: 0.35rem">
          <span>Coût moyen / recherche web (XPF)</span>
          <InputNumber v-model="form.costPerSearchXpf" :min="0" :min-fraction-digits="0" :max-fraction-digits="3" />
        </label>
        <label class="stack" style="gap: 0.35rem">
          <span>Coût moyen / email envoyé (XPF)</span>
          <InputNumber v-model="form.costPerEmailXpf" :min="0" :min-fraction-digits="0" :max-fraction-digits="3" />
        </label>
        <label class="stack" style="gap: 0.35rem">
          <span>Coût moyen / génération IA email (XPF)</span>
          <InputNumber v-model="form.costPerAiGenerationXpf" :min="0" :min-fraction-digits="0" :max-fraction-digits="3" />
        </label>
      </div>
    </div>

    <div v-if="snapshot" class="roi-grid">
      <div class="kpi">
        <div class="label">CA gagné suivi</div>
        <div class="value">{{ xpf(snapshot.directRoi.wonValueXpf) }}</div>
      </div>
      <div class="kpi">
        <div class="label">Coûts directs suivis</div>
        <div class="value">{{ snapshot.directRoi.costsConfigured ? xpf(snapshot.directRoi.trackedDirectCostXpf) : 'À configurer' }}</div>
      </div>
      <div class="kpi">
        <div class="label">Contribution après coûts suivis</div>
        <div class="value">{{ snapshot.directRoi.costsConfigured ? xpf(snapshot.directRoi.contributionAfterTrackedCostsXpf) : '—' }}</div>
      </div>
      <div class="kpi">
        <div class="label">ROI direct suivi</div>
        <div class="value">{{ pct(snapshot.directRoi.roi) }}</div>
      </div>
    </div>

    <div class="card" v-if="snapshot">
      <div class="volume-grid">
        <div><span class="muted">Recherches</span><strong>{{ snapshot.directRoi.searchRequests }}</strong><span>{{ xpf(snapshot.directRoi.searchCostXpf) }}</span></div>
        <div><span class="muted">Emails envoyés</span><strong>{{ snapshot.directRoi.sentEmails }}</strong><span>{{ xpf(snapshot.directRoi.emailCostXpf) }}</span></div>
        <div><span class="muted">Générations IA</span><strong>{{ snapshot.directRoi.aiGenerations }}</strong><span>{{ xpf(snapshot.directRoi.aiCostXpf) }}</span></div>
      </div>
      <p class="muted" style="margin-bottom: 0">{{ snapshot.directRoi.note }}</p>
    </div>
  </div>
</template>

<style scoped>
.two-cols { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
.cost-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; }
.roi-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1rem; }
.volume-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; }
.volume-grid div { display: flex; flex-direction: column; gap: 0.3rem; }
.volume-grid strong { font-size: 1.2rem; }
@media (max-width: 900px) { .two-cols, .cost-grid, .roi-grid, .volume-grid { grid-template-columns: 1fr; } }
</style>
