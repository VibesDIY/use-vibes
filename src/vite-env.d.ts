/// <reference types="vite/client" />

interface ImportMeta {
  readonly glob: <T>(glob: string, options?: { as?: string; eager?: boolean }) => Record<string, T>;
}
