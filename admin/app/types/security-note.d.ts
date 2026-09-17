export {}

declare global {
  /**
   * Mailer admin API calls use an HttpOnly server session cookie.
   * Do not add browser-persisted bearer tokens or reusable API keys.
   */
  interface Window {}
}
