<script setup lang="ts">
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Select from 'primevue/select'
import MultiSelect from 'primevue/multiselect'
import InputNumber from 'primevue/inputnumber'
import Dialog from 'primevue/dialog'
import SelectButton from 'primevue/selectbutton'
import type {
  PrepareCampaignResult,
  Prospect,
  ProspectListSummary,
  Sender,
} from '~/types/mailer'
import { CAMPAIGN_EMAIL_TYPES, CAMPAIGN_TONES } from '~/constants/campaign'

const { api } = useApi()
const toast = useToast()
const router = useRouter()

const prospects = ref<Prospect[]>([])
const lists = ref<ProspectListSummary[]>([])
const senders = ref<Sender[]>([])
const saving = ref(false)
const preparing = ref(false)
const prepareVisible = ref(false)

type StepForm = { name: string; brief: string; delayDays: number }

const form = reactive({
  name: '',
  brief: '',
  tone: 'professionnel',
  emailType: 'classique',
  language: 'fr',
  senderId: null as string | null,
  prospectIds: [] as string[],
  listIds: [] as string[],
  targetMode: 'lists' as 'all' | 'lists' | 'manual',
  steps: [
    { name: 'Email 1', brief: '', delayDays: 0 },
  ] as StepForm[],
})

const prepareForm = reactive({
  goal: '',
  productUrl: '',
  stepCount: null as number | null,
})

const defaultCampaignName = ref('')

const tones = [...CAMPAIGN_TONES]
const emailTypes = [...CAMPAIGN_EMAIL_TYPES]

const stepCountOptions = [
  { label: 'Auto', value: null },
  { label: '3', value: 3 },
  { label: '4', value: 4 },
  { label: '5', value: 5 },
]

const targetModes = [
  { label: 'Listes', value: 'lists' },
  { label: 'Sélection manuelle', value: 'manual' },
  { label: 'Tous les actifs', value: 'all' },
]

onMounted(async () => {
  ;[prospects.value, lists.value, senders.value] = await Promise.all([
    api<Prospect[]>('prospects', { query: { unsubscribed: 'false' } }),
    api<ProspectListSummary[]>('lists'),
    api<Sender[]>('senders'),
  ])
  const def = senders.value.find((s) => s.isDefault) || senders.value[0]
  if (def) form.senderId = def.id
  defaultCampaignName.value = `Campagne ${new Date().toLocaleDateString('fr-FR')}`
  form.name = defaultCampaignName.value
  if (lists.value.length) form.targetMode = 'lists'
  else form.targetMode = 'all'
})

function addStep() {
  form.steps.push({
    name: `Email ${form.steps.length + 1}`,
    brief: '',
    delayDays: form.steps.length === 0 ? 0 : 3,
  })
}

function removeStep(index: number) {
  if (form.steps.length <= 1) return
  form.steps.splice(index, 1)
  form.steps.forEach((s, i) => {
    if (!s.name || /^Email \d+$/.test(s.name)) s.name = `Email ${i + 1}`
    if (i === 0) s.delayDays = 0
  })
}

function openPrepare() {
  prepareForm.goal = form.brief || form.steps[0]?.brief || ''
  prepareForm.productUrl = ''
  prepareForm.stepCount = null
  prepareVisible.value = true
}

async function runPrepare() {
  const goal = prepareForm.goal.trim()
  if (!goal) {
    toast.add({
      severity: 'warn',
      summary: 'Brief requis',
      detail: 'Décrivez l’objectif de la campagne',
      life: 3000,
    })
    return
  }
  preparing.value = true
  try {
    const body: Record<string, unknown> = {
      goal,
      tone: form.tone,
      emailType: form.emailType,
      language: form.language,
    }
    const url = prepareForm.productUrl.trim()
    if (url) body.productUrl = url
    if (prepareForm.stepCount != null) body.stepCount = prepareForm.stepCount

    const result = await api<PrepareCampaignResult>('campaigns/prepare', {
      method: 'POST',
      body,
    })

    form.steps = result.steps.map((s, i) => ({
      name: s.name || `Email ${i + 1}`,
      brief: s.brief,
      delayDays: i === 0 ? 0 : Number(s.delayDays) || 3,
    }))
    form.brief = result.steps[0]?.brief || goal
    if (
      !form.name.trim() ||
      form.name === defaultCampaignName.value ||
      /^Campagne \d/.test(form.name)
    ) {
      form.name = result.name
    }

    prepareVisible.value = false
    toast.add({
      severity: result.warning ? 'warn' : 'success',
      summary: 'Séquence préparée',
      detail:
        result.warning ||
        `${result.steps.length} étape(s) prêtes à relire`,
      life: 5000,
    })
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'Préparation',
      detail: e instanceof Error ? e.message : String(e),
      life: 5000,
    })
  } finally {
    preparing.value = false
  }
}

async function create() {
  const steps = form.steps.map((s, i) => ({
    name: s.name.trim() || `Email ${i + 1}`,
    brief: (s.brief || form.brief).trim(),
    delayDays: i === 0 ? 0 : Number(s.delayDays) || 0,
  }))

  const primaryBrief = steps[0]?.brief || form.brief.trim()
  if (!form.name.trim() || !primaryBrief) {
    toast.add({
      severity: 'warn',
      summary: 'Brief requis',
      detail: 'Nom et brief de la 1ʳᵉ étape obligatoires',
      life: 3000,
    })
    return
  }
  for (const s of steps) {
    if (!s.brief) {
      toast.add({
        severity: 'warn',
        summary: 'Étape incomplète',
        detail: `Brief manquant pour « ${s.name} »`,
        life: 3000,
      })
      return
    }
  }

  saving.value = true
  try {
    const body: Record<string, unknown> = {
      name: form.name.trim(),
      brief: primaryBrief,
      tone: form.tone,
      emailType: form.emailType,
      language: form.language,
      senderId: form.senderId || undefined,
      steps,
    }
    if (form.targetMode === 'lists') {
      body.listIds = form.listIds
      if (!form.listIds.length) {
        toast.add({
          severity: 'warn',
          summary: 'Listes requises',
          detail: 'Choisissez au moins une liste, ou passez en « Tous »',
          life: 3000,
        })
        saving.value = false
        return
      }
    } else if (form.targetMode === 'manual') {
      body.prospectIds = form.prospectIds
      if (!form.prospectIds.length) {
        toast.add({
          severity: 'warn',
          summary: 'Prospects requis',
          life: 3000,
        })
        saving.value = false
        return
      }
    }
    // all → neither listIds nor prospectIds → backend uses all active

    const campaign = await api<{ id: string }>('campaigns', {
      method: 'POST',
      body,
    })
    toast.add({ severity: 'success', summary: 'Campagne créée', life: 2500 })
    router.push(`/campaigns/${campaign.id}`)
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'Erreur',
      detail: e instanceof Error ? e.message : String(e),
      life: 4000,
    })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1>Nouvelle campagne</h1>
        <p>Séquence d’emails : étape 1, puis relances après N jours</p>
      </div>
      <NuxtLink to="/campaigns"><Button label="Retour" text /></NuxtLink>
    </div>

    <div class="card stack">
      <div class="form-grid">
        <div>
          <label class="field-label">Nom de la campagne</label>
          <InputText v-model="form.name" style="width: 100%" />
        </div>
        <div>
          <label class="field-label">Expéditeur</label>
          <Select
            v-model="form.senderId"
            :options="senders"
            option-label="name"
            option-value="id"
            placeholder="Choisir…"
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
              <span v-else class="muted">Choisir…</span>
            </template>
          </Select>
        </div>
        <div>
          <label class="field-label">Ton</label>
          <Select v-model="form.tone" :options="tones" option-label="label" option-value="value" style="width: 100%" />
        </div>
        <div>
          <label class="field-label">Type d’email</label>
          <Select v-model="form.emailType" :options="emailTypes" option-label="label" option-value="value" style="width: 100%" />
        </div>
      </div>

      <div>
        <label class="field-label">Cible</label>
        <Select
          v-model="form.targetMode"
          :options="targetModes"
          option-label="label"
          option-value="value"
          style="width: 100%; max-width: 320px"
        />
      </div>

      <div v-if="form.targetMode === 'lists'">
        <label class="field-label">Listes de prospects</label>
        <MultiSelect
          v-model="form.listIds"
          :options="lists"
          option-label="name"
          option-value="id"
          filter
          display="chip"
          placeholder="Choisir une ou plusieurs listes…"
          style="width: 100%"
        >
          <template #option="{ option }">
            {{ option.name }} ({{ option.prospectCount }})
          </template>
        </MultiSelect>
      </div>

      <div v-if="form.targetMode === 'manual'">
        <label class="field-label">Sélection de prospects</label>
        <MultiSelect
          v-model="form.prospectIds"
          :options="prospects"
          option-label="company"
          option-value="id"
          filter
          display="chip"
          placeholder="Choisir…"
          style="width: 100%"
        />
      </div>

      <div class="stack">
        <div class="row" style="justify-content: space-between; flex-wrap: wrap">
          <strong>Séquence d’emails</strong>
          <div class="row">
            <Button
              label="Préparer avec l’IA"
              icon="pi pi-sparkles"
              size="small"
              severity="secondary"
              @click="openPrepare"
            />
            <Button label="Ajouter une étape" icon="pi pi-plus" size="small" text @click="addStep" />
          </div>
        </div>

        <div
          v-for="(step, index) in form.steps"
          :key="index"
          class="card"
          style="padding: 1rem; border: 1px solid var(--mailer-border)"
        >
          <div class="row" style="justify-content: space-between; margin-bottom: 0.75rem">
            <div class="row" style="flex: 1; gap: 0.75rem; flex-wrap: wrap">
              <div style="min-width: 140px; flex: 1">
                <label class="field-label">Nom</label>
                <InputText v-model="step.name" style="width: 100%" />
              </div>
              <div v-if="index > 0" style="width: 140px">
                <label class="field-label">Délai (jours)</label>
                <InputNumber v-model="step.delayDays" :min="0" :max="90" style="width: 100%" />
              </div>
              <div v-else class="muted" style="align-self: end; padding-bottom: 0.5rem">
                Envoyé immédiatement
              </div>
            </div>
            <Button
              v-if="form.steps.length > 1"
              icon="pi pi-trash"
              text
              rounded
              severity="danger"
              @click="removeStep(index)"
            />
          </div>
          <div>
            <label class="field-label">Brief de cet email</label>
            <Textarea
              v-model="step.brief"
              rows="4"
              style="width: 100%"
              :placeholder="index === 0
                ? 'Ex: Présentation de l’offre, accroche locale…'
                : 'Ex: Relance polie, rappel de la valeur, nouveau CTA…'"
            />
          </div>
        </div>
      </div>

      <div class="row" style="justify-content: flex-end">
        <Button label="Créer la campagne" icon="pi pi-check" :loading="saving" @click="create" />
      </div>
    </div>

    <Dialog
      v-model:visible="prepareVisible"
      header="Préparer la campagne avec l’IA"
      modal
      style="width: min(560px, 95vw)"
    >
      <div class="stack">
        <p class="muted" style="margin: 0">
          L’IA analyse le produit (si un lien est fourni) et rédige les briefs de chaque email.
          Vous pourrez les modifier avant de créer la campagne.
        </p>
        <div>
          <label class="field-label">Brief général</label>
          <Textarea
            v-model="prepareForm.goal"
            rows="4"
            style="width: 100%"
            placeholder="Ex. Proposer notre outil de réservation en ligne aux spas et instituts de Tahiti…"
          />
        </div>
        <div>
          <label class="field-label">Lien du produit (optionnel)</label>
          <InputText
            v-model="prepareForm.productUrl"
            style="width: 100%"
            placeholder="https://…"
          />
        </div>
        <div>
          <label class="field-label">Nombre d’emails</label>
          <SelectButton
            v-model="prepareForm.stepCount"
            :options="stepCountOptions"
            option-label="label"
            option-value="value"
            :allow-empty="false"
          />
        </div>
      </div>
      <template #footer>
        <Button label="Annuler" text @click="prepareVisible = false" />
        <Button
          label="Préparer"
          icon="pi pi-sparkles"
          :loading="preparing"
          @click="runPrepare"
        />
      </template>
    </Dialog>
  </div>
</template>
