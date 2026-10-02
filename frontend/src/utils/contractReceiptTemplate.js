// src/utils/contractReceiptTemplate.js

export const generateContractReceiptHTML = (contract, settings, branches = []) => {
  if (!contract) return ''; 

  const company = settings?.companyData || {};
  
  // 1. Datos Fiscales Generales
  const razonSocial = company.razonSocial || "K'prichitos Angie"; 
  const ruc = company.ruc ? `RUC: ${company.ruc}` : '';

  // 2. Determinar Sucursal/Local
  let currentBranch = null;
  let deliveryText = 'Sede Principal';
  let isDelivery = contract.deliveryType === 'domicilio';

  if (isDelivery) {
    deliveryText = `DELIVERY: ${contract.deliveryAddress || ''}`;
  } else {
    currentBranch = (branches || []).find(b => String(b.id) === String(contract.deliveryType));
    if (currentBranch) {
      deliveryText = `RECOJO EN: ${currentBranch.name}`;
    } else {
      deliveryText = 'RECOJO EN: Local';
    }
  }
  
  const direccionImprimir = currentBranch?.address || company.direccion || '';
  const rawTelefono = currentBranch?.phone || company.telefono || '';
  const telefono = rawTelefono ? `Cel/Tel: ${rawTelefono}` : '';

  // 3. Fechas y Formatos 
  const orderDate = contract.createdAt?.toDate ? contract.createdAt.toDate() : new Date(contract.createdAt || Date.now());
  const deliveryDate = contract.deliveryDate?.toDate ? contract.deliveryDate.toDate() : new Date(contract.deliveryDate || Date.now());
  
  const orderDateStr = orderDate.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const deliveryDateStr = deliveryDate.toLocaleDateString('es-PE', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
  const deliveryTimeStr = deliveryDate.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true });

  // 4. Cálculos Financieros
  const total = Number(contract.total) || 0;
  const balance = Number(contract.balance) || 0;
  const deliveryCost = Number(contract.deliveryCost) || 0;
  const abonado = Math.max(0, total - balance);
  
  const safeDetails = contract.details ? String(contract.details).replace(/\n/g, '<br>') : 'Sin detalles adicionales.';

  // 🚀 LÓGICA DE HISTORIAL DE PAGOS PARA TICKET TÉRMICO
  let paymentsListHTML = '';
  if (contract.payments && contract.payments.length > 0) {
    paymentsListHTML += `<div class="divider"></div><div class="text-sm bold" style="margin-bottom: 4px; text-align: center;">--- HISTORIAL DE ABONOS ---</div>`;
    contract.payments.forEach((p, idx) => {
      const pDate = p.date?.toDate ? p.date.toDate() : new Date(p.date || Date.now());
      const pDateStr = pDate.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const isRefund = p.amount < 0;
      const sign = isRefund ? '' : '+';
      const label = p.label || (isRefund ? 'Reembolso' : `Cuota ${idx + 1}`);
      
      paymentsListHTML += `
        <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 2px;">
          <span>${pDateStr} - ${label} (${p.method.toUpperCase()})</span>
          <span style="font-weight: bold;">${sign} S/ ${Math.abs(p.amount).toFixed(2)}</span>
        </div>
      `;
    });
  }

  // 🚀 HTML y CSS 100% Fluido con soporte para imágenes térmicas.
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Ticket de Pedido</title>
      <style>
        * { box-sizing: border-box; }
        @page { margin: 0; } 
        html, body { 
          margin: 0; padding: 0; width: 100%; max-width: 100%;
          font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; 
          font-size: 12px; color: #000; background: #fff;
        }
        .ticket { padding: 4mm; width: 100%; } 
        .center { text-align: center; }
        .bold { font-weight: bold; }
        .text-sm { font-size: 11px; }
        .divider { border-top: 1px dashed #000; margin: 6px 0; }
        .totals-grid { display: table; width: 100%; margin-top: 6px; }
        .totals-row { display: table-row; }
        .totals-label { display: table-cell; text-align: left; padding: 2px 0; }
        .totals-value { display: table-cell; text-align: right; padding: 2px 0; }
        .grand-total { font-size: 15px; font-weight: bold; border-top: 1px solid #000; padding-top: 6px; margin-top: 6px;}
        .details-box { padding: 4px 0; word-break: break-word; }
        .alert-box { border-top: 1px solid #000; border-bottom: 1px solid #000; text-align: center; padding: 4px 0; font-weight: bold; margin: 6px 0; }
        
        /* 🚀 DISEÑO ELEGANTE DE MARCA TIPO INSIGNIA / ROMBO */
        .brand-container {
          text-align: center;
          margin: 15px 0 12px 0;
        }
        .brand-badge {
          display: inline-block;
          padding: 8px 12px;
          border: 2px solid #000;
          position: relative;
        }
        .brand-name {
          font-size: 16px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          margin: 0;
        }
        /* Rombos incrustados en los bordes */
        .brand-badge::before {
          content: '◆';
          position: absolute;
          top: -11px;
          left: 50%;
          transform: translateX(-50%);
          background: #fff;
          padding: 0 4px;
          font-size: 16px;
        }
        .brand-badge::after {
          content: '◆';
          position: absolute;
          bottom: -12px;
          left: 50%;
          transform: translateX(-50%);
          background: #fff;
          padding: 0 4px;
          font-size: 16px;
        }

        /* CLASES PARA LA IMAGEN TÉRMICA */
        .img-container {
          width: 100%;
          margin: 6px 0;
          text-align: center;
        }
        .ticket-img {
          max-width: 90%; 
          height: 120px;
          object-fit: contain;
          filter: grayscale(100%) contrast(120%);
          border: 1px solid #000;
          padding: 2px;
        }
      </style>
    </head>
    <body>
      <div class="ticket">
        
        <div class="brand-container">
          <div class="brand-badge">
            <div class="brand-name">${razonSocial}</div>
          </div>
        </div>

        ${ruc ? `<div class="center bold text-sm">${ruc}</div>` : ''}
        ${currentBranch ? `<div class="center text-sm" style="margin-top: 4px;"><b>Sucursal: ${currentBranch.name}</b></div>` : ''}
        ${direccionImprimir ? `<div class="center text-sm">${direccionImprimir}</div>` : ''}
        ${telefono ? `<div class="center text-sm">${telefono}</div>` : ''}
        
        <div class="alert-box" style="margin-top: 12px;">COMPROBANTE DE PEDIDO</div>
        
        <div class="text-sm">
          <div><span class="bold">PEDIDO ID:</span> ${contract.contractId || 'S/N'}</div>
          <div><span class="bold">CLIENTE:</span> ${contract.clientName || 'Cliente'}</div>
          ${contract.clientPhone ? `<div><span class="bold">CELULAR:</span> ${contract.clientPhone}</div>` : ''}
          <div><span class="bold">PEDIDO EL:</span> ${orderDateStr}</div>
        </div>
        
        <div class="divider"></div>
        <div class="center bold text-sm" style="margin-top: 6px; font-size: 13px;">FECHA DE ENTREGA:</div>
        <div class="center bold" style="margin-bottom: 6px; text-transform: uppercase; font-size: 14px;">
          ${deliveryDateStr}<br>${deliveryTimeStr}
        </div>
        <div class="divider"></div>

        <div class="text-sm bold">DETALLES DEL PRODUCTO:</div>
        <div class="details-box text-sm">${safeDetails}</div>
        
        ${contract.referenceImage ? `
          <div class="img-container">
            <img src="${contract.referenceImage}" class="ticket-img" alt="Ref" />
          </div>
        ` : ''}

        <div class="divider"></div>

        <div class="text-sm bold">MODO DE ENTREGA:</div>
        <div class="text-sm" style="margin-bottom: 6px; text-transform: uppercase;">${deliveryText}</div>
        <div class="divider"></div>

        <div class="totals-grid">
          <div class="totals-row">
            <div class="totals-label text-sm">Costo Base:</div>
            <div class="totals-value text-sm">S/ ${(total - deliveryCost).toFixed(2)}</div>
          </div>
          ${deliveryCost > 0 ? `
          <div class="totals-row">
            <div class="totals-label text-sm">Cargo Delivery:</div>
            <div class="totals-value text-sm">S/ ${deliveryCost.toFixed(2)}</div>
          </div>` : ''}
        </div>

        <div class="totals-grid grand-total" style="border-top: none; margin-top: 0; padding-top: 0;">
          <div class="totals-row">
            <div class="totals-label">TOTAL PEDIDO:</div>
            <div class="totals-value">S/ ${total.toFixed(2)}</div>
          </div>
        </div>

        ${paymentsListHTML}

        <div class="divider"></div>

        <div class="totals-grid" style="margin-top: 2px;">
          <div class="totals-row">
            <div class="totals-label text-sm">Total Abonado:</div>
            <div class="totals-value text-sm">S/ ${abonado.toFixed(2)}</div>
          </div>
        </div>
        <div class="totals-grid grand-total" style="border-top: none; margin-top: 2px; padding-top: 0;">
          <div class="totals-row">
            <div class="totals-label">SALDO A PAGAR:</div>
            <div class="totals-value">S/ ${balance.toFixed(2)}</div>
          </div>
        </div>

        <div class="divider"></div>
        <div class="center bold text-sm" style="margin-top: 10px;">Para recoger su pedido es<br>OBLIGATORIO presentar este ticket.</div>
        <div class="center text-sm" style="margin-top: 4px;">* Revise su producto al retirar.<br>No hay reclamos posteriores.</div>
        <div class="center text-sm" style="margin-top: 8px; color: #555;">Generado por MigaPOS</div>
      </div>
    </body>
    </html>
  `;
};