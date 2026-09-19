<script setup lang="ts">
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Dialog from 'primevue/dialog'
import Checkbox from 'primevue/checkbox'
import type { CampaignDetail, Draft, Sender } from '~/types/mailer'
import { CAMPAIGN_EMAIL_TYPES, CAMPAIGN_TONES } from '~/constants/campaign'

const route = useRoute()
const { api } = useApi()
const toast = useToast()
const confirm = useConfirm()

const id = computed(() => String(route.params.id))
const campaign = ref<CampaignDetail | null>(null)
const senders = ref<Sender[]>([])
const loading = ref(true)
const generating = ref(false)
const sending = ref(false)
const approving = ref(false)
const editDraft = ref<Draft | null>(null)
const draftDialog = ref(false)
const editForm = reactive({ subject: '', html: '', text: '' })
const activeStepId = ref<string | null>(null)

const tones = [...CAMPAIGN_TONES]
const emailTypes = [...CAMPAIGN_EMAIL_TYPES]

const sortedSteps = computed(() =>
  [...(campaign.value?.steps || [])].sort((a, b) => a.position - b.position),
)

const filteredDrafts = computed(() => {
  const drafts = campaign.value?.drafts || []
  if (!activeStepId.value) return drafts
  return drafts.filter((d) => d.stepId === activeStepId.value)
})

async function load() {
  loading.value = true
  try {
    ;[campaign.value, senders.value] = await Promise.all([
      api<CampaignDetail>(`campaigns/${id.value}`),
      api<Sender[]>('senders'),
    ])
    if (campaign.value && !campaign.value.emailType) {
      campaign.value.emailType = 'classique'
    }
    if (campaign.value && campaign.value.autopilotEnabled == null) {
      campaign.value.autopilotEnabled = false
    }
    if (!activeStepId.value && sortedSteps.value.length) {
      activeStepId.value = sortedSteps.value[0].id
    }
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

async function saveMeta() {
  if (!campaign.value) return
  try {
    await api(`campaigns/${id.value}`, {
      method: 'PATCH',
      body: {
        name: campaign.value.name,
        brief: campaign.value.brief,
        tone: campaign.value.tone,
        emailType: campaign.value.emailType || 'classique',
        senderId: campaign.value.senderId,
        autopilotEnabled: campaign.value.autopilotEnabled === true,
      },
    })
    toast.add({ severity: 'success', summary: 'Campagne enregistrée', life: 2000 })
    await load()
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'Erreur',
      detail: e instanceof Error ? e.message : String(e),
      life: 4000,
    })
  }
}

async function generate() {
  generating.value = true
  try {
    await saveMeta()
    const res = await api<{ results: Array<{ ok: boolean }> }>(
      `campaigns/${id.value}/generate`,
      { method: 'POST' },
    )
    const ok = res.results.filter((r) => r.ok).length
    toast.add({
      severity: 'success',
      summary: 'Génération terminée',
      detail: `${ok}/${res.results.length} brouillons à relire puis approuver`,
      life: 4000,
    })
    await load()
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'Génération',
      detail: e instanceof Error ? e.message : String(e),
      life: 6000,
    })
    await load()
  } finally {
    generating.value = false
  }
}

function openDraft(d: Draft) {
  editDraft.value = d
  editForm.subject = d.subject || ''
  editForm.html = d.html || ''
  editForm.text = d.text || ''
  draftDialog.value = true
}

async function saveDraft() {
  if (!editDraft.value) return
  await api(`drafts/${editDraft.value.id}`, {
    method: 'PATCH',
    body: {
      subject: editForm.subject,
      html: editForm.html,
      text: editForm.text,
      status: 'ready',
    },
  })
  draftDialog.value = false
  editDraft.value = null
  await load()
  toast.add({
    severity: 'success',
    summary: 'Brouillon mis à jour',
    detail: 'Une modification remet le brouillon en attente d’approbation.',
    life: 3000,
  })
}

async function approveDraft(d: Draft) {
  await api(`drafts/${d.id}`, {
    method: 'PATCH',
    body: { status: 'approved' },
  })
  await load()
}

async function approveVisible() {
  const ready = filteredDrafts.value.filter((d) => d.status === 'ready')
  if (!ready.length) return
  approving.value = true
  try {
    for (const draft of ready) {
      await api(`drafts/${draft.id}`, {
        method: 'PATCH',
        body: { status: 'approved' },
      })
    }
    await load()
    toast.add({
      severity: 'success',
      summary: 'Brouillons approuvés',
      detail: `${ready.length} brouillon(s) autorisé(s) à l’envoi`,
      life: 3000,
    })
  } finally {
    approving.value = false
  }
}

async function skipDraft(d: Draft) {
  await api(`drafts/${d.id}`, {
    method: 'PATCH',
    body: { status: 'skipped' },
  })
  await load()
}

function startSend() {
  if (!draftStats.value.allReviewed || draftStats.value.approvedAll === 0) {
    toast.add({
      severity: 'warn',
      summary: 'Validation requise',
      detail: 'Chaque brouillon doit être approuvé ou ignoré avant le lancement.',
      life: 4000,
    })
    return
  }

  const stepCount = sortedSteps.value.length
  confirm.require({
    message:
      stepCount > 1
        ? `Lancer la séquence (${stepCount} emails) ? Seuls les brouillons explicitement approuvés pourront partir.`
        : 'Lancer l’envoi des brouillons approuvés ? Les emails seront espacés avec tracking ouvertures/clics.',
    header: 'Confirmer l’envoi',
    icon: 'pi pi-send',
    acceptLabel: 'Envoyer',
    rejectLabel: 'Annuler',
    accept: async () => {
      sending.value = true
      try {
        await saveMeta()
        await api(`campaigns/${id.value}/send`, { method: 'POST' })
        toast.add({
          severity: 'success',
          summary: 'Séquence démarrée',
          detail: 'La file n’enverra que les brouillons approuvés.',
          life: 4000,
        })
        await load()
        pollWhileSending()
      } catch (e) {
        toast.add({
          severity: 'error',
          summary: 'Envoi',
          detail: e instanceof Error ? e.message : String(e),
          life: 5000,
        })
      } finally {
        sending.value = false
      }
    },
  })
}

let pollTimer: ReturnType<typeof setInterval> | null = null
function pollWhileSending() {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = setInterval(async () => {
    await load()
    if (
      campaign.value?.status !== 'sending' &&
      campaign.value?.status !== 'waiting'
    ) {
      if (pollTimer) clearInterval(pollTimer)
      pollTimer = null
    }
  }, 4000)
}

onMounted(load)
onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
})

function statusSeverity(s: string) {
  const map: Record<string, string> = {
    draft: 'secondary',
    generating: 'info',
    review: 'warn',
    sending: 'info',
    waiting: 'warn',
    sent: 'success',
    failed: 'danger',
    ready: 'warn',
    approved: 'success',
    pending: 'secondary',
    error: 'danger',
    skipped: 'secondary',
    queued: 'info',
  }
  return map[s] || 'secondary'
}

const draftStats = computed(() => {
  const current = filteredDrafts.value
  const all = campaign.value?.drafts || []
  const approvedAll = all.filter((d) => d.status === 'approved').length
  const reviewedAll = all.filter(
    (d) => d.status === 'approved' || d.status === 'skipped',
  ).length
  return {
    total: current.length,
    ready: current.filter((d) => d.status === 'ready').length,
    approved: current.filter((d) => d.status === 'approved').length,
    errors: current.filter((d) => d.status === 'error').length,
    approvedAll,
    reviewedAll,
    totalAll: all.length,
    allReviewed: all.length > 0 && reviewedAll === all.length,
  }
})

const sendStats = computed(() => {
  const sends = campaign.value?.sends || []
  const sent = sends.filter((s) => s.status === 'sent')
  const opened = sent.filter((s) => s.openCount > 0)
  const clicked = sent.filter((s) => s.clickCount > 0)
  return {
    total: sends.length,
    sent: sent.length,
    failed: sends.filter((s) => s.status === 'failed').length,
    opened: opened.length,
    clicked: clicked.length,
  }
})

const waitingLabel = computed(() => {
  if (campaign.value?.status !== 'waiting' || !campaign.value.nextStepAt) return null
  const step = sortedSteps.value[campaign.value.currentStepIndex]
  const when = new Date(campaign.value.nextStepAt).toLocaleString('fr-FR')
  return `Prochaine étape${step ? ` « ${step.name} »` : ''} prévue le ${when}`
})
</script>

<template>
  <div class="page" v-if="campaign">
    <div class="page-header">
      <div>
        <div class="row" style="gap: 0.5rem; margin-bottom: 0.35rem">
          <NuxtLink to="/campaigns" class="muted">Campagnes</NuxtLink>
          <span class="muted">/</span>
          <Tag :value="campaign.status" :severity="statusSeverity(campaign.status)" />
        </div>
        <h1>{{ campaign.name }}</h1>
        <p>
          {{ draftStats.approvedAll }}/{{ draftStats.totalAll }} approuvés
          <span v-if="draftStats.totalAll"> · {{ draftStats.reviewedAll }}/{{ draftStats.totalAll }} relus</span>
          <span v-if="sortedSteps.length > 1"> · {{ sortedSteps.length }} étapes</span>
          <span v-if="sendStats.sent">
            · {{ sendStats.sent }} envoyés · {{ sendStats.opened }} ouverts · {{ sendStats.clicked }} clics
          </span>
        </p>
        <p v-if="waitingLabel" class="muted" style="margin-top: 0.25rem">{{ waitingLabel }}</p>
      </div>
      <div class="row">
        <Button label="Enregistrer" text icon="pi pi-save" @click="saveMeta" />
        <Button
          label="Générer les emails"
          icon="pi pi-sparkles"
          severity="secondary"
          :loading="generating"
          @click="generate"
        />
        <Button
          label="Lancer la séquence"
          icon="pi pi-send"
          :loading="sending"
          :disabled="!draftStats.allReviewed || draftStats.approvedAll === 0"
          @click="startSend"
        />
      </div>
    </div>

    <div class="card stack">
      <div class="form-grid">
        <div>
          <label class="field-label">Nom</label>
          <InputText v-model="campaign.name" style="width: 100%" />
        </div>
        <div>
          <label class="field-label">Expéditeur</label>
          <Select
            v-model="campaign.senderId"
            :options="senders"
            option-label="name"
            option-value="id"
            style="width: 100%"
          >
            <template #option="{ option }">
              {{ option.name }} &lt;{{ option.email }}&gt;
            </template>
            <template #value="{ value }">
              <span v-if="value">
                {{ senders.find((s) => s.id === value)?.name }}
                &lt;{{ senders.find((s) => s.id === value)?.email }}&gt;
              </span>
            </template>
          </Select>
        </div>
        <div>
          <label class="field-label">Ton</label>
          <Select
            v-model="campaign.tone"
            :options="tones"
            option-label="label"
            option-value="value"
            style="width: 100%"
          />
        </div>
        <div>
          <label class="field-label">Type d’email</label>
          <Select
            v-model="campaign.emailType"
            :options="emailTypes"
            option-label="label"
            option-value="value"
            style="width: 100%"
          />
        </div>
      </div>
      <div class="autopilot-control">
        <label class="row" style="gap: 0.65rem; align-items: flex-start">
          <Checkbox v-model="campaign.autopilotEnabled" binary input-id="campaign-autopilot" />
          <span>
            <strong>Autoriser l’Autopilot pour cette campagne</strong>
            <span class="muted" style="display: block; margin-top: 0.2rem">
              Désactivé par défaut. S’il est activé, Aurel peut approuver et envoyer automatiquement les brouillons admissibles selon les garde-fous commerciaux.
            </span>
          </span>
        </label>
      </div>
      <div>
        <label class="field-label">Brief (étape 1 / global)</label>
        <Textarea v-model="campaign.brief" rows="4" style="width: 100%" />
      </div>

      <div v-if="sortedSteps.length" class="stack" style="gap: 0.5rem">
        <label class="field-label">Étapes de la séquence</label>
        <div
          v-for="step in sortedSteps"
          :key="step.id"
          class="muted"
          style="font-size: 0.9rem"
        >
          <strong>{{ step.position + 1 }}. {{ step.name }}</strong>
          <span v-if="step.position > 0"> · +{{ step.delayDays }} j</span>
          — {{ step.brief.slice(0, 120) }}{{ step.brief.length > 120 ? '…' : '' }}
        </div>
      </div>
    </div>

    <div class="card" style="padding: 0; overflow: hidden">
      <div
        style="padding: 1rem 1.25rem; border-bottom: 1px solid var(--mailer-border)"
        class="row"
      >
        <strong style="margin-right: auto">Brouillons</strong>
        <Button
          v-if="draftStats.ready > 0"
          label="Approuver l’étape"
          icon="pi pi-check-circle"
          size="small"
          severity="success"
          :loading="approving"
          @click="approveVisible"
        />
        <div v-if="sortedSteps.length > 1" class="row" style="gap: 0.35rem; flex-wrap: wrap">
          <Button
            v-for="step in sortedSteps"
            :key="step.id"
            :label="step.name"
            size="small"
            :severity="activeStepId === step.id ? undefined : 'secondary'"
            :outlined="activeStepId !== step.id"
            @click="activeStepId = step.id"
          />
        </div>
      </div>
      <DataTable :value="filteredDrafts" :loading="loading" size="small" striped-rows>
        <Column header="Prospect">
          <template #body="{ data }">
            {{ data.prospect?.company || data.prospectId }}
          </template>
        </Column>
        <Column field="subject" header="Objet" />
        <Column field="status" header="Statut">
          <template #body="{ data }">
            <Tag :value="data.status" :severity="statusSeverity(data.status)" />
            <div v-if="data.error" class="muted" style="font-size: 0.75rem">{{ data.error }}</div>
          </template>
        </Column>
        <Column header="" style="width: 12rem">
          <template #body="{ data }">
            <div class="row">
              <Button icon="pi pi-eye" text rounded v-tooltip.top="'Relire / éditer'" @click="openDraft(data)" />
              <Button
                v-if="data.status === 'ready'"
                icon="pi pi-check"
                text
                rounded
                severity="success"
                v-tooltip.top="'Approuver pour l’envoi'"
                @click="approveDraft(data)"
              />
              <Button
                icon="pi pi-ban"
                text
                rounded
                severity="secondary"
                v-tooltip.top="'Ignorer'"
                @click="skipDraft(data)"
              />
            </div>
          </template>
        </Column>
      </DataTable>
    </div>

    <div v-if="campaign.sends?.length" class="card" style="padding: 0; overflow: hidden">
      <div style="padding: 1rem 1.25rem; border-bottom: 1px solid var(--mailer-border)">
        <strong>Envois & tracking</strong>
      </div>
      <DataTable :value="campaign.sends" size="small" striped-rows>
        <Column header="Prospect">
          <template #body="{ data }">
            {{ data.prospect?.company || '—' }}
          </template>
        </Column>
        <Column field="toEmail" header="Email" />
        <Column field="status" header="Statut">
          <template #body="{ data }">
            <Tag :value="data.status" :severity="statusSeverity(data.status)" />
            <div v-if="data.error" class="muted" style="font-size: 0.75rem">{{ data.error }}</div>
          </template>
        </Column>
        <Column header="Ouvertures">
          <template #body="{ data }">
            {{ data.openCount }}
            <span v-if="data.lastOpenedAt" class="muted" style="font-size: 0.75rem">
              · {{ new Date(data.lastOpenedAt).toLocaleString('fr-FR') }}
            </span>
          </template>
        </Column>
        <Column field="clickCount" header="Clics" />
        <Column header="Envoyé">
          <template #body="{ data }">
            {{ data.sentAt ? new Date(data.sentAt).toLocaleString('fr-FR') : '—' }}
          </template>
        </Column>
      </DataTable>
    </div>

    <Dialog
      v-model:visible="draftDialog"
      modal
      header="Éditer le brouillon"
      style="width: min(720px, 96vw)"
      :dismissable-mask="true"
    >
      <div class="stack" v-if="editDraft">
        <div>
          <label class="field-label">Objet</label>
          <InputText v-model="editForm.subject" style="width: 100%" />
        </div>
        <div>
          <label class="field-label">HTML</label>
          <Textarea v-model="editForm.html" rows="10" style="width: 100%; font-family: ui-monospace, monospace; font-size: 0.85rem" />
        </div>
        <div>
          <label class="field-label">Aperçu</label>
          <div class="preview-html" v-html="editForm.html" />
        </div>
        <div>
          <label class="field-label">Texte brut</label>
          <Textarea v-model="editForm.text" rows="4" style="width: 100%" />
        </div>
      </div>
      <template #footer>
        <Button label="Fermer" text @click="draftDialog = false" />
        <Button label="Enregistrer et revalider" @click="saveDraft" />
      </template>
    </Dialog>
  </div>
  <div v-else-if="loading" class="page muted">Chargement…</div>
</template>
