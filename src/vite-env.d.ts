/// <reference types="vite/client" />

declare const __TARUVI_SITE_URL__: string
declare const __TARUVI_APP_SLUG__: string
declare const __TARUVI_APP_TITLE__: string

interface ImportMetaEnv {
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
