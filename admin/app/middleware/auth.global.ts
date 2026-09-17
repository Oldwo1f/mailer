export default defineNuxtRouteMiddleware(async (to) => {
  const config = useRuntimeConfig()
  const base = config.public.apiBase as string
  const authUrl = new URL('auth/me', base.endsWith('/') ? base : `${base}/`).toString()

  let authenticated = false
  try {
    const result = await $fetch<{ authenticated?: boolean }>(authUrl, {
      credentials: 'include',
    })
    authenticated = result.authenticated === true
  } catch {
    authenticated = false
  }

  if (to.path === '/login') {
    if (authenticated) return navigateTo('/')
    return
  }

  if (!authenticated) {
    return navigateTo('/login')
  }
})
