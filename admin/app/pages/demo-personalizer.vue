<script setup lang="ts">
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Dialog from 'primevue/dialog'
import Tag from 'primevue/tag'
import Textarea from 'primevue/textarea'
import type { Prospect } from '~/types/mailer'
import type { ProductRecommendation } from '~/types/product-matcher'
import type { DemoPreparation, DemoRecipe } from '~/types/demo-personalizer'

type DemoProspect = Prospect & {
  productRecommendation?: ProductRecommendation | null
  demoPreparation?: DemoPreparation | null
}

const { api } = useApi()
const toast = useToast()
const loading = ref(false)
const preparingId = ref<string | null>(null)
const savingArtifacts = ref(false)
const prospects = ref<DemoProspect[]>([])
const recipes = ref<DemoRecipe[]>([])
const activeProspectId = ref<string | null>(null)
const activePack = ref<DemoPreparation | null>(null)
const artifactUrlsText = ref('')
const dialogVisible = ref(false)

const eligible = computed(() =>
  prospects.value.filter((p) => {
    const state = p.productRecommendation?.reviewState
    return state === 'accepted' || state === 'overridden'
  }),
)

const activeRecipe = computed(() => {
  if (!activePack.value) return null
  return recipes.value.find((recipe) => recipe.productId === activePack.value?.productId) || null
})

async function load() {
  loading.value = true
  try {
    ;[prospects.value, recipes.value] = await Promise.all([
      api<DemoProspect[]>('prospects', { query: { unsubscribed: 'false' } }),
      api<DemoRecipe[]>('demo-personalizer/recipes'),
    ])
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'Demo Personalizer',
      detail: e instanceof Error ? e.message : String(e),
      life: 5000,
    })
  } finally {
    loading.value = false
  }
}

async function prepare(p: DemoProspect) {
  preparingId.value = p.id
  try {
    const pack = await api<DemoPreparation>(`demo-personalizer/${p.id}/prepare`, {
      method: 'POST',
    })
    openPackById(p.id, pack)
    await load()
    toast.add({
      severity: 'success',
      summary: 'Pack démo prêt',
      detail: `${p.company} · ${pack.productName}`,
      life: 3000,
    })
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'Préparation démo',
      detail: e instanceof Error ? e.message : String(e),
      life: 5000,
    })
  } finally {
    preparingId.value = null
  }
}

function openPack(p: DemoProspect) {
  if (!p.demoPreparation) return
  openPackById(p.id, p.demoPreparation)
}

function openPackById(prospectId: string, pack: DemoPreparation) {
  activeProspectId.value = prospectId
  activePack.value = pack
  artifactUrlsText.value = (pack.artifactUrls || []).join('\n')
  dialogVisible.value = true
}

function parsedArtifactUrls() {
  return [...new Set(
    artifactUrlsText.value
      .split(/[\n,;]/)
      .map((url) => url.trim())
      .filter(Boolean),
  )]
}

async function saveArtifacts() {
  if (!activeProspectId.value || !activePack.value) return
  const urls = parsedArtifactUrls()
  if (!urls.length) {
    toast.add({ severity: 'warn', summary: 'Ajoutez au moins une URL d’artefact', life: 3000 })
    return
  }
  savingArtifacts.value = true
  try {
    const pack = await api<DemoPreparation>(
      `demo-personalizer/${activeProspectId.value}/artifacts`,
      { method: 'PATCH', body: { artifactUrls: urls } },
    )
    activePack.value = pack
    artifactUrlsText.value = pack.artifactUrls.join('\n')
    await load()
    toast.add({
      severity: 'success',
      summary: 'Artefacts enregistrés',
      detail: `${pack.artifactUrls.length} visuel(s) · version ${pack.artifactVersion || 1}`,
      life: 3500,
    })
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'Artefacts',
      detail: e instanceof Error ? e.message : String(e),
      life: 5000,
    })
  } finally {
    savingArtifacts.value = false
  }
}

async function clearArtifacts() {
  if (!activeProspectId.value) return
  savingArtifacts.value = true
  try {
    const pack = await api<DemoPreparation>(
      `demo-personalizer/${activeProspectId.value}/artifacts`,
      { method: 'DELETE' },
    )
    activePack.value = pack
    artifactUrlsText.value = ''
    await load()
    toast.add({ severity: 'success', summary: 'Artefacts réinitialisés', life: 2500 })
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'Artefacts',
      detail: e instanceof Error ? e.message : String(e),
      life: 5000,
    })
  } finally {
    savingArtifacts.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1>Demo Personalizer</h1>
        <p>
          Prépare les données sûres de personnalisation puis enregistre uniquement de vrais visuels déjà générés.
        </p>
      </div>
      <Button icon="pi pi-refresh" text @click="load" />
    </div>

    <div class="card" style="padding: 0; overflow: hidden">
      <DataTable :value="eligible" :loading="loading" data-key="id" striped-rows paginator :rows="15" size="small">
        <Column field="company" header="Entreprise" sortable />
        <Column header="Produit">
          <template #body="{ data }">
            <strong>{{ data.productRecommendation?.productName || '—' }}</strong>
          </template>
        </Column>
        <Column header="Confiance">
          <template #body="{ data }">
            <Tag
              v-if="data.productRecommendation"
              :value="data.productRecommendation.confidence"
              :severity="data.productRecommendation.confidence === 'high' ? 'success' : 'warn'"
            />
          </template>
        </Column>
        <Column header="Pack démo">
          <template #body="{ data }">
            <Tag v-if="data.demoPreparation" value="Préparé" severity="success" />
            <Tag v-else value="À préparer" severity="secondary" />
          </template>
        </Column>
        <Column header="Artefact">
          <template #body="{ data }">
            <div class="stack" style="gap: 0.15rem">
              <Tag
                v-if="data.demoPreparation?.artifactStatus === 'generated'"
                :value="`Généré · ${data.demoPreparation.artifactUrls?.length || 0}`"
                severity="success"
              />
              <Tag v-else value="Non généré" severity="secondary" />
              <span v-if="data.demoPreparation?.artifactGeneratedAt" class="muted" style="font-size: 0.72rem">
                {{ new Date(data.demoPreparation.artifactGeneratedAt).toLocaleString('fr-FR') }}
              </span>
            </div>
          </template>
        </Column>
        <Column header="" style="width: 13rem">
          <template #body="{ data }">
            <div class="row">
              <Button
                label="Préparer"
                icon="pi pi-sparkles"
                size="small"
                :loading="preparingId === data.id"
                @click="prepare(data)"
              />
              <Button
                v-if="data.demoPreparation"
                icon="pi pi-eye"
                text
                rounded
                v-tooltip.top="'Voir le pack / gérer les artefacts'"
                @click="openPack(data)"
              />
            </div>
          </template>
        </Column>
      </DataTable>
    </div>

    <div v-if="!loading && !eligible.length" class="card muted">
      Aucun prospect validé pour une démo. Validez d’abord une recommandation dans Product Matcher.
    </div>

    <Dialog
      v-model:visible="dialogVisible"
      modal
      header="Pack Demo Personalizer"
      style="width: min(820px, 96vw)"
    >
      <div v-if="activePack" class="stack">
        <div>
          <h2 style="margin: 0">{{ activePack.company }}</h2>
          <div class="row" style="margin-top: 0.4rem; flex-wrap: wrap">
            <Tag :value="activePack.productName" severity="info" />
            <Tag :value="activePack.demoType" severity="secondary" />
            <Tag
              :value="activePack.artifactStatus === 'generated' ? 'Artefacts réels enregistrés' : 'Aucun artefact réel'"
              :severity="activePack.artifactStatus === 'generated' ? 'success' : 'secondary'"
            />
          </div>
        </div>

        <div class="card">
          <strong>Angle recommandé</strong>
          <p style="margin-bottom: 0">{{ activePack.recommendedAngle }}</p>
        </div>

        <div v-if="activeRecipe">
          <label class="field-label">Recette visuelle recommandée · {{ activeRecipe.targetScreenCount }} écran(s)</label>
          <div class="stack" style="gap: 0.45rem">
            <div v-for="(screen, index) in activeRecipe.screens" :key="screen.id" class="card" style="padding: 0.7rem 0.8rem">
              <strong>{{ index + 1 }}. {{ screen.title }}</strong>
              <div>{{ screen.purpose }}</div>
              <div class="muted" style="font-size: 0.75rem">Personnalisation : {{ screen.personalization.join(', ') }}</div>
            </div>
            <p v-if="!activeRecipe.screens.length" class="muted" style="margin: 0">
              Sur-mesure : commencer par une phase de découverte plutôt que fabriquer des écrans non justifiés.
            </p>
          </div>
        </div>

        <div>
          <label class="field-label">Branding autorisé</label>
          <div class="card stack" style="gap: 0.3rem">
            <div><strong>Nom :</strong> {{ activePack.branding.name }}</div>
            <div><strong>Activité :</strong> {{ activePack.branding.activity || '—' }}</div>
            <div><strong>Zone :</strong> {{ activePack.branding.location || '—' }}</div>
            <div><strong>Site :</strong> {{ activePack.branding.website || '—' }}</div>
          </div>
        </div>

        <div>
          <label class="field-label">Faits autorisés dans la démo</label>
          <ul>
            <li v-for="fact in activePack.factsAllowed" :key="fact">{{ fact }}</li>
          </ul>
        </div>

        <div>
          <label class="field-label">Sources</label>
          <div class="stack" style="gap: 0.4rem">
            <div v-for="e in activePack.evidence" :key="`${e.source}-${e.fact}`" class="card" style="padding: 0.65rem">
              <div>{{ e.fact }}</div>
              <a v-if="e.source.startsWith('http')" :href="e.source" target="_blank" rel="noopener" class="muted">{{ e.source }}</a>
              <div v-else class="muted">{{ e.source }}</div>
            </div>
          </div>
        </div>

        <div class="card stack">
          <div>
            <strong>Artefacts réels</strong>
            <p class="muted" style="margin: 0.25rem 0 0">
              Collez 1 à 6 URLs publiques, une par ligne. Le système ne considère la démo comme générée qu’après cet enregistrement.
            </p>
          </div>
          <Textarea v-model="artifactUrlsText" rows="6" style="width: 100%" placeholder="https://.../screen-1.png\nhttps://.../screen-2.png" />
          <div class="row" style="justify-content: flex-end; flex-wrap: wrap">
            <Button
              v-if="activePack.artifactStatus === 'generated'"
              label="Réinitialiser"
              icon="pi pi-trash"
              severity="danger"
              text
              :loading="savingArtifacts"
              @click="clearArtifacts"
            />
            <Button
              label="Enregistrer les artefacts"
              icon="pi pi-check"
              :loading="savingArtifacts"
              @click="saveArtifacts"
            />
          </div>
          <div v-if="activePack.artifactUrls?.length" class="stack" style="gap: 0.25rem">
            <a v-for="url in activePack.artifactUrls" :key="url" :href="url" target="_blank" rel="noopener">{{ url }}</a>
          </div>
        </div>
      </div>
    </Dialog>
  </div>
</template>
