import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

type RendererErrorBoundaryState = {
  error: Error | null
}

class RendererErrorBoundary extends React.Component<React.PropsWithChildren, RendererErrorBoundaryState> {
  state: RendererErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): RendererErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('TGWR renderer crashed', error, info.componentStack)
  }

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children

    return (
      <main
        data-testid="renderer-error"
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: 32,
          boxSizing: 'border-box'
        }}
      >
        <section style={{ maxWidth: 680, textAlign: 'center' }}>
          <p style={{ color: '#78c8ff', letterSpacing: '0.18em', textTransform: 'uppercase' }}>TGWR</p>
          <h1>Не удалось запустить интерфейс</h1>
          <p style={{ color: '#a9b7c6', lineHeight: 1.6 }}>
            Локальные данные не удалены. Перезапусти приложение; если экран появится снова, передай разработчику текст ошибки ниже.
          </p>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#ffb4b4', overflowWrap: 'anywhere' }}>
            {this.state.error.message}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ marginTop: 12, padding: '10px 18px', cursor: 'pointer' }}
          >
            Перезапустить интерфейс
          </button>
        </section>
      </main>
    )
  }
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <RendererErrorBoundary>
      <App />
    </RendererErrorBoundary>
  </React.StrictMode>
)
