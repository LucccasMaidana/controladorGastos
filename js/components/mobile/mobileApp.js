/**
 * ============================================================================
 * MOBILE APP COMPONENT (INTERFAZ DE MARIEL)
 * Vista principal con navegación accesible y actualización en tiempo real
 * ============================================================================
 */

import { getFinancialSummary, getTransactions, formatCurrency, onAccountingChange } from '../../services/accounting.js';
import { openKeypadModal } from './keypadModal.js';
import { renderMobileBillsView } from './billsView.js';
import { renderMobileHistoryView } from './historyView.js';

let currentTab = 'DASHBOARD'; // 'DASHBOARD', 'BILLS', 'HISTORY'

export function initMobileApp(rootElement) {
  // Suscribirse a cambios contables para refrescar automáticamente la pantalla de Mariel
  onAccountingChange(() => {
    renderCurrentTab();
  });

  renderMobileAppShell(rootElement);
  renderCurrentTab();
}

function renderMobileAppShell(rootElement) {
  rootElement.innerHTML = `
    <div class="mobile-app-container">
      <!-- Encabezado de Bienvenida -->
      <div class="mobile-header">
        <div class="mobile-user-greeting">
          <span class="app-name">Libreta Contable</span>
          <h2 class="user-title">Hola, Mariel 👋</h2>
        </div>
        <div class="mobile-sync-icon" id="mobile-header-sync" title="Estado de la app">
          🟢
        </div>
      </div>

      <!-- Área de Contenido con Scroll -->
      <div class="mobile-content-area" id="mobile-tab-content">
        <!-- Render dinámico según pestaña activa -->
      </div>

      <!-- Barra de Botones de Acción Gigantes (Fijos abajo) -->
      <div class="mobile-fixed-bottom-actions">
        <button type="button" class="btn-giant-action btn-income-action" id="btn-quick-income">
          <span style="font-size: 24px;">＋</span>
          <span>Anotar Cobro</span>
        </button>
        <button type="button" class="btn-giant-action btn-expense-action" id="btn-quick-expense">
          <span style="font-size: 24px;">－</span>
          <span>Anotar Gasto</span>
        </button>
      </div>

      <!-- Barra de Navegación Inferior -->
      <div class="mobile-nav-bar">
        <button type="button" class="nav-tab-btn ${currentTab === 'DASHBOARD' ? 'active' : ''}" id="nav-tab-dashboard">
          <span class="tab-icon">🏠</span>
          <span>Inicio</span>
        </button>
        <button type="button" class="nav-tab-btn ${currentTab === 'BILLS' ? 'active' : ''}" id="nav-tab-bills">
          <span class="tab-icon">🧾</span>
          <span id="nav-bills-label">Facturas</span>
        </button>
        <button type="button" class="nav-tab-btn ${currentTab === 'HISTORY' ? 'active' : ''}" id="nav-tab-history">
          <span class="tab-icon">📋</span>
          <span>Historial</span>
        </button>
      </div>

      <!-- Contenedor del Modal del Teclado Numérico -->
      <div id="keypad-modal-root"></div>
    </div>
  `;

  // Listeners de navegación de pestañas
  document.getElementById('nav-tab-dashboard').addEventListener('click', () => switchTab('DASHBOARD'));
  document.getElementById('nav-tab-bills').addEventListener('click', () => switchTab('BILLS'));
  document.getElementById('nav-tab-history').addEventListener('click', () => switchTab('HISTORY'));

  // Listeners de botones gigantes
  document.getElementById('btn-quick-income').addEventListener('click', () => {
    openKeypadModal('INCOME');
  });
  document.getElementById('btn-quick-expense').addEventListener('click', () => {
    openKeypadModal('EXPENSE');
  });
}

function switchTab(tabName) {
  currentTab = tabName;
  document.querySelectorAll('.nav-tab-btn').forEach(btn => btn.classList.remove('active'));
  
  if (tabName === 'DASHBOARD') document.getElementById('nav-tab-dashboard')?.classList.add('active');
  if (tabName === 'BILLS') document.getElementById('nav-tab-bills')?.classList.add('active');
  if (tabName === 'HISTORY') document.getElementById('nav-tab-history')?.classList.add('active');

  renderCurrentTab();
}

async function renderCurrentTab() {
  const container = document.getElementById('mobile-tab-content');
  if (!container) return;

  const summary = await getFinancialSummary();

  // Actualizar badge en la pestaña de facturas
  const billsLabel = document.getElementById('nav-bills-label');
  if (billsLabel) {
    billsLabel.innerHTML = summary.pendingBillsCount > 0 
      ? `Facturas <span style="background: #f59e0b; color: #000; padding: 1px 6px; border-radius: 10px; font-size: 10px; font-weight: 800;">${summary.pendingBillsCount}</span>` 
      : 'Facturas';
  }

  if (currentTab === 'BILLS') {
    await renderMobileBillsView(container);
  } else if (currentTab === 'HISTORY') {
    await renderMobileHistoryView(container);
  } else {
    // DASHBOARD PRINCIPAL
    const recentTx = (await getTransactions('ALL')).slice(0, 3);

    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <!-- TARJETAS DE SALDO GIGANTES -->
        <div class="balance-cards-grid">
          <!-- Tarjeta Verde: Efectivo -->
          <div class="balance-card card-cash">
            <div class="balance-card-header">
              <span class="balance-card-label">
                <span>💵</span>
                <span>Billetes en Mano</span>
              </span>
              <span class="balance-card-icon">💰</span>
            </div>
            <div class="balance-card-amount">
              ${formatCurrency(summary.totalCash)}
            </div>
            <div class="balance-card-footer">
              <span>Efectivo disponible físico</span>
              <span>● Al día</span>
            </div>
          </div>

          <!-- Tarjeta Azul/Violeta: Digital -->
          <div class="balance-card card-digital">
            <div class="balance-card-header">
              <span class="balance-card-label">
                <span>💳</span>
                <span>En Cuenta Digital</span>
              </span>
              <span class="balance-card-icon">📱</span>
            </div>
            <div class="balance-card-amount">
              ${formatCurrency(summary.totalDigital)}
            </div>
            <div class="balance-card-footer">
              <span>Mercado Pago / Banco</span>
              <span>● Al día</span>
            </div>
          </div>
        </div>

        <!-- TARJETA DE ALERTA: FACTURAS PENDIENTES -->
        ${summary.pendingBillsCount > 0 ? `
          <div class="alert-bills-card" id="alert-card-trigger">
            <div class="alert-left-group">
              <div class="alert-icon-badge">⚠️</div>
              <div class="alert-text-group">
                <h3>Facturas por Pagar</h3>
                <div class="alert-amount">${formatCurrency(summary.totalPendingDebt)}</div>
                <div class="alert-count">${summary.pendingBillsCount} boleta(s) pendiente(s)</div>
              </div>
            </div>
            <div class="alert-chevron">➔</div>
          </div>
        ` : `
          <div class="all-clear-banner">
            <span style="font-size: 18px;">✅</span>
            <span>¡Sin deudas! Todas las facturas de la casa están pagadas.</span>
          </div>
        `}

        <!-- BALANCE REAL NETO -->
        <div class="real-net-summary">
          <div>
            <div class="real-net-label">Dinero Real Disponible (Sin deudas)</div>
            <div style="font-size: 11px; color: var(--text-dim);">Total acumulado menos servicios pendientes</div>
          </div>
          <div class="real-net-amount" style="color: ${summary.realNetBalance >= 0 ? 'var(--color-cash-light)' : 'var(--color-danger-light)'};">
            ${formatCurrency(summary.realNetBalance)}
          </div>
        </div>

        <!-- MINI HISTORIAL RECIENTE -->
        <div>
          <div class="section-header">
            <span class="section-title">Últimos Registros</span>
            <button type="button" class="section-link-btn" id="btn-view-all-history">Ver todo</button>
          </div>

          <div class="recent-transactions-list" style="margin-top: 10px;">
            ${recentTx.length === 0 ? `
              <div style="padding: 16px; background: var(--bg-surface); border-radius: var(--radius-md); text-align: center; color: var(--text-muted); font-size: 13px;">
                Aún no has registrado movimientos hoy. ¡Toca "Anotar Cobro" abajo!
              </div>
            ` : recentTx.map(tx => {
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
                      <p>${isCash ? '💵 Billete' : '💳 Digital'} ${tx.note ? `• ${tx.note}` : ''}</p>
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
      </div>
    `;

    // Click en la tarjeta de alerta lleva a la vista de facturas
    document.getElementById('alert-card-trigger')?.addEventListener('click', () => {
      switchTab('BILLS');
    });

    document.getElementById('btn-view-all-history')?.addEventListener('click', () => {
      switchTab('HISTORY');
    });
  }
}
