import { useEffect, type RefObject } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',')

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => {
    return element.getAttribute('aria-hidden') !== 'true' && element.getClientRects().length > 0
  })
}

export function useDialogFocusTrap(
  active: boolean,
  containerRef: RefObject<HTMLElement>,
  initialFocusRef?: RefObject<HTMLElement>,
  onEscape?: () => void,
  refreshKey?: unknown
): void {
  useEffect(() => {
    if (!active) return

    const container = containerRef.current
    if (!container) return

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    let preferredFocusTimer: number | undefined
    const focusTimer = window.setTimeout(() => {
      const preferred = initialFocusRef?.current
      const first = focusableElements(container)[0]
      const target = preferred
        ? preferred.hasAttribute('disabled')
          ? container
          : preferred
        : first ?? container
      target.focus()

      if (preferred?.hasAttribute('disabled')) {
        let attempts = 0
        preferredFocusTimer = window.setInterval(() => {
          attempts += 1
          const currentPreferred = initialFocusRef?.current
          if ((!currentPreferred || currentPreferred.hasAttribute('disabled')) && attempts < 60) return
          window.clearInterval(preferredFocusTimer)
          preferredFocusTimer = undefined
          if (currentPreferred && !currentPreferred.hasAttribute('disabled') && document.activeElement === container) {
            currentPreferred.focus()
          }
        }, 80)
      }
    }, 0)

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && onEscape) {
        event.preventDefault()
        onEscape()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = focusableElements(container)
      if (focusable.length === 0) {
        event.preventDefault()
        container.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const current = document.activeElement
      if (event.shiftKey && (current === first || !container.contains(current))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (current === last || !container.contains(current))) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      if (preferredFocusTimer !== undefined) window.clearInterval(preferredFocusTimer)
      document.removeEventListener('keydown', onKeyDown)
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [active, containerRef, initialFocusRef, onEscape, refreshKey])
}
