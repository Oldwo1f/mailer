export function useApi() {
  const config = useRuntimeConfig()
  const base = config.public.apiBase as string

  async function api<T>(
    path: string,
    options: {
      method?: string
      body?: unknown
      query?: Record<string, string | undefined>
    } = {},
  ): Promise<T> {
    const url = new URL(path.replace(/^\//, ''), base.endsWith('/') ? base : `${base}/`)
    if (options.query) {
      for (const [k, v] of Object.entries(options.query)) {
        if (v !== undefined && v !== '') url.searchParams.set(k, v)
      }
    }
    try {
      return await $fetch<T>(url.toString(), {
        method: (options.method || 'GET') as 'GET',
        body: options.body as BodyInit | Record<string, unknown> | null | undefined,
        credentials: 'include',
      })
    } catch (err: unknown) {
      const e = err as {
        data?: { message?: string | string[]; error?: string }
        message?: string
      }
      const msg =
        (Array.isArray(e.data?.message)
          ? e.data?.message.join(', ')
          : e.data?.message) ||
        e.data?.error ||
        e.message ||
        'Erreur API'
      throw new Error(String(msg))
    }
  }

  return { api, base }
}
