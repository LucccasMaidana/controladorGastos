/**
 * ============================================================================
 * MOBILE BILLS VIEW (LISTA DE FACTURAS PARA MARIEL)
 * Facturas de servicios con colores oficiales de marca y segundo vencimiento
 * ============================================================================
 */

import { getBillsList, formatCurrency, getServiceBrandStyle } from '../../services/accounting.js?v=13';

export async function renderMobileBillsView(container) {
  const bills = await getBillsList('ALL');
  const pendingBills = bills.filter(b => b.status === 'PENDING');
  const paidBills = bills.filter(b => b.status === 'PAID');

  function formatDateFriendly(dateStr) {
    if (!dateStr) return '—';
    const date = new Date(dateStr + 'T00:00:00');
    return new Intl.DateTimeFormat('es-AR', {
      day: 'numeric',
      month: 'short',
      weekday: 'short'
    }).format(date);
  }

  function getDaysRemainingText(dateStr) {
    if (!dateStr) return '';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dateStr + 'T00:00:00');
    const diffTime = due - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return `<span class="days-pill days-overdue">⚠️ Venció hace ${Math.abs(diffDays)} d</span>`;
    } else if (diffDays === 0) {
      return `<span class="days-pill days-today">⏰ Vence HOY</span>`;
    } else if (diffDays === 1) {
      return `<span class="days-pill days-tomorrow">Vence mañana</span>`;
    } else {
      return `<span class="days-pill days-future">Faltan ${diffDays} días</span>`;
    }
  }

  container.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 16px; padding-bottom: 24px;">
      <!-- Aviso Informativo con Alto Contraste -->
      <div class="bills-info-notice">
        ℹ️ <strong>Aviso:</strong> Estas boletas se cargan desde la PC, este apartado es meramente informativo.
      </div>

      <!-- SECCIÓN FACTURAS PENDIENTES -->
      <div>
        <h3 style="font-size: 14px; font-weight: 800; color: #f59e0b; text-transform: uppercase; margin-bottom: 12px; display: flex; align-items: center; gap: 6px;">
          <span>⚠️</span>
          <span>Boletas por Pagar (${pendingBills.length})</span>
        </h3>

        ${pendingBills.length === 0 ? `
          <div class="all-clear-banner">
            <span>🎉</span>
            <span>¡Excelente! No tienes ninguna factura pendiente de pago.</span>
          </div>
        ` : `
          <div style="display: flex; flex-direction: column; gap: 12px;">
            ${pendingBills.map(bill => {
    const brand = getServiceBrandStyle(bill.service_name);
    return `
              <div class="bill-card-item ${brand.brandKey}">
                <!-- Header con Marca y Estado PENDIENTE -->
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 20px;">${brand.icon}</span>
                    <h4 style="font-size: 16px; font-weight: 800; color: var(--text-main); margin: 0;">${bill.service_name}</h4>
                  </div>
                  <span class="bill-status-pill">
                    PENDIENTE
                  </span>
                </div>
                
                <!-- 1° Vencimiento -->
                <div style="display: flex; justify-content: space-between; align-items: baseline; margin-top: 2px;">
                  <div>
                    <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">1° Vencimiento:</div>
                    <div style="font-size: 13px; font-weight: 700; color: var(--text-main);">📅 ${formatDateFriendly(bill.due_date)}</div>
                  </div>
                  <div style="font-size: 22px; font-weight: 800; color: var(--text-main); font-family: var(--font-mono);">
                    ${formatCurrency(bill.amount)}
                  </div>
                </div>
                <div style="display: flex; justify-content: flex-end; font-size: 11px; margin-top: -4px;">
                  ${getDaysRemainingText(bill.due_date)}
                </div>

                <!-- 2° Vencimiento Opcional -->
                ${(bill.second_due_date || bill.second_amount) ? `
                  <div class="bill-second-due-box">
                    <div>
                      <div style="font-size: 10px; color: #f59e0b; font-weight: 800; text-transform: uppercase;">2° Vencimiento (Recargo):</div>
                      <div style="font-weight: 600; color: var(--text-muted);">📅 ${formatDateFriendly(bill.second_due_date)}</div>
                    </div>
                    <div style="text-align: right;">
                      <div style="font-weight: 800; color: #fbbf24; font-size: 16px; font-family: var(--font-mono);">
                        ${formatCurrency(bill.second_amount || bill.amount)}
                      </div>
                      ${bill.second_due_date ? `<div>${getDaysRemainingText(bill.second_due_date)}</div>` : ''}
                    </div>
                  </div>
                ` : ''}
              </div>
            `;
  }).join('')}
          </div>
        `}
      </div>

      <!-- SECCIÓN FACTURAS YA PAGADAS -->
      ${paidBills.length > 0 ? `
        <div style="margin-top: 10px;">
          <h3 style="font-size: 13px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
            <span>✓</span>
            <span>Boletas Pagadas Recientemente (${paidBills.length})</span>
          </h3>

          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${paidBills.slice(0, 5).map(bill => {
    const brand = getServiceBrandStyle(bill.service_name);
    return `
              <div style="background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 12px 16px; opacity: 0.9;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <span>${brand.icon}</span>
                    <h4 style="font-size: 14px; font-weight: 700; color: var(--text-main);">${bill.service_name}</h4>
                  </div>
                  <span style="font-size: 15px; font-weight: 800; color: var(--color-cash-light);">${formatCurrency(bill.amount)}</span>
                </div>
                <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px; display: flex; justify-content: space-between;">
                  <span>Cubierto por: <strong>${bill.paid_by || 'Usuario'}</strong></span>
                  <span style="color: var(--color-cash-light); font-weight: 700;">✓ PAGADA</span>
                </div>
              </div>
            `;
  }).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}
