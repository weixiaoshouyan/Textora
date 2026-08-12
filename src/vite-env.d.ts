/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly TEXTORA_DEV?: string;
  readonly TEXTORA_VERSION?: string;
  readonly TEXTORA_LOCALE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
