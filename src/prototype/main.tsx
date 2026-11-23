// PROTOTYPE ONLY: three UI redesign variants on one dev-only page, switchable via ?variant=A|B|C&screen=login|planner.
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { PrototypeSwitcher, type Screen } from './PrototypeSwitcher'
import { JournalLogin, JournalPlanner } from './VariantA'
import { WorkspaceLogin, WorkspacePlanner } from './VariantB'
import { BentoLogin, BentoPlanner } from './VariantC'

document.body.style.margin = '0'

const variants = [
  { key: 'A', name: 'Travel journal', Login: JournalLogin, Planner: JournalPlanner },
  { key: 'B', name: 'Workspace', Login: WorkspaceLogin, Planner: WorkspacePlanner },
  { key: 'C', name: 'Tropical bento', Login: BentoLogin, Planner: BentoPlanner },
]

function UiPrototype() {
  const params = new URLSearchParams(location.search)
  const [state, setState] = useState({ variant: params.get('variant') ?? 'A', screen: (params.get('screen') ?? 'planner') as Screen })
  const current = variants.find(variant => variant.key === state.variant) ?? variants[0]
  const change = (variant: string, screen: Screen) => {
    history.replaceState(null, '', `?variant=${variant}&screen=${screen}`)
    setState({ variant, screen })
    window.scrollTo(0, 0)
  }
  const View = state.screen === 'login' ? current.Login : current.Planner
  return <>
    <View key={current.key} />
    <PrototypeSwitcher variants={variants} current={current.key} screen={state.screen} onChange={change} />
  </>
}

createRoot(document.getElementById('root')!).render(<StrictMode><UiPrototype /></StrictMode>)
