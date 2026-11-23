// PROTOTYPE ONLY: floating bar to flip between redesign variants and screens.
import { useEffect } from 'react'

export interface VariantInfo { key: string; name: string }
export type Screen = 'login' | 'planner'

export function PrototypeSwitcher({ variants, current, screen, onChange }: { variants: VariantInfo[]; current: string; screen: Screen; onChange: (variant: string, screen: Screen) => void }) {
  const index = Math.max(0, variants.findIndex(variant => variant.key === current))
  const cycle = (step: number) => onChange(variants[(index + step + variants.length) % variants.length].key, screen)
  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return
      if (event.key === 'ArrowLeft') cycle(-1)
      if (event.key === 'ArrowRight') cycle(1)
    }
    window.addEventListener('keydown', keyDown)
    return () => window.removeEventListener('keydown', keyDown)
  })
  return <div style={{ position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, display: 'flex', alignItems: 'center', gap: 6, padding: 6, background: '#111', color: '#fff', borderRadius: 999, boxShadow: '0 8px 30px #0006', font: '600 13px system-ui, sans-serif' }}>
    <button style={pill} aria-label="Previous variant" onClick={() => cycle(-1)}>←</button>
    <span style={{ padding: '0 8px', whiteSpace: 'nowrap' }}>{variants[index].key} · {variants[index].name}</span>
    <button style={pill} aria-label="Next variant" onClick={() => cycle(1)}>→</button>
    <span style={{ width: 1, height: 20, background: '#444' }} />
    {(['login', 'planner'] as const).map(option => <button key={option} style={{ ...pill, background: screen === option ? '#fff' : 'transparent', color: screen === option ? '#111' : '#fff' }} onClick={() => onChange(current, option)}>{option}</button>)}
  </div>
}
const pill: React.CSSProperties = { border: 0, borderRadius: 999, padding: '6px 12px', background: '#2a2a2a', color: '#fff', font: 'inherit', cursor: 'pointer' }
