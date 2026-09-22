/**
 * ============================================================================
 * MOBILE BILLS VIEW (LISTA DE FACTURAS PARA MARIEL)
 * Facturas de servicios ordenadas por vencimiento próximo
 * ============================================================================
 */

import { getBillsList, formatCurrency } from '../../services/accounting.js?v=12';

export async function renderMobileBillsView(container) {
  const bills = await getBillsList('ALL');
  const pendingBills = bills.filter(b => b.status === 'PENDING');
  const paidBills = bills.filter(b => b.status === 'PAID');

  function formatDateFriendly(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T00:00:00');
    return new Intl.DateTimeFormat('es-AR', {
      day: 'numeric',
      month: 'long',
      weekday: 'short'
    }).format(date);
  }

  function getDaysRemainingText(dateStr) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dateStr + 'T00:00:00');
    const diffTime = due - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return `<span style="color: #f87171; font-weight: 700;">⚠️ Venció hace ${Math.abs(diffDays)} día(s)</span>`;
    } else if (diffDays === 0) {
      return `<span style="color: #fbbf24; font-weight: 700;">⏰ Vence HOY</span>`;
    } else if (diffDays === 1) {
      return `<span style="color: #fde68a; font-weight: 700;">Vence mañana</span>`;
    } else {
      return `<span style="color: #94a3b8;">Faltan ${diffDays} días</span>`;
    }
  }

  container.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 16px;">
      <div style="background: rgba(56, 189, 248, 0.1); border: 1px solid rgba(56, 189, 248, 0.25); border-radius: var(--radius-md); padding: 12px 14px; font-size: 12px; color: #bae6fd;">
        ℹ️ <strong>Aviso:</strong> Estas boletas las carga Lucas desde la PC. Cuando le entregues la plata, él registra el pago y se descuenta solo de tu libreta.
      </div>

      <!-- SECCIÓN FACTURAS PENDIENTES -->
      <div>
        <h3 style="font-size: 14px; font-weight: 800; color: #f59e0b; text-transform: uppercase; margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
          <span>⚠️</span>
          <span>Boletas por Pagar (${pendingBills.length})</span>
        </h3>

        ${pendingBills.length === 0 ? `
          <div class="all-clear-banner">
            <span>🎉</span>
            <span>¡Excelente! No tienes ninguna factura pendiente de pago.</span>
          </div>
        ` : `
          <div style="display: flex; flex-direction: column; gap: 10px;">
            ${pendingBills.map(bill => `
              <div style="background: var(--bg-surface); border: 1.5px solid rgba(245, 158, 11, 0.35); border-radius: var(--radius-lg); padding: 16px 18px; box-shadow: var(--shadow-sm);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                  <h4 style="font-size: 16px; font-weight: 800; color: var(--text-main);">${bill.service_name}</h4>
                  <span style="background: rgba(245, 158, 11, 0.18); color: #fde68a; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: var(--radius-pill);">
                    PENDIENTE
                  </span>
                </div>
                
                <div style="font-size: 26px; font-weight: 800; color: #ffffff; margin-bottom: 8px;">
                  ${formatCurrency(bill.amount)}
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; border-top: 1px solid var(--border-subtle); padding-top: 8px;">
                  <span>📅 Vence: <strong>${formatDateFriendly(bill.due_date)}</strong></span>
                  <div>${getDaysRemainingText(bill.due_date)}</div>
                </div>
              </div>
            `).join('')}
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
            ${paidBills.slice(0, 5).map(bill => `
              <div style="background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 12px 16px; opacity: 0.85;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <h4 style="font-size: 14px; font-weight: 700;">${bill.service_name}</h4>
                  <span style="font-size: 15px; font-weight: 800; color: var(--color-cash-light);">${formatCurrency(bill.amount)}</span>
                </div>
                <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px; display: flex; justify-content: space-between;">
                  <span>Liquidado: Efectivo $${bill.paid_cash_amount || 0} / Digital $${bill.paid_digital_amount || 0}</span>
                  <span style="color: var(--color-cash-light); font-weight: 600;">✓ PAGADA</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}
