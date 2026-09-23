/**
 * ============================================================================
 * MOBILE HISTORY VIEW (HISTORIAL CRONOLÓGICO DE MOVIMIENTOS)
 * Filtros rápidos: [ Todos ] | [ Solo Billetes ] | [ Solo Digital ]
 * ============================================================================
 */

import { getTransactions, formatCurrency } from '../../services/accounting.js?v=12';

let activeHistoryFilter = 'ALL'; // 'ALL', 'CASH', 'DIGITAL'

export async function renderMobileHistoryView(container, userName = null) {
  const transactions = await getTransactions(userName, activeHistoryFilter);

  // Agrupar por fecha local (AAAA-MM-DD)
  const grouped = {};
  transactions.forEach(tx => {
    const dayKey = tx.date.split('T')[0];
    if (!grouped[dayKey]) grouped[dayKey] = [];
    grouped[dayKey].push(tx);
  });

  const sortedDays = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));

  function formatDayTitle(dayKey) {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    if (dayKey === today) return 'Hoy';
    if (dayKey === yesterday) return 'Ayer';

    const d = new Date(dayKey + 'T00:00:00');
    return new Intl.DateTimeFormat('es-AR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    }).format(d);
  }

  function formatTime(isoStr) {
    const d = new Date(isoStr);
    return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  }

  container.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 14px;">
      <!-- Filtros Rápidos -->
      <div style="display: flex; background: var(--bg-surface); padding: 4px; border-radius: var(--radius-pill); border: 1px solid var(--border-subtle); gap: 4px;">
        <button type="button" class="view-btn ${activeHistoryFilter === 'ALL' ? 'active' : ''}" id="filter-all" style="flex: 1; justify-content: center;">
          Todos
        </button>
        <button type="button" class="view-btn ${activeHistoryFilter === 'CASH' ? 'active' : ''}" id="filter-cash" style="flex: 1; justify-content: center;">
          💵 Billetes
        </button>
        <button type="button" class="view-btn ${activeHistoryFilter === 'DIGITAL' ? 'active' : ''}" id="filter-digital" style="flex: 1; justify-content: center;">
          💳 Digital
        </button>
      </div>

      <!-- Lista de Movimientos agrupados por día -->
      ${sortedDays.length === 0 ? `
        <div style="text-align: center; padding: 40px 20px; color: var(--text-muted);">
          <div style="font-size: 38px; margin-bottom: 10px;">📋</div>
          <p style="font-size: 14px; font-weight: 600;">Aún no hay movimientos registrados en esta categoría.</p>
        </div>
      ` : `
        <div style="display: flex; flex-direction: column; gap: 18px;">
          ${sortedDays.map(day => `
            <div>
              <div style="font-size: 12px; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; padding-left: 4px;">
                ${formatDayTitle(day)}
              </div>

              <div style="display: flex; flex-direction: column; gap: 8px;">
                ${grouped[day].map(tx => {
                  const isIncome = tx.type === 'INCOME';
                  const isCash = tx.wallet_type === 'CASH';
                  return `
                    <div class="tx-card-mini">
                      <div class="tx-left">
                        <div class="tx-icon-pill ${isIncome ? 'income' : 'expense'}">
                          ${isIncome ? '↓' : '↑'}
                        </div>
                        <div class="tx-info">
                          <h4>${tx.category}</h4>
                          <p>
                            <span>${formatTime(tx.date)}</span> • 
                            <span style="font-weight: 600; color: ${isCash ? 'var(--color-cash-light)' : 'var(--color-digital-light)'};">
                              ${isCash ? '💵 Billete' : '💳 Digital'}
                            </span>
                            ${tx.note ? ` • <em>"${tx.note}"</em>` : ''}
                          </p>
                        </div>
                      </div>
                      <div class="tx-amount ${isIncome ? 'income' : 'expense'}">
                        ${isIncome ? '+' : '-'}${formatCurrency(tx.amount)}
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      `}
    </div>
  `;

  // Listeners de filtro
  document.getElementById('filter-all')?.addEventListener('click', () => {
    activeHistoryFilter = 'ALL';
    renderMobileHistoryView(container, userName);
  });
  document.getElementById('filter-cash')?.addEventListener('click', () => {
    activeHistoryFilter = 'CASH';
    renderMobileHistoryView(container, userName);
  });
  document.getElementById('filter-digital')?.addEventListener('click', () => {
    activeHistoryFilter = 'DIGITAL';
    renderMobileHistoryView(container, userName);
  });
}
