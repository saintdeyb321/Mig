// src/utils/contractReceiptTemplate.js

export const generateReceiptHTML = (saleData, settings, currentBranch = null) => {
  const company = settings?.companyData || {};
  
  // 1. Datos Fiscales Generales
  const razonSocial = company.razonSocial || 'Mi Negocio';
  const ruc = company.ruc ? `RUC: ${company.ruc}` : '';

  // 2. Lógica Inteligente de Sucursal (Prioridad a la sede actual)
  const isBranchSelected = currentBranch && currentBranch !== 'global' && currentBranch.id !== 'global';
  
  const nombreSucursal = isBranchSelected ? `Sucursal: ${currentBranch.name}` : '';
  
  const direccionImprimir = isBranchSelected && currentBranch.address 
    ? currentBranch.address 
    : (company.direccion || '');
    
  // Lee el teléfono de la sucursal (soporta 'phone' o 'telefono'). Si está vacío, usa el general.
  const rawTelefono = isBranchSelected && (currentBranch.phone || currentBranch.telefono) 
    ? (currentBranch.phone || currentBranch.telefono) 
    : company.telefono;
    
  const telefono = rawTelefono ? `Cel/Tel: ${rawTelefono}` : '';

  // 3. Fechas y Formatos
  const saleDate = saleData.date?.toDate ? saleData.date.toDate() : new Date(saleData.date || Date.now());
  const dateStr = saleDate.toLocaleDateString('es-PE');
  const timeStr = saleDate.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });

  const itemsHTML = saleData.items.map(i => `
    <tr>
      <td class="col-qty">${i.qty}</td>
      <td class="col-desc">${i.name}</td>
      <td class="col-total">S/ ${(i.price * i.qty).toFixed(2)}</td>
    </tr>
  `).join('');

  // 🚀 HTML y CSS 100% Fluido. Se adapta a la Escala del navegador.
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Ticket de Venta</title>
      <style>
        * { box-sizing: border-box; }
        
        /* 🚀 Le quitamos el 'size' para que el Driver de la impresora mande */
        @page { margin: 0; } 
        
        html, body { 
          margin: 0; 
          padding: 0; 
          width: 100%; /* 🚀 Ocupa todo el ancho que le de el navegador */
          max-width: 100%;
          font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; 
          font-size: 12px; /* Tamaño intermedio perfecto */
          color: #000;
          background: #fff;
        }
        
        /* Un pequeño padding para que las letras no choquen con el borde físico del papel */
        .ticket { padding: 4mm; width: 100%; } 
        
        .center { text-align: center; }
        .bold { font-weight: bold; }
        .text-sm { font-size: 11px; }
        
        .divider { 
          border-top: 1px dashed #000; 
          margin: 6px 0; 
        }

        table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
        th { font-size: 11px; border-bottom: 1px dashed #000; padding-bottom: 4px; text-align: left; }
        td { padding-top: 4px; vertical-align: top; }
        
        .col-qty { width: 15%; text-align: center; font-weight: bold; }
        .col-desc { width: 60%; padding-left: 4px; padding-right: 4px; word-break: break-word; }
        .col-total { width: 25%; text-align: right; }

        .totals-grid { display: table; width: 100%; margin-top: 6px; }
        .totals-row { display: table-row; }
        .totals-label { display: table-cell; text-align: left; padding: 2px 0; }
        .totals-value { display: table-cell; text-align: right; padding: 2px 0; }
        
        .grand-total { font-size: 15px; font-weight: bold; border-top: 1px solid #000; padding-top: 6px; margin-top: 6px;}
      </style>
    </head>
    <body>
      <div class="ticket">
        
        <div class="center bold" style="font-size: 15px; margin-bottom: 4px; text-transform: uppercase;">
          ${razonSocial}
        </div>
        ${ruc ? `<div class="center bold text-sm">${ruc}</div>` : ''}
        
        ${nombreSucursal ? `<div class="center text-sm" style="margin-top: 4px;"><b>${nombreSucursal}</b></div>` : ''}
        ${direccionImprimir ? `<div class="center text-sm">${direccionImprimir}</div>` : ''}
        ${telefono ? `<div class="center text-sm">${telefono}</div>` : ''}
        
        <div class="divider"></div>
        
        <div class="text-sm">
          <div><span class="bold">TICKET:</span> ${saleData.localId ? saleData.localId.substring(0,8).toUpperCase() : '000001'}</div>
          <div><span class="bold">FECHA:</span> ${dateStr} ${timeStr}</div>
        </div>
        
        <div class="divider"></div>

        <table>
          <thead>
            <tr>
              <th class="col-qty">CANT</th>
              <th class="col-desc">DESCRIPCIÓN</th>
              <th class="col-total" style="text-align: right;">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHTML}
          </tbody>
        </table>

        <div class="divider"></div>
        <div class="totals-grid">
          <div class="totals-row">
            <div class="totals-label text-sm">Método de Pago:</div>
            <div class="totals-value text-sm" style="text-transform: uppercase;">${saleData.payment || 'EFECTIVO'}</div>
          </div>
          
          ${/* 🚀 LÓGICA DE IMPRESIÓN DINÁMICA DE PAGOS */ ''}
          ${saleData.payment === 'mixto' && saleData.splitPayments ? `
            <div class="totals-row">
              <div class="totals-label text-sm" style="padding-left: 8px;">• Efectivo:</div>
              <div class="totals-value text-sm">S/ ${Number(saleData.splitPayments.efectivo).toFixed(2)}</div>
            </div>
            <div class="totals-row">
              <div class="totals-label text-sm" style="padding-left: 8px;">• Yape/Plin:</div>
              <div class="totals-value text-sm">S/ ${Number(saleData.splitPayments.yape).toFixed(2)}</div>
            </div>
          ` : saleData.payment === 'efectivo' && saleData.amountPaid != null ? `
            <div class="totals-row">
              <div class="totals-label text-sm">Recibido:</div>
              <div class="totals-value text-sm">S/ ${Number(saleData.amountPaid).toFixed(2)}</div>
            </div>
            <div class="totals-row">
              <div class="totals-label text-sm">Vuelto:</div>
              <div class="totals-value text-sm">S/ ${Number(saleData.change).toFixed(2)}</div>
            </div>
          ` : ''}
        </div>

        <div class="totals-grid grand-total">
          <div class="totals-row">
            <div class="totals-label">TOTAL:</div>
            <div class="totals-value">S/ ${Number(saleData.total).toFixed(2)}</div>
          </div>
        </div>

        <div class="divider"></div>
        <div class="center bold text-sm" style="margin-top: 10px;">
          ¡Gracias por su preferencia!
        </div>
        <div class="center text-sm" style="margin-top: 4px; color: #555;">
           Generado por MigaPOS
        </div>
        
      </div>
    </body>
    </html>
  `;
};