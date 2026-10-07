/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  // index.html 提早發出的 getAll 請求，第一次 api.getAll() 接手後清掉
  __mtfPrefetch?: Promise<Response>;
}
