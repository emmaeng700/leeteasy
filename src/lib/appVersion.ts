/** Bumped each release so stale PWA caches can self-heal. */
export const APP_BUILD_ID =
  process.env.NEXT_PUBLIC_APP_BUILD_ID?.slice(0, 7) || 'dev'

export const SW_SCRIPT = '/sw-v28.js'
