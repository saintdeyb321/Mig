import React from 'react';
import {getRemotionEnvironment, getStaticFiles, Img, staticFile} from 'remotion';
import {capturePath, captures} from './media.mjs';

function Ticket({updated}) {
  return <div className="demo-ui">
    <h2>Ticket</h2>
    <div className="demo-row"><b>Producto de prueba 0</b><span>× {updated ? 2 : 1}</span></div>
    <div className="demo-total"><span>Total a cobrar</span><b>S/ {updated ? '10.00' : '5.00'}</b></div>
  </div>;
}

function Inventory() {
  return <div className="demo-ui">
    <h2>Productos</h2>
    <div className="demo-field">Buscar producto...</div>
    <p>Inventario de la Sede</p>
    {[0, 1].map(id => <div className="demo-row" key={id}>
      <b>Producto de prueba {id}</b><span className="demo-tag">100 disp.</span>
    </div>)}
  </div>;
}

function Reports() {
  return <div className="demo-ui">
    <h2>Dashboard gerencial</h2>
    <span className="demo-tag">Hoy</span>
    <div className="demo-row"><b>Tickets POS</b><span>3</span></div>
    <div className="demo-chart">
      <b>Evolución de ventas</b>
      <div className="chart-bar" />
      <span>04 nov</span>
    </div>
  </div>;
}

function Cash() {
  return <div className="demo-ui">
    <h2>Revisa el conteo</h2>
    <div className="demo-row"><b>Referencia calculada</b><span>S/ 11.00</span></div>
    <div className="demo-row"><b>Dinero contado</b><span>S/ 11.00</span></div>
    <div className="demo-notice">
      <b>Por revisar</b>
      <span>Cuadre provisional. Revísalo con el dueño.</span>
    </div>
  </div>;
}

const recreations = {
  ticket: <Ticket updated={false} />,
  'ticket-updated': <Ticket updated />,
  inventory: <Inventory />,
  reports: <Reports />,
  cash: <Cash />,
};

export function DemoPanel({asset}) {
  const path = capturePath(asset);
  const hasCapture = getStaticFiles().some(file => file.name === path);
  if (!hasCapture && getRemotionEnvironment().isRendering) {
    throw Error(`Falta la captura real: ${path}`);
  }
  const {label, value} = captures[asset];
  return <div className={`demo-panel demo-panel--${asset}`}>
    <div className="demo-caption">
      <i />{hasCapture ? 'Datos de demostración' : 'Recreación · datos de demostración'}
    </div>
    <div className="demo-content">
      {hasCapture ? <Img src={staticFile(path)} alt="Vista de MigaPOS con datos de demostración" />
        : recreations[asset]}
    </div>
    <div className="demo-focus"><span>{label}</span><strong>{value}</strong></div>
  </div>;
}
