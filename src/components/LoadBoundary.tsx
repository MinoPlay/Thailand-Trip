import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

export class LoadBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('A planner view could not be loaded:', error, info.componentStack)
  }
  render() {
    if (!this.state.failed) return this.props.children
    return <div className="message error" role="alert">
      <p><strong>This view could not load.</strong> Check your connection. Other loaded sections are still available.</p>
      <p>Reconnect and reload to try again. Reloading discards any open, unsaved draft.</p>
      <button onClick={() => { if (confirm('Reload the page? Any unsaved draft will be lost.')) window.location.reload() }}>Reload page</button>
    </div>
  }
}
