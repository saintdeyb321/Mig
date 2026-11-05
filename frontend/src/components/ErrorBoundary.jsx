import { Button, Card } from "../shared/ui";
import { Component } from 'react';
import { reportDiagnostic } from '../core/errors/diagnostics.js';
export default class ErrorBoundary extends Component {
  state = {
    failed: false
  };
  static getDerivedStateFromError() {
    return {
      failed: true
    };
  }
  componentDidCatch(error) {
    reportDiagnostic('render', error);
  }
  render() {
    if (this.state.failed) return <Card role="alert" as="div"><p>No se pudo mostrar esta pantalla. Tus operaciones locales se conservan.</p><Button onClick={() => window.location.reload()} type="button" variant="secondary">Volver a cargar</Button></Card>;
    return this.props.children;
  }
}
