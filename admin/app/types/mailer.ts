export type ProspectListSummary = {
  id: string
  name: string
  slug: string
  description: string | null
  prospectCount: number
  createdAt: string
  updatedAt: string
}

export type ProspectProfile = {
  type?: string | null
  commune?: string | null
  adresse?: string | null
  telephones?: string[]
  sites_web?: string[]
  facebook?: string[]
  num_tahiti?: string | null
  besoins?: string | null
  description?: string | null
  cuisine?: string | null
  gps?: { lat?: number; lon?: number } | null
  sources?: string[]
  source_url?: string | null
  score_completude?: number | null
  [key: string]: unknown
}

export type Prospect = {
  id: string
  company: string
  emails: string[]
  contactName: string | null
  profile: ProspectProfile | null
  starred: boolean
  unsubscribedAt: string | null
  enrichment: {
    website?: string | null
    activity?: string | null
    location?: string | null
    hook?: string | null
    sources?: string[]
    enrichedAt?: string
    provider?: string | null
  } | null
  notes: string | null
  lists?: Array<{ id: string; name: string; slug: string }>
  createdAt: string
  updatedAt: string
}

export type Sender = {
  id: string
  name: string
  email: string
  replyTo: string | null
  isDefault: boolean
}

export type CampaignStep = {
  id: string
  campaignId: string
  position: number
  name: string
  brief: string
  delayDays: number
}

export type PrepareCampaignResult = {
  name: string
  steps: Array<{ name: string; brief: string; delayDays: number }>
  warning?: string
}

export type Campaign = {
  id: string
  name: string
  brief: string
  tone: string
  emailType: string
  language: string
  status: string
  autopilotEnabled: boolean
  senderId: string | null
  sender?: Sender | null
  prospectIds: string[] | null
  listIds: string[] | null
  currentStepIndex: number
  nextStepAt: string | null
  steps?: CampaignStep[]
  createdAt: string
  updatedAt: string
}

export type Draft = {
  id: string
  campaignId: string
  stepId: string | null
  step?: CampaignStep | null
  prospectId: string
  prospect?: Prospect
  subject: string | null
  html: string | null
  text: string | null
  status: string
  error: string | null
}

export type SendRow = {
  id: string
  token: string
  toEmail: string
  status: string
  messageId: string | null
  error: string | null
  sentAt: string | null
  openCount: number
  lastOpenedAt: string | null
  clickCount: number
  prospect?: Prospect
  createdAt?: string
  campaignId?: string
  campaignName?: string | null
  prospectId?: string
  company?: string | null
  draftId?: string
  subject?: string | null
  stepName?: string | null
  stepPosition?: number | null
}

export type SendJournalPage = {
  total: number
  limit: number
  offset: number
  items: SendRow[]
}

export type SendDetail = SendRow & {
  html: string | null
  text: string | null
  clicks: Array<{ id: string; url: string; clickedAt: string }>
}

export type CampaignDetail = Campaign & {
  drafts: Draft[]
  sends: SendRow[]
}

export type OverviewStats = {
  sent: number
  opened: number
  clicks: number
  unsubscribed: number
  prospects: number
  campaigns: number
  openRate: number
  recentCampaigns: Campaign[]
}

export type MailProviderInfo = {
  id: string
  label: string
  hint: string
  freeTierHint: string
  docsUrl?: string
  period?: 'daily' | 'monthly' | 'pool' | 'unlimited'
  limit?: number | null
  tier?: number
  configured: boolean
}

export type UsageItem = {
  id: string
  label: string
  configured: boolean
  period: 'daily' | 'monthly' | 'pool' | 'unlimited'
  tier: number
  limit: number | null
  used: number
  remaining: number | null
  exhausted: boolean
  resetLabel: string
}

export type UsageSnapshot = {
  generatedAt: string
  timezone: 'UTC'
  mail: {
    mode: 'auto' | 'locked'
    lockedProvider: string | null
    nextProvider: string | null
    items: UsageItem[]
  }
  search: {
    nextProvider: string | null
    items: UsageItem[]
  }
}

export type ImportResult = {
  imported: number
  merged: number
  skipped: number
  invalid: number
  errors: Array<{ index: number; reason: string }>
}

export type DiscoverBatchSize = 10 | 50 | 100

export type DiscoverJobStatus =
  | 'queued'
  | 'running'
  | 'done'
  | 'error'
  | 'cancelled'

export type DiscoverJob = {
  id: string
  status: DiscoverJobStatus
  keywords: string
  location: string | null
  listId: string
  listName: string
  batchSize: DiscoverBatchSize
  found: number
  merged: number
  skipped: number
  searches: number
  scrapes: number
  message: string | null
  log: Array<{ at: string; text: string }> | null
  results: {
    prospects: Array<{
      id: string
      company: string
      emails: string[]
      created: boolean
    }>
  } | null
  createdAt: string
  updatedAt: string
  finishedAt: string | null
}

export type SettingsPublic = {
  publicUrl: string
  mailserverUrl: string
  sendDelayMs: number
  openaiModel: string
  openaiConfigured: boolean
  llmConfigured: boolean
  mailserverApiKeyConfigured: boolean
  mailProvider: string
  mailProviders: MailProviderInfo[]
  resendConfigured: boolean
  resendInboundAddress: string
  replyForwardTo: string
  brevoConfigured: boolean
  sendgridConfigured: boolean
  mailjetConfigured: boolean
  mailgunConfigured: boolean
  mailgunDomain: string
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  mailFrom: string
  mailFromName: string
  providers: Array<{
    id: string
    label: string
    freeTierHint: string
    docsUrl: string
    period?: string
    limit?: number | null
    tier?: number
    configured: boolean
  }>
  secrets: Record<string, boolean>
  usage?: UsageSnapshot
}
