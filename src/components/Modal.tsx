import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const content = useRef<HTMLDivElement>(null)
  const initialForm = useRef<string | null>(null)
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const form = content.current?.querySelector('form')
      if (form) initialForm.current = signature(form)
    })
    return () => cancelAnimationFrame(frame)
  }, [])
  function close() {
    const form = content.current?.querySelector('form')
    if (form && initialForm.current !== null && signature(form) !== initialForm.current && !window.confirm('Discard your unsaved changes?')) return
    onClose()
  }
  return <Dialog.Root open onOpenChange={open => { if (!open) close() }}>
    <Dialog.Portal>
      <Dialog.Overlay className="dialog-overlay" />
      <Dialog.Content ref={content} className="dialog-content" onInteractOutside={event => event.preventDefault()}>
        <div className="dialog-heading">
          <div><Dialog.Title>{title}</Dialog.Title><Dialog.Description>Changes are shared with everyone on this trip.</Dialog.Description></div>
          <button type="button" className="icon-button" aria-label="Close dialog" onClick={close}><X size={20} /></button>
        </div>
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}

function signature(form: HTMLFormElement) {
  return JSON.stringify([...new FormData(form).entries()].map(([key, value]) => [
    key,
    value instanceof File ? [value.name, value.size, value.type, value.lastModified] : value,
  ]))
}
