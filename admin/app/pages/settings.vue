<script setup lang="ts">
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Password from 'primevue/password'
import Tag from 'primevue/tag'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Dialog from 'primevue/dialog'
import Checkbox from 'primevue/checkbox'
import ProviderLogos from '~/components/ProviderLogos.vue'
import type { Sender, SettingsPublic } from '~/types/mailer'

const { api } = useApi()
const toast = useToast()
const confirm = useConfirm()

const settings = ref<SettingsPublic | null>(null)
const senders = ref<Sender[]>([])
const saving = ref(false)

const form = reactive({
  publicUrl: '',
  sendDelayMs: 30000,
  openaiModel: 'gpt-4o-mini',
  mailProvider: 'auto' as string,
  smtpHost: '',
  smtpPort: 587,
  smtpSecure: false,
  mailFrom: '',
  mailFromName: '',
  mailgunDomain: '',
  openaiApiKey: '',
  resendApiKey: '',
  resendWebhookSecret: '',
  resendInboundAddress: '',
  replyForwardTo: '',
  brevoApiKey: '',
  sendgridApiKey: '',
  mailjetApiKey: '',
  mailjetSecretKey: '',
  mailgunApiKey: '',
  smtpUser: '',
  smtpPass: '',
  tavilyApiKey: '',
  youApiKey: '',
  nimbleApiKey: '',
  firecrawlApiKey: '',
  serpapiApiKey: '',
  exaApiKey: '',
})

const senderDialog = ref(false)
const senderForm = reactive({
  id: null as string | null,
  name: '',
  email: '',
  replyTo: '',
  isDefault: false,
})

const tierSecrets = [
  { key: 'resendApiKey' as const, label: 'Resend', hint: '~3k / mois', providerId: 'resend' },
  { key: 'brevoApiKey' as const, label: 'Brevo', hint: '~300 / jour', providerId: 'brevo' },
  { key: 'sendgridApiKey' as const, label: 'SendGrid', hint: '~100 / jour', providerId: 'sendgrid' },
  { key: 'mailjetApiKey' as const, label: 'Mailjet API Key', hint: '~200 / jour', providerId: 'mailjet' },
  { key: 'mailjetSecretKey' as const, label: 'Mailjet Secret Key', hint: 'Pair avec API Key', providerId: 'mailjet' },
  { key: 'mailgunApiKey' as const, label: 'Mailgun API Key', hint: '+ domaine ci-dessous', providerId: 'mailgun' },
]

const smtpSecrets = [
  { key: 'smtpUser' as const, label: 'SMTP user', hint: 'Identifiant hébergeur' },
  { key: 'smtpPass' as const, label: 'SMTP password', hint: 'Mot de passe SMTP' },
]

/** All email secret fields (for save / clear loops) */
const emailSecrets = [
  ...tierSecrets,
  ...smtpSecrets,
  { key: 'resendWebhookSecret' as const, label: 'Webhook Resend', hint: 'whsec_…' },
]

const TIER_IDS = new Set(['resend', 'brevo', 'sendgrid', 'mailjet', 'mailgun'])

const searchSecrets = [
  { key: 'tavilyApiKey' as const, label: 'Tavily', hint: 'Recherche web', providerId: 'tavily' },
  { key: 'youApiKey' as const, label: 'You.com', hint: '~100 recherches / jour', providerId: 'you' },
  { key: 'nimbleApiKey' as const, label: 'Nimble', hint: '~5K requêtes free', providerId: 'nimble' },
  { key: 'firecrawlApiKey' as const, label: 'Firecrawl', hint: 'Search + scrape', providerId: 'firecrawl' },
  { key: 'serpapiApiKey' as const, label: 'SerpAPI', hint: '~250 / mois', providerId: 'serpapi' },
  { key: 'exaApiKey' as const, label: 'Exa', hint: '~10$ crédits / mois', providerId: 'exa' },
]

function mapProviderLogos(ids: string[]) {
  return (settings.value?.mailProviders || [])
    .filter((p) => ids.includes(p.id))
    .map((p) => ({
      id: p.id,
      label: p.label,
      docsUrl: p.docsUrl || null,
      configured: p.configured,
      active: p.id === form.mailProvider,
      hint: `${p.hint} · ${p.freeTierHint}`,
    }))
}

const tierLogoItems = computed(() => mapProviderLogos([...TIER_IDS]))
const smtpLogoItems = computed(() => mapProviderLogos(['smtp']))
const consoleLogoItems = computed(() => mapProviderLogos(['console']))

const activeProviderLabel = computed(() => {
  const p = settings.value?.mailProviders?.find((x) => x.id === form.mailProvider)
  return p?.label || form.mailProvider
})

const activeProviderCategory = computed(() => {
  if (form.mailProvider === 'auto') return 'auto'
  if (TIER_IDS.has(form.mailProvider)) return 'tier'
  if (form.mailProvider === 'smtp') return 'smtp'
  if (form.mailProvider === 'console') return 'console'
  return 'other'
})

function usageTag(kind: 'mail' | 'search', id: string) {
  const items =
    kind === 'mail' ? settings.value?.usage?.mail.items : settings.value?.usage?.search.items
  const item = items?.find((i) => i.id === id)
  if (!item || !item.configured) return null
  if (item.period === 'unlimited') return `${item.label} ∞`
  const suffix = item.period === 'daily' ? 'j' : item.period === 'monthly' ? 'm' : ''
  return `${item.label} ${item.used}/${item.limit ?? '—'}${suffix ? ` ${suffix}` : ''}`
}

const mailUsageTags = computed(() => {
  const items = settings.value?.usage?.mail.items || []
  return items
    .filter((i) => i.configured && i.id !== 'console')
    .map((i) => usageTag('mail', i.id))
    .filter(Boolean) as string[]
})

const searchUsageTags = computed(() => {
  const items = settings.value?.usage?.search.items || []
  return items
    .filter((i) => i.configured)
    .map((i) => usageTag('search', i.id))
    .filter(Boolean) as string[]
})

const searchLogoItems = computed(() =>
  (settings.value?.providers || []).map((p) => ({
    id: p.id,
    label: p.label,
    docsUrl: p.docsUrl,
    configured: p.configured,
    hint: p.freeTierHint,
  })),
)

const openaiLogoItems = [
  {
    id: 'openai',
    label: 'OpenAI',
    docsUrl: 'https://platform.openai.com',
    configured: true,
    hint: 'platform.openai.com',
  },
]

function selectMailProvider(id: string) {
  form.mailProvider = id
}

function updateSecret(key: string, value: string | null | undefined) {
  ;(form as Record<string, unknown>)[key] = value ?? ''
}

function providerDocs(providerId: string) {
  return (
    settings.value?.mailProviders?.find((p) => p.id === providerId)?.docsUrl ||
    settings.value?.providers?.find((p) => p.id === providerId)?.docsUrl ||
    (providerId === 'openai' ? 'https://platform.openai.com' : undefined)
  )
}

async function load() {
  ;[settings.value, senders.value] = await Promise.all([
    api<SettingsPublic>('settings'),
    api<Sender[]>('senders'),
  ])
  if (settings.value) {
    form.publicUrl = settings.value.publicUrl
    form.sendDelayMs = settings.value.sendDelayMs
    form.openaiModel = settings.value.openaiModel || 'gpt-4o-mini'
    form.mailProvider = settings.value.mailProvider || 'auto'
    form.smtpHost = settings.value.smtpHost || ''
    form.smtpPort = settings.value.smtpPort || 587
    form.smtpSecure = settings.value.smtpSecure || false
    form.mailFrom = settings.value.mailFrom || ''
    form.mailFromName = settings.value.mailFromName || ''
    form.mailgunDomain = settings.value.mailgunDomain || ''
    form.resendInboundAddress = settings.value.resendInboundAddress || ''
    form.replyForwardTo = settings.value.replyForwardTo || ''
  }
}

async function save() {
  saving.value = true
  try {
    const body: Record<string, string | number | boolean | null> = {
      publicUrl: form.publicUrl,
      sendDelayMs: form.sendDelayMs,
      openaiModel: form.openaiModel,
      mailProvider: form.mailProvider,
      smtpHost: form.smtpHost || null,
      smtpPort: form.smtpPort,
      smtpSecure: form.smtpSecure,
      mailFrom: form.mailFrom || null,
      mailFromName: form.mailFromName || null,
      mailgunDomain: form.mailgunDomain || null,
      resendInboundAddress: form.resendInboundAddress || null,
      replyForwardTo: form.replyForwardTo || null,
    }
    if (form.openaiApiKey.trim()) body.openaiApiKey = form.openaiApiKey.trim()
    for (const { key } of emailSecrets) {
      if (form[key]?.trim()) body[key] = form[key].trim()
    }
    for (const { key } of searchSecrets) {
      if (form[key]?.trim()) body[key] = form[key].trim()
    }
    settings.value = await api<SettingsPublic>('settings', {
      method: 'PUT',
      body,
    })
    form.openaiApiKey = ''
    for (const { key } of emailSecrets) form[key] = ''
    for (const { key } of searchSecrets) form[key] = ''
    toast.add({ severity: 'success', summary: 'Config enregistrée', life: 2500 })
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

function secretConfigured(key: string) {
  if (!settings.value) return false
  if (key === 'openaiApiKey') return settings.value.openaiConfigured
  if (settings.value.secrets?.[key]) return true
  if (key === 'resendApiKey') return settings.value.resendConfigured
  if (key === 'brevoApiKey') return settings.value.brevoConfigured
  if (key === 'sendgridApiKey') return settings.value.sendgridConfigured
  if (key === 'mailjetApiKey' || key === 'mailjetSecretKey') return settings.value.mailjetConfigured
  if (key === 'mailgunApiKey') return settings.value.mailgunConfigured
  const providerId = key.replace(/ApiKey$/, '')
  return Boolean(settings.value.providers?.find((p) => p.id === providerId)?.configured)
}

function openSender(s?: Sender) {
  if (s) {
    senderForm.id = s.id
    senderForm.name = s.name
    senderForm.email = s.email
    senderForm.replyTo = s.replyTo || ''
    senderForm.isDefault = s.isDefault
  } else {
    senderForm.id = null
    senderForm.name = ''
    senderForm.email = ''
    senderForm.replyTo = ''
    senderForm.isDefault = false
  }
  senderDialog.value = true
}

async function saveSender() {
  const body = {
    name: senderForm.name,
    email: senderForm.email,
    replyTo: senderForm.replyTo || null,
    isDefault: senderForm.isDefault,
  }
  if (senderForm.id) {
    await api(`senders/${senderForm.id}`, { method: 'PATCH', body })
  } else {
    await api('senders', { method: 'POST', body })
  }
  senderDialog.value = false
  senders.value = await api<Sender[]>('senders')
  toast.add({ severity: 'success', summary: 'Expéditeur enregistré', life: 2000 })
}

function removeSender(s: Sender) {
  confirm.require({
    message: `Supprimer ${s.name} ?`,
    header: 'Confirmation',
    accept: async () => {
      await api(`senders/${s.id}`, { method: 'DELETE' })
      senders.value = await api<Sender[]>('senders')
    },
  })
}

onMounted(load)
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1>Config</h1>
        <p>Email, IA et recherche web</p>
      </div>
      <Button label="Enregistrer" icon="pi pi-save" :loading="saving" @click="save" />
    </div>

    <!-- EMAIL — overview -->
    <div class="card stack">
      <h2 style="margin: 0; font-size: 1.05rem">Email — mode d’envoi</h2>
      <p class="muted" style="margin: 0">
        Mode actuel : <strong>{{ activeProviderLabel }}</strong>.
        En <em>Auto</em>, le système consomme d’abord les quotas journaliers (Brevo, Mailjet, SendGrid),
        puis mensuels (Resend, Mailgun), puis SMTP hébergeur en dernier recours.
      </p>

      <div class="row" style="gap: 0.5rem; flex-wrap: wrap; align-items: center">
        <Button
          label="Auto (quotas smart)"
          icon="pi pi-bolt"
          size="small"
          :outlined="form.mailProvider !== 'auto'"
          @click="selectMailProvider('auto')"
        />
        <Tag
          v-if="form.mailProvider === 'auto'"
          value="Actif"
          severity="success"
        />
        <NuxtLink to="/usage" style="margin-left: auto; color: #0f766e; font-weight: 600; font-size: 0.9rem">
          Voir le détail Usage →
        </NuxtLink>
      </div>
      <div v-if="mailUsageTags.length" class="row" style="gap: 0.4rem; flex-wrap: wrap">
        <Tag v-for="t in mailUsageTags" :key="t" :value="t" severity="info" />
      </div>

      <div class="channel-grid">
        <div
          class="channel-card"
          :class="{ selected: activeProviderCategory === 'auto' }"
          style="cursor: pointer"
          @click="selectMailProvider('auto')"
        >
          <div class="channel-title">Auto (recommandé)</div>
          <p>
            Routage intelligent entre tous les comptes configurés. Priorité aux free tiers
            journaliers (use-it-or-lose-it), puis mensuels, puis votre SMTP.
          </p>
        </div>
        <div
          class="channel-card"
          :class="{ selected: activeProviderCategory === 'tier' }"
        >
          <div class="channel-title">Services tiers (API)</div>
          <p>
            Resend, Brevo, SendGrid, Mailjet, Mailgun… Verrouillez un provider précis
            ci-dessous, ou laissez Auto les consommer dans l’ordre des quotas.
          </p>
        </div>
        <div
          class="channel-card"
          :class="{ selected: activeProviderCategory === 'console' }"
          style="cursor: pointer"
          @click="selectMailProvider('console')"
        >
          <div class="channel-title">Console (Dev)</div>
          <p>
            Aucun email réel : les messages sont seulement loggés. Utile pour tester
            le flux complet en développement sans consommer de quota ni toucher aux
            destinataires.
          </p>
        </div>
      </div>

      <div v-if="consoleLogoItems.length" class="row" style="gap: 0.5rem; flex-wrap: wrap; align-items: center">
        <ProviderLogos
          :items="consoleLogoItems"
          selectable
          @select="selectMailProvider"
        />
        <Tag
          v-if="activeProviderCategory === 'console'"
          value="Actif"
          severity="warn"
        />
      </div>

      <div class="form-grid">
        <div>
          <label class="field-label">From (fallback)</label>
          <InputText v-model="form.mailFrom" style="width: 100%" placeholder="noreply@domaine.com" />
        </div>
        <div>
          <label class="field-label">From name (fallback)</label>
          <InputText v-model="form.mailFromName" style="width: 100%" />
        </div>
        <div>
          <label class="field-label">Délai entre emails (ms)</label>
          <InputNumber v-model="form.sendDelayMs" :min="1000" :step="1000" style="width: 100%" />
        </div>
        <div>
          <label class="field-label">PUBLIC_URL (tracking, clics, désinscription)</label>
          <InputText v-model="form.publicUrl" style="width: 100%" />
          <p class="muted" style="margin: 0.35rem 0 0; font-size: 0.82rem">
            Lien public de désinscription dans chaque email :
            <code>{{ form.publicUrl || 'https://…' }}/u/&lt;token&gt;</code>
          </p>
        </div>
      </div>
    </div>

    <!-- TIER -->
    <div class="card stack" :class="{ 'card-active': activeProviderCategory === 'tier' }">
      <div class="row" style="justify-content: space-between; align-items: flex-start">
        <div>
          <h2 style="margin: 0; font-size: 1.05rem">1 · Services tiers (API)</h2>
          <p class="muted" style="margin: 0.35rem 0 0">
            Configurez les clés ci-dessous. En mode Auto elles sont utilisées selon les quotas ;
            cliquez un logo pour verrouiller un provider précis.
          </p>
        </div>
        <Tag
          v-if="activeProviderCategory === 'tier'"
          value="Actif"
          severity="success"
        />
      </div>
      <ProviderLogos
        v-if="tierLogoItems.length"
        :items="tierLogoItems"
        selectable
        @select="selectMailProvider"
      />
      <div class="form-grid">
        <div v-for="f in tierSecrets" :key="f.key">
          <label class="field-label">
            <a
              v-if="providerDocs(f.providerId)"
              :href="providerDocs(f.providerId)"
              target="_blank"
              rel="noopener noreferrer"
              class="provider-label-link"
            >
              <img
                :src="`/providers/${f.providerId}.svg`"
                :alt="f.label"
                width="18"
                height="18"
              />
              {{ f.label }}
              <i class="pi pi-external-link" style="font-size: 0.7rem" />
            </a>
            <template v-else>{{ f.label }}</template>
            <Tag
              v-if="secretConfigured(f.key)"
              value="configurée"
              severity="success"
              style="margin-left: 0.35rem"
            />
          </label>
          <Password
            :model-value="form[f.key]"
            :feedback="false"
            toggle-mask
            style="width: 100%"
            input-style="width: 100%"
            :placeholder="f.hint"
            @update:model-value="(value) => updateSecret(f.key, value)"
          />
        </div>
        <div>
          <label class="field-label">Mailgun domain</label>
          <InputText
            v-model="form.mailgunDomain"
            style="width: 100%"
            placeholder="mg.votredomaine.com"
          />
        </div>
      </div>
    </div>

    <!-- SMTP -->
    <div class="card stack" :class="{ 'card-active': activeProviderCategory === 'smtp' }">
      <div class="row" style="justify-content: space-between; align-items: flex-start">
        <div>
          <h2 style="margin: 0; font-size: 1.05rem">2 · SMTP gratuit (hébergeur)</h2>
          <p class="muted" style="margin: 0.35rem 0 0">
            Connexion directe au SMTP de votre hébergeur. Aucune clé API tiers —
            uniquement host / port / identifiants fournis par Hostinger, OVH, etc.
          </p>
        </div>
        <div class="row">
          <ProviderLogos
            v-if="smtpLogoItems.length"
            :items="smtpLogoItems"
            selectable
            @select="selectMailProvider"
          />
          <Tag
            v-if="activeProviderCategory === 'smtp'"
            value="Actif"
            severity="success"
          />
        </div>
      </div>
      <div class="form-grid">
        <div>
          <label class="field-label">SMTP host</label>
          <InputText v-model="form.smtpHost" style="width: 100%" placeholder="smtp.hostinger.com" />
        </div>
        <div>
          <label class="field-label">SMTP port</label>
          <InputNumber v-model="form.smtpPort" :min="1" style="width: 100%" />
        </div>
        <div class="row" style="align-items: flex-end">
          <Checkbox v-model="form.smtpSecure" binary input-id="smtp-secure" />
          <label for="smtp-secure">SMTP SSL/TLS (465)</label>
        </div>
        <div v-for="f in smtpSecrets" :key="f.key">
          <label class="field-label">
            {{ f.label }}
            <Tag
              v-if="secretConfigured(f.key)"
              value="configurée"
              severity="success"
              style="margin-left: 0.35rem"
            />
          </label>
          <Password
            :model-value="form[f.key]"
            :feedback="false"
            toggle-mask
            style="width: 100%"
            input-style="width: 100%"
            :placeholder="f.hint"
            @update:model-value="(value) => updateSecret(f.key, value)"
          />
        </div>
      </div>
      <Button
        label="Activer le SMTP hébergeur"
        icon="pi pi-check"
        size="small"
        :outlined="form.mailProvider !== 'smtp'"
        @click="selectMailProvider('smtp')"
      />
    </div>

    <div class="card stack">
      <div>
        <h2 style="margin: 0; font-size: 1.05rem">3 · Réponses automatiques Resend</h2>
        <p class="muted" style="margin: 0.35rem 0 0">
          Aurel reçoit les réponses, met le Pipeline à jour et stoppe les relances.
          Une copie peut rester visible dans Proton.
        </p>
      </div>
      <div class="form-grid">
        <div>
          <label class="field-label">
            Secret du webhook Resend
            <Tag
              v-if="secretConfigured('resendWebhookSecret')"
              value="configuré"
              severity="success"
              style="margin-left: 0.35rem"
            />
          </label>
          <Password
            v-model="form.resendWebhookSecret"
            :feedback="false"
            toggle-mask
            style="width: 100%"
            input-style="width: 100%"
            placeholder="whsec_… — laissez vide pour conserver"
          />
        </div>
        <div>
          <label class="field-label">Adresse de réception Resend</label>
          <InputText
            v-model="form.resendInboundAddress"
            style="width: 100%"
            placeholder="reponses@votre-sous-domaine"
          />
        </div>
        <div>
          <label class="field-label">Copie lisible dans Proton</label>
          <InputText
            v-model="form.replyForwardTo"
            style="width: 100%"
            placeholder="kynexy@proton.me"
          />
        </div>
        <div>
          <label class="field-label">URL à saisir dans Resend</label>
          <InputText
            :model-value="`${form.publicUrl || 'https://mailing.aito-flow.com'}/api/replies/resend`"
            readonly
            style="width: 100%"
          />
        </div>
      </div>
    </div>

    <div class="card" style="padding: 0; overflow: hidden">
      <div
        class="row"
        style="justify-content: space-between; padding: 1rem 1.25rem; border-bottom: 1px solid var(--mailer-border)"
      >
        <strong>Email — expéditeurs</strong>
        <Button label="Ajouter" icon="pi pi-plus" size="small" @click="openSender()" />
      </div>
      <DataTable :value="senders" size="small">
        <Column field="name" header="Nom" />
        <Column field="email" header="Email" />
        <Column field="replyTo" header="Reply-To" />
        <Column header="Défaut">
          <template #body="{ data }">
            <Tag v-if="data.isDefault" value="oui" severity="info" />
          </template>
        </Column>
        <Column header="" style="width: 7rem">
          <template #body="{ data }">
            <Button icon="pi pi-pencil" text rounded @click="openSender(data)" />
            <Button icon="pi pi-trash" text rounded severity="danger" @click="removeSender(data)" />
          </template>
        </Column>
      </DataTable>
    </div>

    <!-- IA -->
    <div class="card stack">
      <h2 style="margin: 0; font-size: 1.05rem">IA — OpenAI</h2>
      <ProviderLogos :items="openaiLogoItems" />
      <div class="form-grid">
        <div>
          <label class="field-label">
            API Key
            <Tag
              v-if="secretConfigured('openaiApiKey')"
              value="configurée"
              severity="success"
              style="margin-left: 0.35rem"
            />
          </label>
          <Password
            v-model="form.openaiApiKey"
            :feedback="false"
            toggle-mask
            style="width: 100%"
            input-style="width: 100%"
            placeholder="Laissez vide pour conserver"
          />
        </div>
        <div>
          <label class="field-label">Modèle</label>
          <InputText v-model="form.openaiModel" style="width: 100%" placeholder="gpt-4o-mini" />
        </div>
      </div>
    </div>

    <!-- RECHERCHE -->
    <div class="card stack">
      <h2 style="margin: 0; font-size: 1.05rem">Recherche web</h2>
      <p class="muted" style="margin: 0">
        Quotas smart : You.com (jour) → Tavily / SerpAPI / Exa (mois) → Nimble free en dernier.
        Firecrawl réservé au scrape. Laissez vide pour conserver une clé.
      </p>
      <div class="row" style="gap: 0.4rem; flex-wrap: wrap; align-items: center">
        <Tag v-for="t in searchUsageTags" :key="t" :value="t" severity="info" />
        <NuxtLink to="/usage" style="margin-left: auto; color: #0f766e; font-weight: 600; font-size: 0.9rem">
          Voir le détail Usage →
        </NuxtLink>
      </div>
      <div v-if="searchLogoItems.length" class="stack" style="gap: 0.35rem">
        <label class="field-label">Fournisseurs recherche</label>
        <ProviderLogos :items="searchLogoItems" />
      </div>
      <div class="form-grid">
        <div v-for="f in searchSecrets" :key="f.key">
          <label class="field-label">
            <a
              v-if="providerDocs(f.providerId)"
              :href="providerDocs(f.providerId)"
              target="_blank"
              rel="noopener noreferrer"
              class="provider-label-link"
            >
              <img
                :src="`/providers/${f.providerId}.svg`"
                :alt="f.label"
                width="18"
                height="18"
              />
              {{ f.label }}
              <i class="pi pi-external-link" style="font-size: 0.7rem" />
            </a>
            <template v-else>{{ f.label }}</template>
            <Tag
              v-if="secretConfigured(f.key)"
              value="configurée"
              severity="success"
              style="margin-left: 0.35rem"
            />
          </label>
          <Password
            :model-value="form[f.key]"
            :feedback="false"
            toggle-mask
            style="width: 100%"
            input-style="width: 100%"
            :placeholder="f.hint"
            @update:model-value="(value) => updateSecret(f.key, value)"
          />
        </div>
      </div>
    </div>

    <Dialog v-model:visible="senderDialog" modal header="Expéditeur" style="width: min(420px, 95vw)">
      <div class="stack">
        <div>
          <label class="field-label">Nom affiché</label>
          <InputText v-model="senderForm.name" style="width: 100%" />
        </div>
        <div>
          <label class="field-label">Email From</label>
          <InputText v-model="senderForm.email" style="width: 100%" />
        </div>
        <div>
          <label class="field-label">Reply-To (optionnel)</label>
          <InputText v-model="senderForm.replyTo" style="width: 100%" />
        </div>
        <div class="row">
          <Checkbox v-model="senderForm.isDefault" binary input-id="def" />
          <label for="def">Définir par défaut</label>
        </div>
      </div>
      <template #footer>
        <Button label="Annuler" text @click="senderDialog = false" />
        <Button label="Enregistrer" @click="saveSender" />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.provider-label-link {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  color: inherit;
  text-decoration: none;
}
.provider-label-link:hover {
  color: #0f766e;
}
.provider-label-link img {
  border-radius: 4px;
}

.channel-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
}
@media (max-width: 900px) {
  .channel-grid {
    grid-template-columns: 1fr;
  }
}
.channel-card {
  border: 1px solid var(--mailer-border, #e2e8f0);
  border-radius: 12px;
  padding: 0.85rem 1rem;
  background: #f8fafc;
}
.channel-card.selected {
  border-color: #0f766e;
  background: rgba(15, 118, 110, 0.06);
  box-shadow: 0 0 0 1px #0f766e;
}
.channel-title {
  font-weight: 700;
  font-size: 0.9rem;
  margin-bottom: 0.35rem;
}
.channel-card p {
  margin: 0;
  font-size: 0.82rem;
  color: #64748b;
  line-height: 1.45;
}
.card-active {
  border-color: #0f766e !important;
  box-shadow: 0 0 0 1px rgba(15, 118, 110, 0.25);
}
</style>
