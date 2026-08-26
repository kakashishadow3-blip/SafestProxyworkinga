import { ReactNode, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onClose: () => void
  children: ReactNode
  maxWidth?: number
}

/* Shared modal — matches .modal-backdrop / .modal-card styling. */
export default function Modal({ open, onClose, children, maxWidth }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <div
      className={cn('modal-backdrop', open && 'open')}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="modal-card" style={maxWidth ? { maxWidth } : undefined} role="dialog" aria-modal="true">
        {children}
      </div>
    </div>
  )
}
