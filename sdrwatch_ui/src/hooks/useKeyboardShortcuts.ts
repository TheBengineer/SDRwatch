import { useEffect } from 'react'

export type ShortcutMap = Record<string, () => void>

const TAGGABLE = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false
  if (TAGGABLE.has(target.tagName)) return true
  if (target.isContentEditable) return true
  return false
}

/**
 * Register global keyboard shortcuts.
 * Skips activation when the focus is inside input/textarea/select
 * or a contenteditable element.
 * Never fires when meta/ctrl/alt is held (browser defaults win).
 */
export function useKeyboardShortcuts(shortcuts: ShortcutMap): void {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (isEditableTarget(e.target)) return

      const handler = shortcuts[e.key]
      if (handler) {
        e.preventDefault()
        handler()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [shortcuts])
}
