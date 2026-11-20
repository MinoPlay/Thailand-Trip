import type { ReactNode } from 'react'

export function ErrorMessage({ children }: { children: ReactNode }) {
  return <div className="message error" role="alert">{children}</div>
}
export function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return <label className={wide ? 'field wide' : 'field'}><span>{label}</span>{children}</label>
}
