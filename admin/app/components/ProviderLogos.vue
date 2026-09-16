<script setup lang="ts">
export type ProviderLogoItem = {
  id: string
  label: string
  docsUrl?: string | null
  configured?: boolean
  active?: boolean
  hint?: string
}

const props = defineProps<{
  items: ProviderLogoItem[]
  /** When true, clicking also emits select for choosing active provider */
  selectable?: boolean
}>()

const emit = defineEmits<{
  select: [id: string]
}>()

function logoSrc(id: string) {
  return `/providers/${id}.svg`
}

function onClick(item: ProviderLogoItem, ev: MouseEvent) {
  if (props.selectable) {
    ev.preventDefault()
    emit('select', item.id)
  }
}
</script>

<template>
  <div class="provider-logos">
    <component
      :is="item.docsUrl && !selectable ? 'a' : 'button'"
      v-for="item in items"
      :key="item.id"
      class="provider-logo"
      :class="{
        active: item.active,
        configured: item.configured,
        off: item.configured === false,
      }"
      :href="item.docsUrl && !selectable ? item.docsUrl : undefined"
      :target="item.docsUrl && !selectable ? '_blank' : undefined"
      :rel="item.docsUrl && !selectable ? 'noopener noreferrer' : undefined"
      :type="selectable || !item.docsUrl ? 'button' : undefined"
      :title="[
        item.label,
        item.hint,
        item.docsUrl && !selectable ? 'Ouvrir le site' : null,
        selectable ? 'Sélectionner' : null,
      ]
        .filter(Boolean)
        .join(' — ')"
      @click="onClick(item, $event)"
    >
      <img :src="logoSrc(item.id)" :alt="item.label" width="28" height="28" />
      <span class="name">{{ item.label }}</span>
      <a
        v-if="selectable && item.docsUrl"
        class="site-link"
        :href="item.docsUrl"
        target="_blank"
        rel="noopener noreferrer"
        title="Site du fournisseur"
        @click.stop
      >
        <i class="pi pi-external-link" />
      </a>
    </component>
  </div>
</template>

<style scoped>
.provider-logos {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.provider-logo {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.45rem 0.7rem 0.45rem 0.5rem;
  border-radius: 10px;
  border: 1px solid var(--mailer-border, #e2e8f0);
  background: #fff;
  color: inherit;
  text-decoration: none;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    background 0.15s ease;
  font: inherit;
}

.provider-logo:hover {
  border-color: #94a3b8;
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.08);
}

.provider-logo.active {
  border-color: #0f766e;
  background: rgba(15, 118, 110, 0.06);
  box-shadow: 0 0 0 1px #0f766e;
}

.provider-logo.off {
  opacity: 0.55;
}

.provider-logo img {
  width: 28px;
  height: 28px;
  object-fit: contain;
  border-radius: 6px;
  flex-shrink: 0;
}

.provider-logo .name {
  font-size: 0.85rem;
  font-weight: 600;
  white-space: nowrap;
}

.site-link {
  display: inline-flex;
  align-items: center;
  color: #64748b;
  margin-left: 0.15rem;
  padding: 0.15rem;
  border-radius: 4px;
}

.site-link:hover {
  color: #0f766e;
  background: rgba(15, 118, 110, 0.08);
}
</style>
