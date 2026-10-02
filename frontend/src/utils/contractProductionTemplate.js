// src/utils/contractProductionTemplate.js

export const generateContractProductionHTML = (contract, settings, branches = []) => {
  if (!contract) return ''; 

  const company = settings?.companyData || {};
  const razonSocial = company.razonSocial || "K'prichitos Angie"; 

  // Determinar Sucursal de Recojo
  let deliveryText = 'Sede Principal';
  if (contract.deliveryType === 'domicilio') {
    deliveryText = `DELIVERY: ${contract.deliveryAddress || ''}`;
  } else {
    const currentBranch = (branches || []).find(b => String(b.id) === String(contract.deliveryType));
    deliveryText = currentBranch ? `RECOJO EN: ${currentBranch.name}` : 'RECOJO EN: Local';
  }

  // Formateo de fechas
  const orderDate = contract.createdAt?.toDate ? contract.createdAt.toDate() : new Date(contract.createdAt || Date.now());
  const deliveryDate = contract.deliveryDate?.toDate ? contract.deliveryDate.toDate() : new Date(contract.deliveryDate || Date.now());
  
  const orderDateStr = orderDate.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
  const deliveryDateStr = deliveryDate.toLocaleDateString('es-PE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const deliveryTimeStr = deliveryDate.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true });

  const safeDetails = contract.details ? String(contract.details).replace(/\n/g, '<br>') : 'Sin especificaciones adicionales.';

  // LÓGICA DE GALERÍA A4
  const images = contract.referenceImages || (contract.referenceImage ? [contract.referenceImage] : []);

  // Calculamos la altura dinámica para que no se desborde la hoja A4 si hay muchas fotos o datos financieros
  let itemHeight = '320px';
  if (images.length === 2) itemHeight = '260px';
  else if (images.length >= 3) itemHeight = '180px';

  // 🚀 LÓGICA DE AUDITORÍA DE CUOTAS PARA EL HTML IMPRESO
  const paymentsHTML = contract.payments && contract.payments.length > 0
    ? contract.payments.map((p, idx) => {
        const pDate = p.date?.toDate ? p.date.toDate() : new Date(p.date || Date.now());
        const pDateStr = pDate.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' }) + ' ' + pDate.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true });
        const isRefund = p.amount < 0;
        
        return `
          <tr>
            <td style="font-weight: bold; color: #334155;">${p.label || (isRefund ? 'REEMBOLSO' : `Cuota ${idx + 1}`)}</td>
            <td style="color: #64748b; font-size: 11px;">${pDateStr}</td>
            <td style="font-size: 11px; text-transform: uppercase; color: #475569;">${p.method}</td>
            <td class="text-right" style="font-weight: bold; color: ${isRefund ? '#b91c1c' : '#15803d'};">
              ${isRefund ? '' : '+'} S/ ${Math.abs(p.amount).toFixed(2)}
            </td>
          </tr>
        `;
      }).join('')
    : `<tr><td colspan="4" style="text-align: center; color: #94a3b8; padding: 20px;">No se registran transacciones.</td></tr>`;

  return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Orden de Producción - ${contract.contractId}</title>
      <style>
        * { box-sizing: border-box; }
        @page { size: A4 portrait; margin: 0; }
        body { margin: 0; padding: 15mm; font-family: 'Segoe UI', sans-serif; font-size: 13px; color: #111; background: #fff; }
        .container { width: 100%; max-width: 850px; margin: 0 auto; }
        .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px; }
        .header-title { font-size: 24px; font-weight: 900; color: #0f172a; margin: 0; letter-spacing: -0.5px; }
        .delivery-banner { background: #fef2f2; border: 2px solid #fecaca; border-radius: 8px; padding: 10px; text-align: center; margin-bottom: 12px; }
        .delivery-date { font-size: 22px; font-weight: 900; color: #b91c1c; text-transform: uppercase; }
        .meta-grid { display: flex; gap: 8px; margin-bottom: 12px; }
        .meta-box { background: #f1f5f9; padding: 8px 10px; border-radius: 8px; flex: 1; border: 1px solid #e2e8f0; }
        .meta-label { font-size: 10px; color: #64748b; font-weight: bold; text-transform: uppercase; display: block; margin-bottom: 2px; }
        .meta-value { font-size: 14px; font-weight: bold; color: #0f172a; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .section-title { font-size: 14px; font-weight: bold; border-bottom: 2px solid #cbd5e1; padding-bottom: 3px; margin-top: 15px; margin-bottom: 8px; color: #1e293b; letter-spacing: 0.5px; }
        .details-content { font-size: 15px; line-height: 1.4; padding: 10px 12px; background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; margin-bottom: 12px; }

        /* 🚀 DISEÑO DE SECCIÓN FINANCIERA EN DOS COLUMNAS */
        .finance-container { display: flex; gap: 12px; margin-bottom: 12px; width: 100%; }
        .finance-summary-box { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; flex: 1; display: flex; flex-direction: column; justify-content: center; }
        .finance-summary-row { display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 12px; }
        .finance-summary-row span { color: #475569; }
        .finance-summary-row strong { color: #0f172a; font-weight: 700; }
        .finance-alert-box { margin-top: 6px; padding: 6px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; font-size: 13px; font-weight: bold; }
        
        .finance-history-box { flex: 1.4; background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; }
        .finance-table { width: 100%; border-collapse: collapse; }
        .finance-table th { background: #f1f5f9; color: #475569; font-size: 10px; font-weight: bold; text-transform: uppercase; padding: 6px 8px; border-bottom: 1px solid #cbd5e1; text-align: left; }
        .finance-table td { padding: 6px 8px; font-size: 12px; border-bottom: 1px dashed #e2e8f0; text-align: left; }
        .finance-table tr:last-child td { border-bottom: none; }
        .text-right { text-align: right !important; }

        /* GALERÍA FLEXBOX PARA A4 */
        .image-gallery { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 5px; justify-content: center; }
        .image-item { flex: 1 1 ${images.length === 1 ? '100%' : '48%'}; height: ${itemHeight}; border: 1px dashed #94a3b8; border-radius: 8px; background: #f8fafc; display: flex; align-items: center; justify-content: center; overflow: hidden; padding: 4px; }
        .image-item img { width: 100%; height: 100%; object-fit: contain; }
        .no-image { padding: 20px; background: #f8fafc; border: 1px dashed #cbd5e1; color: #94a3b8; text-align: center; border-radius: 8px; font-weight: bold; }
        .footer { margin-top: 15px; text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 8px; }
      </style>
    </head>
    <body>
      <div class="container">
        
        <div class="header">
          <div><h1 class="header-title">ORDEN DE PRODUCCIÓN</h1><div style="color:#475569; font-weight:bold; font-size:12px;">${razonSocial}</div></div>
          <div style="text-align: right;"><div class="meta-label">ID PEDIDO</div><div style="font-size: 16px; font-weight: bold; color: #0f172a;">${contract.contractId}</div></div>
        </div>

        <div class="delivery-banner">
          <span class="meta-label">FECHA Y HORA DE ENTREGA CRÍTICA</span>
          <div class="delivery-date">${deliveryDateStr}</div>
          <div style="font-size: 16px; font-weight: bold; color: #991b1b; margin-top: 2px;">⏰ COMPROMISO: ${deliveryTimeStr}</div>
        </div>

        <div class="meta-grid">
          <div class="meta-box"><span class="meta-label">Tomado el</span><span class="meta-value">${orderDateStr}</span></div>
          <div class="meta-box"><span class="meta-label">Cliente</span><span class="meta-value">${contract.clientName}</span></div>
          <div class="meta-box"><span class="meta-label">Contacto</span><span class="meta-value">${contract.clientPhone || 'No registrado'}</span></div>
          <div class="meta-box"><span class="meta-label">Destino Logístico</span><span class="meta-value">${deliveryText}</span></div>
        </div>

        <div class="section-title">📝 ESPECIFICACIONES DE PASTELERÍA</div>
        <div class="details-content">${safeDetails}</div>

        <div class="section-title">💳 CONTROL FINANCIERO Y CUOTAS DE PEDIDO</div>
        <div class="finance-container">
          
          <div class="finance-summary-box">
            <div class="finance-summary-row"><span>Costo Base:</span><strong>S/ ${Number(contract.subtotal || 0).toFixed(2)}</strong></div>
            <div class="finance-summary-row"><span>Cargo Delivery:</span><strong>S/ ${Number(contract.deliveryCost || 0).toFixed(2)}</strong></div>
            <hr style="border:0; border-top: 1px solid #cbd5e1; margin: 4px 0;" />
            <div class="finance-summary-row" style="font-size: 13px;"><strong>TOTAL PEDIDO:</strong><strong>S/ ${Number(contract.total || 0).toFixed(2)}</strong></div>
            <div class="finance-summary-row"><span style="color: #166534; font-weight: bold;">Total Pagado:</span><strong style="color: #166534;">S/ ${Number(contract.total - contract.balance).toFixed(2)}</strong></div>
            
            <div class="finance-alert-box" style="
              background: ${contract.balance > 0 ? '#fef2f2' : '#f0fdf4'}; 
              color: ${contract.balance > 0 ? '#991b1b' : '#166534'};
              border: 1px solid ${contract.balance > 0 ? '#fca5a5' : '#bbf7d0'};
            ">
              <span>${contract.balance > 0 ? 'SALDO PENDIENTE:' : 'ESTADO:'}</span>
              <span>${contract.balance > 0 ? `S/ ${Number(contract.balance).toFixed(2)}` : 'TOTALMENTE PAGADO ✅'}</span>
            </div>
          </div>

          <div class="finance-history-box">
            <table class="finance-table">
              <thead>
                <tr>
                  <th>Transación</th>
                  <th>Fecha y Hora</th>
                  <th>Método</th>
                  <th class="text-right">Monto</th>
                </tr>
              </thead>
              <tbody>
                ${paymentsHTML}
              </tbody>
            </table>
          </div>

        </div>

        <div class="section-title">📸 REFERENCIAS VISUALES DE DISEÑO</div>
        ${images.length > 0 ? `
          <div class="image-gallery">
            ${images.map(img => `
              <div class="image-item">
                <img src="${img}" alt="Referencia Visual" />
              </div>
            `).join('')}
          </div>
        ` : `<div class="no-image">Sin imágenes de referencia adjuntas al pedido.</div>`}

        <div class="footer">Comprobante de Orden de Producción</div>
      </div>
    </div>
  </body>
  </html>
  `;
};

export const generateContractTextOnlyHTML = (contract, settings, branches = []) => {
  if (!contract) return ''; 

  const company = settings?.companyData || {};
  const razonSocial = company.razonSocial || "K'prichitos Angie"; 

  // Determinar Sucursal de Recojo
  let deliveryText = 'Sede Principal';
  if (contract.deliveryType === 'domicilio') {
    deliveryText = `DELIVERY: ${contract.deliveryAddress || ''}`;
  } else {
    const currentBranch = (branches || []).find(b => String(b.id) === String(contract.deliveryType));
    deliveryText = currentBranch ? `RECOJO EN: ${currentBranch.name}` : 'RECOJO EN: Local';
  }

  // Formateo de fechas
  const orderDate = contract.createdAt?.toDate ? contract.createdAt.toDate() : new Date(contract.createdAt || Date.now());
  const deliveryDate = contract.deliveryDate?.toDate ? contract.deliveryDate.toDate() : new Date(contract.deliveryDate || Date.now());
  
  const orderDateStr = orderDate.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
  const deliveryDateStr = deliveryDate.toLocaleDateString('es-PE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const deliveryTimeStr = deliveryDate.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true });

  const safeDetails = contract.details ? String(contract.details).replace(/\n/g, '<br>') : 'Sin especificaciones.';

  // 🚀 LÓGICA DE AUDITORÍA DE CUOTAS PARA EL HTML IMPRESO (Mismo que el completo)
  const paymentsHTML = contract.payments && contract.payments.length > 0
    ? contract.payments.map((p, idx) => {
        const pDate = p.date?.toDate ? p.date.toDate() : new Date(p.date || Date.now());
        const pDateStr = pDate.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' }) + ' ' + pDate.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true });
        const isRefund = p.amount < 0;
        
        return `
          <tr>
            <td style="font-weight: bold; color: #334155;">${p.label || (isRefund ? 'REEMBOLSO' : `Cuota ${idx + 1}`)}</td>
            <td style="color: #64748b; font-size: 11px;">${pDateStr}</td>
            <td style="font-size: 11px; text-transform: uppercase; color: #475569;">${p.method}</td>
            <td class="text-right" style="font-weight: bold; color: ${isRefund ? '#b91c1c' : '#15803d'};">
              ${isRefund ? '' : '+'} S/ ${Math.abs(p.amount).toFixed(2)}
            </td>
          </tr>
        `;
      }).join('')
    : `<tr><td colspan="4" style="text-align: center; color: #94a3b8; padding: 20px;">No se registran transacciones.</td></tr>`;

  return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Orden de Horneado - ${contract.contractId}</title>
      <style>
        * { box-sizing: border-box; }
        @page { size: A4 portrait; margin: 0; } 
        body { margin: 0; padding: 15mm; font-family: 'Segoe UI', sans-serif; font-size: 13px; color: #111; background: #fff; }
        .container { width: 100%; max-width: 850px; margin: 0 auto; }
        .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px; }
        .header-title { font-size: 24px; font-weight: 900; color: #0f172a; margin: 0; letter-spacing: -0.5px; }
        .delivery-banner { background: #fef2f2; border: 2px solid #fecaca; border-radius: 8px; padding: 10px; text-align: center; margin-bottom: 12px; }
        .delivery-date { font-size: 22px; font-weight: 900; color: #b91c1c; text-transform: uppercase; }
        .meta-grid { display: flex; gap: 8px; margin-bottom: 12px; }
        .meta-box { background: #f1f5f9; padding: 8px 10px; border-radius: 8px; flex: 1; border: 1px solid #e2e8f0; }
        .meta-label { font-size: 10px; color: #64748b; font-weight: bold; text-transform: uppercase; display: block; margin-bottom: 2px; }
        .meta-value { font-size: 14px; font-weight: bold; color: #0f172a; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .section-title { font-size: 14px; font-weight: bold; border-bottom: 2px solid #cbd5e1; padding-bottom: 3px; margin-top: 15px; margin-bottom: 8px; color: #1e293b; letter-spacing: 0.5px; }
        .details-content { font-size: 15px; line-height: 1.4; padding: 10px 12px; background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; margin-bottom: 12px; }

        /* 🚀 DISEÑO DE SECCIÓN FINANCIERA EN DOS COLUMNAS IDÉNTICO A LA ORDEN COMPLETA */
        .finance-container { display: flex; gap: 12px; margin-bottom: 12px; width: 100%; }
        .finance-summary-box { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; flex: 1; display: flex; flex-direction: column; justify-content: center; }
        .finance-summary-row { display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 12px; }
        .finance-summary-row span { color: #475569; }
        .finance-summary-row strong { color: #0f172a; font-weight: 700; }
        .finance-alert-box { margin-top: 6px; padding: 6px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; font-size: 13px; font-weight: bold; }
        
        .finance-history-box { flex: 1.4; background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; }
        .finance-table { width: 100%; border-collapse: collapse; }
        .finance-table th { background: #f1f5f9; color: #475569; font-size: 10px; font-weight: bold; text-transform: uppercase; padding: 6px 8px; border-bottom: 1px solid #cbd5e1; text-align: left; }
        .finance-table td { padding: 6px 8px; font-size: 12px; border-bottom: 1px dashed #e2e8f0; text-align: left; }
        .finance-table tr:last-child td { border-bottom: none; }
        .text-right { text-align: right !important; }

        .footer { margin-top: 15px; text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 8px; }
      </style>
    </head>
    <body>
      <div class="container">
        
        <div class="header">
          <div><h1 class="header-title">ORDEN DE HORNEADO (MASA)</h1><div style="color:#475569; font-weight:bold; font-size:12px;">${razonSocial}</div></div>
          <div style="text-align: right;"><div class="meta-label">ID PEDIDO</div><div style="font-size: 16px; font-weight: bold; color: #0f172a;">${contract.contractId}</div></div>
        </div>

        <div class="delivery-banner">
          <span class="meta-label">FECHA Y HORA DE ENTREGA CRÍTICA</span>
          <div class="delivery-date">${deliveryDateStr}</div>
          <div style="font-size: 16px; font-weight: bold; color: #991b1b; margin-top: 2px;">⏰ COMPROMISO: ${deliveryTimeStr}</div>
        </div>

        <div class="meta-grid">
          <div class="meta-box"><span class="meta-label">Tomado el</span><span class="meta-value">${orderDateStr}</span></div>
          <div class="meta-box"><span class="meta-label">Cliente</span><span class="meta-value">${contract.clientName}</span></div>
          <div class="meta-box"><span class="meta-label">Contacto</span><span class="meta-value">${contract.clientPhone || 'No registrado'}</span></div>
          <div class="meta-box"><span class="meta-label">Destino Logístico</span><span class="meta-value">${deliveryText}</span></div>
        </div>

        <div class="section-title">📝 ESPECIFICACIONES DE PASTELERÍA</div>
        <div class="details-content">${safeDetails}</div>

        <div class="section-title">💳 CONTROL FINANCIERO Y CUOTAS DE PEDIDO</div>
        <div class="finance-container">
          
          <div class="finance-summary-box">
            <div class="finance-summary-row"><span>Costo Base:</span><strong>S/ ${Number(contract.subtotal || 0).toFixed(2)}</strong></div>
            <div class="finance-summary-row"><span>Cargo Delivery:</span><strong>S/ ${Number(contract.deliveryCost || 0).toFixed(2)}</strong></div>
            <hr style="border:0; border-top: 1px solid #cbd5e1; margin: 4px 0;" />
            <div class="finance-summary-row" style="font-size: 13px;"><strong>TOTAL PEDIDO:</strong><strong>S/ ${Number(contract.total || 0).toFixed(2)}</strong></div>
            <div class="finance-summary-row"><span style="color: #166534; font-weight: bold;">Total Pagado:</span><strong style="color: #166534;">S/ ${Number(contract.total - contract.balance).toFixed(2)}</strong></div>
            
            <div class="finance-alert-box" style="
              background: ${contract.balance > 0 ? '#fef2f2' : '#f0fdf4'}; 
              color: ${contract.balance > 0 ? '#991b1b' : '#166534'};
              border: 1px solid ${contract.balance > 0 ? '#fca5a5' : '#bbf7d0'};
            ">
              <span>${contract.balance > 0 ? 'SALDO PENDIENTE:' : 'ESTADO:'}</span>
              <span>${contract.balance > 0 ? `S/ ${Number(contract.balance).toFixed(2)}` : 'TOTALMENTE PAGADO ✅'}</span>
            </div>
          </div>

          <div class="finance-history-box">
            <table class="finance-table">
              <thead>
                <tr>
                  <th>Transación</th>
                  <th>Fecha y Hora</th>
                  <th>Método</th>
                  <th class="text-right">Monto</th>
                </tr>
              </thead>
              <tbody>
                ${paymentsHTML}
              </tbody>
            </table>
          </div>

        </div>

        <div class="footer">Nota: Las fotos de referencia se encuentran exclusivamente en la Orden de Producción Principal. | Documento interno generado por MigaPOS.</div>
      </div>
    </body>
    </html>
  `;
};