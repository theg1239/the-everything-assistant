declare module 'docx-preview' {
  export function renderAsync(
    arrayBuffer: ArrayBuffer,
    container: HTMLElement,
    styleOptions?: Record<string, unknown> | undefined,
    options?: {
      inWrapper?: boolean
      ignoreWidth?: boolean
      ignoreHeight?: boolean
      className?: string
    }
  ): Promise<void>
}
