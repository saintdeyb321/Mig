import { Component } from 'react';
import { reportDiagnostic } from '../core/errors/diagnostics.js';

export default class ErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { reportDiagnostic('render', error); }
  render() {
    if (this.state.failed) return <div role="alert" className="card"><p>No se pudo mostrar esta pantalla. Tus operaciones locales se conservan.</p><button onClick={() => window.location.reload()}>Volver a cargar</button></div>;
    return this.props.children;
  }
}
