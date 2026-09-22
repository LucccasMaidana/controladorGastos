/**
 * ============================================================================
 * MOBILE APP COMPONENT (INTERFAZ MÓVIL FAMILIAR)
 * Acceso limpio con input único de Nombre y Apellido, puerta secreta Admin
 * y billeteras independientes por persona
 * ============================================================================
 */

import { getFinancialSummary, getTransactions, formatCurrency, onAccountingChange } from '../../services/accounting.js';
import { openKeypadModal } from './keypadModal.js';
import { renderMobileBillsView } from './billsView.js';
import { renderMobileHistoryView } from './historyView.js';
import { initAdminApp, setAdminAuthenticated } from '../admin/adminApp.js';
import { initializeUserWallets, clearAllLocalData } from '../../db/indexedDb.js';
import { pushWalletToCloud, pullWalletsFromCloud } from '../../db/supabase.js';
import { toggleTheme, updateAllThemeIcons } from '../../services/theme.js';

let currentTab = 'DASHBOARD'; // 'DASHBOARD', 'BILLS', 'HISTORY'
const STORAGE_USER_KEY = 'libreta_active_user';

export function getActiveUser() {
  return localStorage.getItem(STORAGE_USER_KEY) || null;
}

export function setActiveUser(name) {
  if (name) {
    localStorage.setItem(STORAGE_USER_KEY, name.trim());
  } else {
    localStorage.removeItem(STORAGE_USER_KEY);
  }
}

export async function initMobileApp(rootElement) {
  onAccountingChange(() => {
    const user = getActiveUser();
    if (user) {
      renderCurrentTab(rootElement);
    } else {
      renderMobileWelcome(rootElement);
    }
  });

  const activeUser = getActiveUser();
  if (!activeUser) {
    renderMobileWelcome(rootElement);
    return;
  }

  // Si hay un usuario guardado pero estamos en línea, verificar de inmediato con Supabase
  // si el sistema fue puesto a cero o si este usuario fue eliminado.
  if (navigator.onLine) {
    try {
      const remoteWallets = await pullWalletsFromCloud();
      if (remoteWallets !== null && Array.isArray(remoteWallets)) {
        const userExistsInCloud = remoteWallets.some(w => 
          w.user_name && w.user_name.trim().toLowerCase() === activeUser.trim().toLowerCase()
        );
        if (remoteWallets.length === 0 || !userExistsInCloud) {
          console.warn(`Usuario "${activeUser}" no existe en la nube (Puesta a cero o borrado). Regresando a inicio.`);
          await clearAllLocalData();
          setActiveUser(null);
          renderMobileWelcome(rootElement);
          return;
        }
      }
    } catch (e) {
      console.warn('Error verificando usuario activo en la nube:', e);
    }
  }

  renderMobileAppShell(rootElement, activeUser);
}

/**
 * 1. PANTALLA INICIAL LIMPIA: INPUT ÚNICO (CON PUERTA SECRETA 'Admin')
 */
function renderMobileWelcome(rootElement) {
  rootElement.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; padding: 24px 20px; background: var(--bg-app); color: var(--text-main); text-align: center; position: relative;">
      <!-- Botón Modo Claro / Oscuro -->
      <div style="position: absolute; top: 16px; right: 16px;">
        <button type="button" id="btn-theme-welcome" title="Alternar modo claro / oscuro" style="background: var(--bg-surface); border: 1px solid var(--border-subtle); color: var(--text-main); width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 16px; cursor: pointer; box-shadow: var(--shadow-sm);">
          <span data-theme-icon>🌙</span>
        </button>
      </div>

      <div style="width: 72px; height: 72px; border-radius: 20px; background: linear-gradient(135deg, var(--color-cash), var(--color-digital)); display: flex; align-items: center; justify-content: center; font-size: 36px; box-shadow: 0 8px 24px rgba(16, 185, 129, 0.3); margin-bottom: 16px;">
        📒
      </div>

      <h1 style="font-size: 22px; font-weight: 800; letter-spacing: -0.02em; margin-bottom: 6px;">
        Libreta Contable Familiar
      </h1>
      <p style="font-size: 13px; color: var(--text-muted); max-width: 280px; margin-bottom: 28px; line-height: 1.4;">
        Control diario de cobros, compras y servicios del hogar
      </p>

      <form id="mobile-login-form" style="width: 100%; max-width: 320px; display: flex; flex-direction: column; gap: 14px;">
        <div style="display: flex; flex-direction: column; text-align: left; gap: 6px;">
          <label style="font-size: 13px; font-weight: 700; color: var(--text-muted);">
            Ingrese su Nombre y Apellido:
          </label>
          <input 
            type="text" 
            id="input-user-fullname" 
            class="admin-form-input" 
            placeholder="Ej: Nombre y Apellido" 
            autocomplete="name" 
            style="height: 52px; font-size: 16px; border-radius: var(--radius-lg); text-align: center; font-weight: 600;" 
            required 
            autofocus 
          />
        </div>

        <!-- Contenedor secreto de contraseña (solo se activa si escribe 'Admin') -->
        <div id="secret-admin-group" style="display: none; flex-direction: column; text-align: left; gap: 6px; animation: fadeIn 0.2s ease-out;">
          <label style="font-size: 12px; font-weight: 700; color: #fbbf24;">
            🔐 Contraseña de Administrador:
          </label>
          <input 
            type="password" 
            id="input-secret-admin-pass" 
            class="admin-form-input" 
            placeholder="••••••••" 
            style="height: 48px; border-color: #f59e0b; text-align: center;" 
          />
          <span style="font-size: 11px; color: #fde68a;">Acceso al panel de control de facturas de la casa</span>
        </div>

        <div id="mobile-login-error" style="display: none; background: rgba(225, 29, 72, 0.15); color: #fb7185; border: 1px solid rgba(225, 29, 72, 0.3); padding: 10px 14px; border-radius: var(--radius-md); font-size: 12px; font-weight: 600;"></div>

        <button type="submit" class="btn-giant-action btn-income-action" id="btn-mobile-login-submit" style="height: 54px; font-size: 16px; border-radius: var(--radius-lg); margin-top: 6px;">
          <span id="btn-login-text">Comenzar</span>
          <span>➔</span>
        </button>
      </form>
    </div>
  `;

  const nameInput = document.getElementById('input-user-fullname');
  const secretGroup = document.getElementById('secret-admin-group');
  const adminPassInput = document.getElementById('input-secret-admin-pass');
  const submitBtn = document.getElementById('btn-mobile-login-submit');
  const btnText = document.getElementById('btn-login-text');
  const errorMsg = document.getElementById('mobile-login-error');
  const form = document.getElementById('mobile-login-form');

  // Detectar la palabra mágica 'Admin'
  nameInput.addEventListener('input', (e) => {
    const val = e.target.value.trim().toLowerCase();
    errorMsg.style.display = 'none';

    if (val === 'admin') {
      secretGroup.style.display = 'flex';
      btnText.textContent = 'Ingresar como Administrador';
      submitBtn.style.background = 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)';
      setTimeout(() => adminPassInput.focus(), 50);
    } else {
      secretGroup.style.display = 'none';
      btnText.textContent = 'Comenzar';
      submitBtn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
    }
  });

  document.getElementById('btn-theme-welcome')?.addEventListener('click', toggleTheme);
  updateAllThemeIcons();

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const rawName = nameInput.value.trim();

    if (!rawName) return;

    if (rawName.toLowerCase() === 'admin') {
      const pass = adminPassInput.value;
      if (pass === 'JjunieBronce1') {
        setAdminAuthenticated(true);
        initAdminApp(rootElement);
      } else {
        errorMsg.textContent = '⚠️ Contraseña de Administrador incorrecta';
        errorMsg.style.display = 'block';
        adminPassInput.value = '';
        adminPassInput.focus();
      }
    } else {
      // Usuario regular
      setActiveUser(rawName);
      initializeUserWallets(rawName).then(wallets => {
        wallets.forEach(w => pushWalletToCloud(w).catch(() => {}));
      });
      renderMobileAppShell(rootElement, rawName);
    }
  });
}

/**
 * 2. SHELL DE LA APLICACIÓN MÓVIL DEL USUARIO ACTIVO
 */
function renderMobileAppShell(rootElement, activeUser) {
  const firstName = activeUser.split(' ')[0] || activeUser;

  rootElement.innerHTML = `
    <div class="mobile-app-container">
      <!-- Encabezado de Bienvenida -->
      <div class="mobile-header">
        <div class="mobile-user-greeting">
          <span class="app-name">Libreta Contable</span>
          <h2 class="user-title" title="${activeUser}">Hola, ${firstName} 👋</h2>
        </div>
        
        <div style="display: flex; align-items: center; gap: 8px;">
          <button type="button" class="btn-theme-toggle" id="btn-theme-mobile" title="Alternar modo claro / oscuro" style="background: var(--bg-surface); border: 1px solid var(--border-subtle); color: var(--text-main); width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; cursor: pointer;">
            <span data-theme-icon>🌙</span>
          </button>
          <div class="mobile-sync-icon" id="mobile-header-sync" title="Estado de sincronización">
            🟢
          </div>
          <button type="button" id="btn-logout-user" title="Salir / Cambiar de usuario" style="background: var(--bg-surface); border: 1px solid var(--border-subtle); color: var(--text-muted); font-size: 11px; font-weight: 700; padding: 6px 10px; border-radius: var(--radius-pill); cursor: pointer; display: flex; align-items: center; gap: 4px;">
            <span>🚪</span>
            <span>Salir</span>
          </button>
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

  // Toggle de tema
  document.getElementById('btn-theme-mobile')?.addEventListener('click', toggleTheme);
  updateAllThemeIcons();

  // Cerrar sesión
  document.getElementById('btn-logout-user')?.addEventListener('click', () => {
    setActiveUser(null);
    renderMobileWelcome(rootElement);
  });

  // Listeners de navegación de pestañas
  document.getElementById('nav-tab-dashboard')?.addEventListener('click', () => switchTab('DASHBOARD', rootElement));
  document.getElementById('nav-tab-bills')?.addEventListener('click', () => switchTab('BILLS', rootElement));
  document.getElementById('nav-tab-history')?.addEventListener('click', () => switchTab('HISTORY', rootElement));

  // Listeners de botones gigantes (asociados al usuario activo)
  document.getElementById('btn-quick-income')?.addEventListener('click', () => {
    openKeypadModal('INCOME', activeUser);
  });
  document.getElementById('btn-quick-expense')?.addEventListener('click', () => {
    openKeypadModal('EXPENSE', activeUser);
  });

  renderCurrentTab(rootElement);
}

function switchTab(tabName, rootElement) {
  currentTab = tabName;
  document.querySelectorAll('.nav-tab-btn').forEach(btn => btn.classList.remove('active'));
  
  if (tabName === 'DASHBOARD') document.getElementById('nav-tab-dashboard')?.classList.add('active');
  if (tabName === 'BILLS') document.getElementById('nav-tab-bills')?.classList.add('active');
  if (tabName === 'HISTORY') document.getElementById('nav-tab-history')?.classList.add('active');

  renderCurrentTab(rootElement);
}

async function renderCurrentTab(rootElement) {
  const container = document.getElementById('mobile-tab-content');
  const activeUser = getActiveUser();
  if (!container || !activeUser) return;

  try {
    const summary = await getFinancialSummary(activeUser);

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
      await renderMobileHistoryView(container, activeUser);
    } else {
      // DASHBOARD PRINCIPAL DEL USUARIO
      const recentTx = (await getTransactions(activeUser, 'ALL')).slice(0, 3);

      container.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 16px;">
          <!-- TARJETAS DE SALDO GIGANTES DEL USUARIO -->
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

          <!-- TARJETA DE ALERTA: FACTURAS PENDIENTES DEL HOGAR -->
          ${summary.pendingBillsCount > 0 ? `
            <div class="alert-bills-card" id="alert-card-trigger">
              <div class="alert-left-group">
                <div class="alert-icon-badge">⚠️</div>
                <div class="alert-text-group">
                  <div class="alert-title">Facturas del Hogar por Pagar</div>
                  <div class="alert-desc">${summary.pendingBillsCount} boleta(s) pendientes de servicio</div>
                </div>
              </div>
              <div class="alert-amount">${formatCurrency(summary.totalPendingDebt)}</div>
            </div>
          ` : `
            <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.2); border-radius: var(--radius-md); padding: 12px 16px; display: flex; align-items: center; gap: 10px; font-size: 13px; color: #34d399;">
              <span>✅</span>
              <span>No hay facturas de servicios pendientes para el hogar.</span>
            </div>
          `}

          <!-- HISTORIAL RÁPIDO DE ÚLTIMOS MOVIMIENTOS -->
          <div class="card" style="padding: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
              <h3 style="font-size: 14px; font-weight: 700; color: var(--text-main);">Tus Últimos Movimientos</h3>
              <button type="button" id="btn-view-all-history" style="background: none; border: none; color: var(--color-digital); font-size: 12px; font-weight: 700; cursor: pointer;">
                Ver Todos →
              </button>
            </div>

            <div class="tx-list">
              ${recentTx.length === 0 ? `
                <div style="text-align: center; padding: 24px 0; color: var(--text-muted); font-size: 13px;">
                  Aún no has anotado movimientos.<br/>Toca <strong>＋ Anotar Cobro</strong> abajo para empezar.
                </div>
              ` : recentTx.map(tx => {
                const isIncome = tx.type === 'INCOME';
                const isCash = tx.wallet_type === 'CASH';
                const d = new Date(tx.date);
                const isToday = d.toDateString() === new Date().toDateString();
                const dateStr = isToday 
                  ? `Hoy ${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}` 
                  : d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
                return `
                  <div class="tx-item">
                    <div class="tx-left">
                      <div class="tx-icon ${isIncome ? 'income' : 'expense'}">
                        ${isIncome ? '↓' : '↑'}
                      </div>
                      <div class="tx-info">
                        <h4>${tx.category}</h4>
                        <p>
                          <span>📅 ${dateStr}</span> • 
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
        </div>
      `;

      document.getElementById('alert-card-trigger')?.addEventListener('click', () => {
        switchTab('BILLS', rootElement);
      });

      document.getElementById('btn-view-all-history')?.addEventListener('click', () => {
        switchTab('HISTORY', rootElement);
      });
    }
  } catch (err) {
    console.error('❌ Error al cargar la vista de usuario:', err);
    container.innerHTML = `
      <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid #ef4444; color: #fca5a5; padding: 20px; border-radius: 14px; margin: 16px 0; text-align: center;">
        <div style="font-size: 28px; margin-bottom: 8px;">⚠️</div>
        <p style="font-weight: bold; font-size: 15px; margin-bottom: 6px;">Ocurrió un error al cargar la vista</p>
        <p style="font-size: 12px; color: #cbd5e1; margin-bottom: 14px;">${err.message}</p>
        <button type="button" onclick="location.reload()" style="background: #ef4444; color: white; border: none; padding: 10px 20px; border-radius: 10px; font-weight: bold; font-size: 13px; cursor: pointer;">
          🔄 Recargar
        </button>
      </div>
    `;
  }
}
