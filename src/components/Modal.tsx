import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return <Dialog.Root open onOpenChange={open => { if (!open) onClose() }}>
    <Dialog.Portal>
      <Dialog.Overlay className="dialog-overlay" />
      <Dialog.Content className="dialog-content" onInteractOutside={event => event.preventDefault()}>
        <div className="dialog-heading">
          <div><Dialog.Title>{title}</Dialog.Title><Dialog.Description>Changes are shared with everyone on this trip.</Dialog.Description></div>
          <Dialog.Close className="icon-button" aria-label="Close dialog"><X size={20} /></Dialog.Close>
        </div>
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}
