import { useId, useState, type Dispatch, type SetStateAction } from 'react'

/**
 * Hydration-safe form state.
 *
 * Server-rendered inputs are interactive before React hydrates. If a user types
 * in that window and the component initialises its state to a hardcoded default,
 * hydration resets the DOM to that default and the typed text is lost. These
 * helpers seed state from the element's live DOM value instead (the element
 * must carry the matching `id`); on the server they return the fallback.
 */

type TextField = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement

const findTextField = (id: string): TextField | null => {
  if (typeof document === 'undefined') return null
  const el = document.getElementById(id)
  return el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement
    ? el
    : null
}

/** The text a user entered into `#id` before hydration, if any. */
export function readPreHydrationValue(id: string): string | undefined {
  const value = findTextField(id)?.value
  return value ? value : undefined
}

/** The checked state of checkbox/radio `#id` as rendered (and possibly toggled) before hydration. */
export function readPreHydrationChecked(id: string): boolean | undefined {
  if (typeof document === 'undefined') return undefined
  const el = document.getElementById(id)
  return el instanceof HTMLInputElement ? el.checked : undefined
}

/** `useState` for a text/textarea/select value that survives typing before hydration. */
export function useHydrationSafeValue(
  id: string,
  fallback = ''
): [string, Dispatch<SetStateAction<string>>] {
  return useState(() => readPreHydrationValue(id) ?? fallback)
}

/** `useState` for a checkbox/radio that survives toggling before hydration. */
export function useHydrationSafeChecked(
  id: string,
  fallback = false
): [boolean, Dispatch<SetStateAction<boolean>>] {
  return useState(() => readPreHydrationChecked(id) ?? fallback)
}

/**
 * Like `useHydrationSafeValue`, but generates the element id with `useId()`
 * (identical on server and client), so it's safe for components rendered more
 * than once on a page. Spread `id` onto the input.
 */
export function useHydrationSafeField(fallback = ''): {
  id: string
  value: string
  setValue: Dispatch<SetStateAction<string>>
} {
  const id = useId()
  const [value, setValue] = useState(() => readPreHydrationValue(id) ?? fallback)
  return { id, value, setValue }
}
