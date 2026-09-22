/**
 * ============================================================================
 * ADMIN WEB CONTROLLER (PANEL DE ADMINISTRACIÓN MULTIUSUARIO)
 * Monitoreo de integrantes, liquidación con selección de pagador y puesta a cero
 * ============================================================================
 */

import { 
  getFinancialSummary, 
  getBillsList, 
  createBill, 
  settleBill, 
  deleteBill, 
  formatCurrency, 
  roundCurrency,
  onAccountingChange,
  getAllRegisteredUsers,
  wipeAllDataForProduction,
  deleteUserCompletely
} from '../../services/accounting.js';
import { configureSupabase, testSupabaseConnection } from '../../db/supabase.js';
import { getConfig } from '../../db/indexedDb.js';
import { toggleTheme, updateAllThemeIcons } from '../../services/theme.js';

const ADMIN_USER = 'Admin';
const ADMIN_PASS = 'JjunieBronce1';
const AUTH_KEY = 'admin_session_auth';

export function isUserAdminAuthenticated() {
  return sessionStorage.getItem(AUTH_KEY) === 'true';
}

export function setAdminAuthenticated(val) {
  if (val) {
    sessionStorage.setItem(AUTH_KEY, 'true');
  } else {
    sessionStorage.removeItem(AUTH_KEY);
  }
}

let activeFilter = 'PENDING'; // 'PENDING', 'PAID', 'ALL'
let adminActiveUserFilter = null; // null = Consolidado Hogar, o nombre de integrante
let selectedBillForSettlement = null;

export function initAdminApp(rootElement) {
  onAccountingChange(() => {
    if (isUserAdminAuthenticated()) {
      renderAdminApp(rootElement);
    }
  });

  renderAdminApp(rootElement);
}

export async function renderAdminApp(rootElement) {
  if (!isUserAdminAuthenticated()) {
    renderAdminLogin(rootElement);
    return;
  }

  const registeredUsers = await getAllRegisteredUsers();
  const summary = await getFinancialSummary(adminActiveUserFilter);
  const bills = await getBillsList(activeFilter);
  const supabaseUrl = await getConfig('supabase_url', '');
  const supabaseKey = await getConfig('supabase_anon_key', '');
  const isCloudConnected = Boolean(supabaseUrl && supabaseKey);

  rootElement.innerHTML = `
    <div class="admin-panel-container">
      <!-- Encabezado del Panel PC -->
      <div class="admin-header">
        <div class="admin-header-title">
          <h2>Panel Administrador de Servicios 💻</h2>
          <p>Supervisión familiar, gestión de facturas y liquidación de pagos</p>
        </div>

        <div class="admin-header-actions">
          <button type="button" class="btn-secondary" id="btn-theme-admin" title="Alternar modo claro / oscuro" style="padding: 0 12px;">
            <span data-theme-icon>🌙</span>
          </button>
          <button type="button" class="btn-secondary" id="btn-wipe-production" title="Borrar datos de prueba para dejar la app limpia" style="color: #fb7185; border-color: rgba(251, 113, 133, 0.3);">
            <span>🗑️</span>
            <span>Puesta a Cero</span>
          </button>
          <button type="button" class="btn-secondary" id="btn-open-settings">
            <span>⚙️</span>
            <span>${isCloudConnected ? 'Nube Conectada' : 'Conectar Supabase'}</span>
          </button>
          <button type="button" class="btn-primary" id="btn-open-create-bill">
            <span>＋</span>
            <span>Cargar Nueva Factura</span>
          </button>
          <button type="button" class="btn-secondary" id="btn-admin-logout" title="Cerrar sesión de Administrador" style="color: #fbbf24;">
            <span>🔒</span>
            <span>Salir</span>
          </button>
        </div>
      </div>

      <!-- Barra de Filtro por Integrante de la Familia -->
      <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center; background: var(--bg-input); padding: 10px 14px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
        <span style="font-size: 12px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Ver Saldos de:</span>
        <button type="button" class="admin-tab-btn ${adminActiveUserFilter === null ? 'active' : ''}" id="user-tab-all">
          🏠 Consolidado Hogar
        </button>
        ${registeredUsers.map(u => `
          <div style="display: inline-flex; align-items: center; background: ${adminActiveUserFilter === u ? 'var(--color-primary)' : 'var(--bg-surface)'}; border-radius: var(--radius-pill); padding-right: 6px; border: 1px solid var(--border-subtle);">
            <button type="button" class="admin-tab-btn ${adminActiveUserFilter === u ? 'active' : ''}" data-user-filter="${u}" style="border: none; background: transparent;">
              👤 ${u}
            </button>
            <button type="button" class="btn-delete-user" data-delete-user="${u}" title="Eliminar a ${u}" style="background: transparent; border: none; color: ${adminActiveUserFilter === u ? '#fee2e2' : '#ef4444'}; font-size: 11px; font-weight: 800; cursor: pointer; padding: 2px 4px; border-radius: 4px; opacity: 0.8;">
              ✕
            </button>
          </div>
        `).join('')}
      </div>

      <!-- Métricas Financieras (4 Tarjetas) -->
      <div class="admin-metrics-grid">
        <div class="metric-card">
          <div class="metric-header">
            <span class="metric-title">Billetes en Mano (${summary.userName})</span>
            <span class="metric-badge">💵</span>
          </div>
          <div class="metric-value cash">${formatCurrency(summary.totalCash)}</div>
          <div class="metric-subtext">Efectivo físico disponible</div>
        </div>

        <div class="metric-card">
          <div class="metric-header">
            <span class="metric-title">En Cuenta Digital (${summary.userName})</span>
            <span class="metric-badge">💳</span>
          </div>
          <div class="metric-value digital">${formatCurrency(summary.totalDigital)}</div>
          <div class="metric-subtext">Transferencias / Billeteras</div>
        </div>

        <div class="metric-card">
          <div class="metric-header">
            <span class="metric-title">Facturas Pendientes Hogar</span>
            <span class="metric-badge">⚠️</span>
          </div>
          <div class="metric-value warning">${formatCurrency(summary.totalPendingDebt)}</div>
          <div class="metric-subtext">${summary.pendingBillsCount} boleta(s) por pagar</div>
        </div>

        <div class="metric-card">
          <div class="metric-header">
            <span class="metric-title">Balance Real Neto (${summary.userName})</span>
            <span class="metric-badge">📊</span>
          </div>
          <div class="metric-value net">${formatCurrency(summary.realNetBalance)}</div>
          <div class="metric-subtext">Disponible libre menos compromisos</div>
        </div>
      </div>

      <!-- Controles de Tabla y Filtros -->
      <div class="admin-table-controls">
        <div style="font-size: 15px; font-weight: 700;">
          Listado de Servicios y Facturas del Hogar
        </div>

        <div class="admin-filter-tabs">
          <button type="button" class="admin-tab-btn ${activeFilter === 'PENDING' ? 'active' : ''}" id="filter-pending">
            Pendientes (${summary.pendingBillsCount})
          </button>
          <button type="button" class="admin-tab-btn ${activeFilter === 'PAID' ? 'active' : ''}" id="filter-paid">
            Pagadas
          </button>
          <button type="button" class="admin-tab-btn ${activeFilter === 'ALL' ? 'active' : ''}" id="filter-all-bills">
            Todas
          </button>
        </div>
      </div>

      <!-- Tabla de Facturas -->
      <div class="admin-table-wrapper">
        <table class="admin-bills-table">
          <thead>
            <tr>
              <th>Servicio</th>
              <th>Monto</th>
              <th>Vencimiento</th>
              <th>Estado</th>
              <th>Detalle de Pago</th>
              <th style="text-align: right;">Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${bills.length === 0 ? `
              <tr>
                <td colspan="6" style="text-align: center; padding: 40px; color: var(--text-muted);">
                  No hay facturas en esta sección. Puedes cargar una nueva con el botón "+ Cargar Nueva Factura".
                </td>
              </tr>
            ` : bills.map(bill => {
              const isPending = bill.status === 'PENDING';
              return `
                <tr>
                  <td>
                    <div class="service-name-cell">
                      <div class="service-icon">${getServiceIcon(bill.service_name)}</div>
                      <div>
                        <div>${bill.service_name}</div>
                        <div style="font-size: 11px; color: var(--text-dim);">Cargado por: ${bill.created_by || 'Admin'}</div>
                      </div>
                    </div>
                  </td>
                  <td style="font-size: 16px; font-weight: 800;">
                    ${formatCurrency(bill.amount)}
                  </td>
                  <td>
                    <strong>${formatDateSimple(bill.due_date)}</strong>
                  </td>
                  <td>
                    <span class="bill-status-badge ${isPending ? 'pending' : 'paid'}">
                      ${isPending ? '⏳ Pendiente' : '✓ Pagada'}
                    </span>
                  </td>
                  <td style="font-size: 12px; color: var(--text-muted);">
                    ${isPending ? '—' : `
                      <div>Cubierto por: <strong>${bill.paid_by || 'Mariel'}</strong></div>
                      <div>💵 Efectivo: $${bill.paid_cash_amount || 0} / 💳 Digital: $${bill.paid_digital_amount || 0}</div>
                    `}
                  </td>
                  <td style="text-align: right;">
                    ${isPending ? `
                      <button type="button" class="btn-settle-bill" data-settle-id="${bill.id}">
                        <span>✓</span>
                        <span>Liquidar Pago</span>
                      </button>
                    ` : ''}
                    <button type="button" class="btn-delete-bill" data-delete-id="${bill.id}" title="Eliminar Factura">
                      ✕
                    </button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>

      <!-- Modales dinámicos (Cargar Factura, Liquidar, Supabase) -->
      <div id="admin-modals-root"></div>
    </div>
  `;

  // Attach event listeners
  document.getElementById('btn-theme-admin')?.addEventListener('click', toggleTheme);
  updateAllThemeIcons();

  document.getElementById('btn-open-create-bill')?.addEventListener('click', () => openCreateBillModal(rootElement));
  document.getElementById('btn-open-settings')?.addEventListener('click', () => openSettingsModal(rootElement));

  // Puesta a cero para producción (local y nube)
  document.getElementById('btn-wipe-production')?.addEventListener('click', async () => {
    const ok = confirm('⚠️ ¿Deseas vaciar todos los usuarios, billeteras, movimientos y facturas para dejar la aplicación 100% limpia?\n\nEsto borrará todos los datos tanto de tu PC como de Supabase en la nube.');
    if (ok) {
      adminActiveUserFilter = null;
      await wipeAllDataForProduction();
      alert('✅ Puesta a cero completada con éxito. Todos los usuarios y datos fueron eliminados de la PC y de la nube.');
      
      // Si la app móvil está en pantalla (split o móvil), regresarla al onboarding limpio
      const mobileRoot = document.getElementById('mobile-app-root');
      if (mobileRoot) {
        localStorage.removeItem('libreta_active_user');
        setTimeout(() => window.location.reload(), 300);
      } else {
        renderAdminApp(rootElement);
      }
    }
  });

  // Eliminar integrante individual (local y nube)
  document.querySelectorAll('[data-delete-user]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const targetUser = e.currentTarget.dataset.deleteUser;
      if (confirm(`¿Estás seguro de que deseas eliminar al usuario "${targetUser}" y todos sus movimientos (tanto de la PC como de la nube)?`)) {
        if (adminActiveUserFilter === targetUser) adminActiveUserFilter = null;
        await deleteUserCompletely(targetUser);
        alert(`Usuario "${targetUser}" eliminado con éxito.`);
        renderAdminApp(rootElement);
      }
    });
  });

  // Filtro por usuario
  document.getElementById('user-tab-all')?.addEventListener('click', () => {
    adminActiveUserFilter = null;
    renderAdminApp(rootElement);
  });
  document.querySelectorAll('[data-user-filter]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      adminActiveUserFilter = e.currentTarget.dataset.userFilter;
      renderAdminApp(rootElement);
    });
  });

  document.getElementById('filter-pending')?.addEventListener('click', () => { activeFilter = 'PENDING'; renderAdminApp(rootElement); });
  document.getElementById('filter-paid')?.addEventListener('click', () => { activeFilter = 'PAID'; renderAdminApp(rootElement); });
  document.getElementById('filter-all-bills')?.addEventListener('click', () => { activeFilter = 'ALL'; renderAdminApp(rootElement); });

  // Liquidar Facturas
  document.querySelectorAll('[data-settle-id]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const billId = e.currentTarget.dataset.settleId;
      const allBills = await getBillsList('ALL');
      const bill = allBills.find(b => b.id === billId);
      if (bill) {
        openSettleBillModal(bill, rootElement, registeredUsers);
      }
    });
  });

  // Eliminar Facturas
  document.querySelectorAll('[data-delete-id]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const billId = e.currentTarget.dataset.deleteId;
      if (confirm('¿Estás seguro de que deseas eliminar este registro de factura?')) {
        await deleteBill(billId);
      }
    });
  });

  // Cerrar sesión
  document.getElementById('btn-admin-logout')?.addEventListener('click', () => {
    setAdminAuthenticated(false);
    renderAdminApp(rootElement);
  });
}

function renderAdminLogin(rootElement) {
  rootElement.innerHTML = `
    <div class="admin-login-wrapper">
      <div class="admin-login-card">
        <div style="display: flex; flex-direction: column; align-items: center; text-align: center;">
          <div class="login-header-icon">🔐</div>
          <h2 style="font-size: 22px; font-weight: 800; margin-top: 8px;">Acceso Administrador</h2>
          <p style="font-size: 13px; color: var(--text-muted); margin-top: 4px;">Ingresa tus credenciales para administrar servicios y pagos</p>
        </div>

        <form id="admin-login-form" style="display: flex; flex-direction: column; gap: 14px;">
          <div class="admin-form-group">
            <label class="admin-form-label">Usuario:</label>
            <input type="text" id="login-username" class="admin-form-input" placeholder="Admin" value="Admin" autocomplete="username" required />
          </div>

          <div class="admin-form-group">
            <label class="admin-form-label">Contraseña:</label>
            <input type="password" id="login-password" class="admin-form-input" placeholder="••••••••" autocomplete="current-password" required />
          </div>

          <div id="login-error-msg" style="display: none; background: rgba(225, 29, 72, 0.15); color: #fb7185; border: 1px solid rgba(225, 29, 72, 0.3); padding: 10px 14px; border-radius: var(--radius-md); font-size: 12px; font-weight: 600;">
            ⚠️ Usuario o contraseña incorrectos
          </div>

          <button type="submit" class="btn-primary" style="justify-content: center; height: 46px; font-size: 15px; margin-top: 6px;">
            <span>Ingresar al Panel</span>
            <span>➔</span>
          </button>
        </form>
      </div>
    </div>
  `;

  const form = document.getElementById('admin-login-form');
  const userIn = document.getElementById('login-username');
  const passIn = document.getElementById('login-password');
  const errorMsg = document.getElementById('login-error-msg');

  setTimeout(() => passIn?.focus(), 100);

  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const u = userIn.value.trim().toLowerCase();
    const p = passIn.value;

    if (u === 'admin' && p === ADMIN_PASS) {
      setAdminAuthenticated(true);
      renderAdminApp(rootElement);
    } else {
      errorMsg.style.display = 'block';
      passIn.value = '';
      passIn.focus();
    }
  });
}

function getServiceIcon(serviceName = '') {
  const lower = serviceName.toLowerCase();
  if (lower.includes('luz') || lower.includes('edenor') || lower.includes('edesur')) return '💡';
  if (lower.includes('gas') || lower.includes('naturgy') || lower.includes('metrogas')) return '🔥';
  if (lower.includes('internet') || lower.includes('wifi') || lower.includes('fibertel') || lower.includes('movistar') || lower.includes('telecom')) return '🌐';
  if (lower.includes('agua') || lower.includes('aysa')) return '💧';
  if (lower.includes('expensas')) return '🏢';
  if (lower.includes('rentas') || lower.includes('municipal') || lower.includes('arba') || lower.includes('abl')) return '📑';
  return '🧾';
}

function formatDateSimple(dateStr) {
  if (!dateStr) return '—';
  const parts = dateStr.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
}

// ============================================================================
// MODAL: CARGAR NUEVA FACTURA
// ============================================================================
function openCreateBillModal(rootElement) {
  const modalRoot = document.getElementById('admin-modals-root');
  if (!modalRoot) return;

  const defaultDueDate = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

  modalRoot.innerHTML = `
    <div class="admin-modal-backdrop" id="modal-create-backdrop">
      <div class="admin-modal-box">
        <div class="admin-modal-header">
          <h3>Cargar Nueva Factura de Servicio 🧾</h3>
          <button type="button" class="modal-btn-close" id="btn-close-create-modal">✕</button>
        </div>

        <!-- Presets Rápidos de Servicio -->
        <div class="admin-form-group">
          <label class="admin-form-label">Servicios Comunes (Clic para elegir):</label>
          <div class="preset-services-grid">
            <button type="button" class="preset-service-btn" data-service="Edenor / Luz">💡 Luz (Edenor)</button>
            <button type="button" class="preset-service-btn" data-service="Naturgy / Gas">🔥 Gas (Naturgy)</button>
            <button type="button" class="preset-service-btn" data-service="Internet / WiFi">🌐 Internet</button>
            <button type="button" class="preset-service-btn" data-service="AySA / Agua">💧 Agua (AySA)</button>
            <button type="button" class="preset-service-btn" data-service="Expensas">🏢 Expensas</button>
            <button type="button" class="preset-service-btn" data-service="Municipal / ABL">📑 Tasas / ABL</button>
          </div>
        </div>

        <div class="admin-form-group">
          <label class="admin-form-label">Nombre del Servicio:</label>
          <input type="text" id="input-bill-service" class="admin-form-input" placeholder="Ej: Edenor, Naturgy, Internet..." />
        </div>

        <div class="admin-form-group">
          <label class="admin-form-label">Monto de la Factura ($):</label>
          <input type="number" id="input-bill-amount" class="admin-form-input" placeholder="0.00" step="0.01" min="0" />
        </div>

        <div class="admin-form-group">
          <label class="admin-form-label">Fecha de Vencimiento:</label>
          <input type="date" id="input-bill-date" class="admin-form-input" value="${defaultDueDate}" />
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px;">
          <button type="button" class="btn-secondary" id="btn-cancel-create">Cancelar</button>
          <button type="button" class="btn-primary" id="btn-save-new-bill">Guardar Factura</button>
        </div>
      </div>
    </div>
  `;

  modalRoot.querySelectorAll('.preset-service-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.getElementById('input-bill-service').value = e.currentTarget.dataset.service;
    });
  });

  const closeModal = () => { modalRoot.innerHTML = ''; };
  document.getElementById('btn-close-create-modal')?.addEventListener('click', closeModal);
  document.getElementById('btn-cancel-create')?.addEventListener('click', closeModal);

  document.getElementById('btn-save-new-bill')?.addEventListener('click', async () => {
    const serviceName = document.getElementById('input-bill-service').value.trim();
    const amount = parseFloat(document.getElementById('input-bill-amount').value);
    const dueDate = document.getElementById('input-bill-date').value;

    if (!serviceName) {
      alert('Por favor ingrese el nombre del servicio');
      return;
    }
    if (!amount || amount <= 0) {
      alert('Por favor ingrese un monto válido mayor a cero');
      return;
    }
    if (!dueDate) {
      alert('Por favor seleccione la fecha de vencimiento');
      return;
    }

    try {
      await createBill({
        serviceName,
        amount,
        dueDate,
        createdBy: 'Admin'
      });
      closeModal();
    } catch (err) {
      alert(`Error al guardar factura: ${err.message}`);
    }
  });
}

// ============================================================================
// MODAL: LIQUIDAR FACTURA (DESGLOSE BILLETE / DIGITAL Y SELECCIÓN DE PAGADOR)
// ============================================================================
function openSettleBillModal(bill, rootElement, registeredUsers = []) {
  const modalRoot = document.getElementById('admin-modals-root');
  if (!modalRoot) return;

  selectedBillForSettlement = bill;
  const totalAmount = roundCurrency(bill.amount);

  let cashAmount = totalAmount; // Por defecto todo en efectivo
  let digitalAmount = 0.00;

  function updateFeedback() {
    const cashVal = roundCurrency(parseFloat(document.getElementById('input-settle-cash').value) || 0);
    const digitalVal = roundCurrency(parseFloat(document.getElementById('input-settle-digital').value) || 0);
    const currentSum = roundCurrency(cashVal + digitalVal);
    const feedbackBox = document.getElementById('settle-validation-feedback');
    const submitBtn = document.getElementById('btn-confirm-settle');
    const payerName = document.getElementById('select-settle-payer')?.value || 'el integrante';

    const diff = roundCurrency(totalAmount - currentSum);

    if (Math.abs(diff) <= 0.01) {
      feedbackBox.className = 'validation-feedback-box valid';
      feedbackBox.innerHTML = `
        <span>✓</span>
        <span>Desglose exacto: ${formatCurrency(currentSum)}. Se descontará automáticamente de la libreta de ${payerName}.</span>
      `;
      submitBtn.disabled = false;
      submitBtn.style.opacity = '1';
    } else {
      feedbackBox.className = 'validation-feedback-box invalid';
      feedbackBox.innerHTML = `
        <span>⚠️</span>
        <span>La suma (${formatCurrency(currentSum)}) no coincide con la factura (${formatCurrency(totalAmount)}). Diferencia: ${formatCurrency(diff)}</span>
      `;
      submitBtn.disabled = true;
      submitBtn.style.opacity = '0.5';
    }
  }

  const defaultPayerOptions = registeredUsers.length > 0 ? registeredUsers : ['Usuario'];

  modalRoot.innerHTML = `
    <div class="admin-modal-backdrop" id="modal-settle-backdrop">
      <div class="admin-modal-box">
        <div class="admin-modal-header">
          <h3>Liquidar y Registrar Pago 💰</h3>
          <button type="button" class="modal-btn-close" id="btn-close-settle-modal">✕</button>
        </div>

        <div class="settlement-summary-box">
          <div>
            <div class="service-title">${bill.service_name}</div>
            <div style="font-size: 11px; color: var(--text-muted);">Vencimiento: ${formatDateSimple(bill.due_date)}</div>
          </div>
          <div class="total-amount">${formatCurrency(totalAmount)}</div>
        </div>

        <!-- Selector de quién entregó el dinero -->
        <div class="admin-form-group">
          <label class="admin-form-label">¿Quién cubrió el dinero de la factura?:</label>
          <select id="select-settle-payer" class="admin-form-input" style="font-weight: 700;">
            ${defaultPayerOptions.map(u => `
              <option value="${u}">${u}</option>
            `).join('')}
          </select>
        </div>

        <!-- Presets Rápidos de Desglose -->
        <div class="admin-form-group">
          <label class="admin-form-label">Distribución del dinero entregado:</label>
          <div class="settlement-presets-bar">
            <button type="button" class="settlement-preset-btn" id="preset-all-cash">100% Efectivo</button>
            <button type="button" class="settlement-preset-btn" id="preset-all-digital">100% Digital</button>
            <button type="button" class="settlement-preset-btn" id="preset-half">50% y 50%</button>
          </div>
        </div>

        <!-- Inputs de Desglose -->
        <div class="settlement-split-grid">
          <div class="admin-form-group">
            <label class="admin-form-label">💵 Cubierto en Efectivo:</label>
            <input type="number" id="input-settle-cash" class="admin-form-input" value="${cashAmount}" step="0.01" min="0" />
          </div>

          <div class="admin-form-group">
            <label class="admin-form-label">💳 Cubierto en Digital / MP:</label>
            <input type="number" id="input-settle-digital" class="admin-form-input" value="${digitalAmount}" step="0.01" min="0" />
          </div>
        </div>

        <!-- Validación en tiempo real -->
        <div id="settle-validation-feedback" class="validation-feedback-box valid">
          <span>✓</span>
          <span>Desglose exacto: ${formatCurrency(totalAmount)}.</span>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <button type="button" class="btn-secondary" id="btn-cancel-settle">Cancelar</button>
          <button type="button" class="btn-primary" id="btn-confirm-settle" style="background: linear-gradient(135deg, #10b981, #059669);">
            Confirmar y Liquidar
          </button>
        </div>
      </div>
    </div>
  `;

  const cashInput = document.getElementById('input-settle-cash');
  const digitalInput = document.getElementById('input-settle-digital');
  const payerSelect = document.getElementById('select-settle-payer');

  cashInput.addEventListener('input', updateFeedback);
  digitalInput.addEventListener('input', updateFeedback);
  payerSelect?.addEventListener('change', updateFeedback);

  document.getElementById('preset-all-cash').addEventListener('click', () => {
    cashInput.value = totalAmount;
    digitalInput.value = 0;
    updateFeedback();
  });
  document.getElementById('preset-all-digital').addEventListener('click', () => {
    cashInput.value = 0;
    digitalInput.value = totalAmount;
    updateFeedback();
  });
  document.getElementById('preset-half').addEventListener('click', () => {
    const half = roundCurrency(totalAmount / 2);
    cashInput.value = half;
    digitalInput.value = roundCurrency(totalAmount - half);
    updateFeedback();
  });

  const closeModal = () => { modalRoot.innerHTML = ''; };
  document.getElementById('btn-close-settle-modal')?.addEventListener('click', closeModal);
  document.getElementById('btn-cancel-settle')?.addEventListener('click', closeModal);

  document.getElementById('btn-confirm-settle')?.addEventListener('click', async () => {
    const cashVal = roundCurrency(parseFloat(cashInput.value) || 0);
    const digitalVal = roundCurrency(parseFloat(digitalInput.value) || 0);
    const payer = payerSelect?.value || 'Usuario';

    try {
      await settleBill({
        billId: bill.id,
        paidByUserName: payer,
        paidCashAmount: cashVal,
        paidDigitalAmount: digitalVal
      });
      closeModal();
    } catch (err) {
      alert(`Error al liquidar: ${err.message}`);
    }
  });

  updateFeedback();
}

// ============================================================================
// MODAL: CONFIGURAR SUPABASE (NUBE)
// ============================================================================
async function openSettingsModal(rootElement) {
  const modalRoot = document.getElementById('admin-modals-root');
  if (!modalRoot) return;

  const currentUrl = await getConfig('supabase_url', '');
  const currentKey = await getConfig('supabase_anon_key', '');

  modalRoot.innerHTML = `
    <div class="admin-modal-backdrop" id="modal-settings-backdrop">
      <div class="admin-modal-box">
        <div class="admin-modal-header">
          <h3>Configuración de Supabase (Nube) ☁️</h3>
          <button type="button" class="modal-btn-close" id="btn-close-settings-modal">✕</button>
        </div>

        <div style="background: rgba(56, 189, 248, 0.1); border: 1px solid rgba(56, 189, 248, 0.25); border-radius: var(--radius-md); padding: 12px 14px; font-size: 12px; color: #bae6fd; line-height: 1.4;">
          <strong>Sincronización en la Nube:</strong><br/>
          La app sincroniza en tiempo real contra Supabase. Puedes verificar o actualizar la URL y la clave anon pública.
        </div>

        <div class="admin-form-group">
          <label class="admin-form-label">Project URL de Supabase:</label>
          <input type="text" id="input-supabase-url" class="admin-form-input" placeholder="https://xyzcompany.supabase.co" value="${currentUrl}" />
        </div>

        <div class="admin-form-group">
          <label class="admin-form-label">Project API Key (anon / public):</label>
          <input type="password" id="input-supabase-key" class="admin-form-input" placeholder="eyJhbGciOi..." value="${currentKey}" />
        </div>

        <div id="connection-test-feedback" style="display: none; padding: 10px 14px; border-radius: var(--radius-md); font-size: 12px;"></div>

        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <button type="button" class="btn-secondary" id="btn-cancel-settings">Cerrar</button>
          <button type="button" class="btn-primary" id="btn-save-settings">Probar y Guardar</button>
        </div>
      </div>
    </div>
  `;

  const closeModal = () => { modalRoot.innerHTML = ''; };
  document.getElementById('btn-close-settings-modal')?.addEventListener('click', closeModal);
  document.getElementById('btn-cancel-settings')?.addEventListener('click', closeModal);

  document.getElementById('btn-save-settings')?.addEventListener('click', async () => {
    const url = document.getElementById('input-supabase-url').value.trim();
    const key = document.getElementById('input-supabase-key').value.trim();
    const feedback = document.getElementById('connection-test-feedback');
    const saveBtn = document.getElementById('btn-save-settings');

    if (!url || !key) {
      alert('Por favor ingrese tanto el Project URL como la clave anon');
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Probando conexión...';
    feedback.style.display = 'block';
    feedback.style.background = 'rgba(245, 158, 11, 0.15)';
    feedback.style.color = '#fbbf24';
    feedback.textContent = '⏳ Verificando credenciales con Supabase...';

    const result = await configureSupabase(url, key);

    saveBtn.disabled = false;
    saveBtn.textContent = 'Probar y Guardar';

    if (result.success) {
      feedback.style.background = 'rgba(16, 185, 129, 0.15)';
      feedback.style.color = '#34d399';
      feedback.textContent = `✅ ${result.message}`;
      setTimeout(() => {
        closeModal();
      }, 1500);
    } else {
      feedback.style.background = 'rgba(225, 29, 72, 0.15)';
      feedback.style.color = '#fb7185';
      feedback.textContent = `❌ ${result.message}`;
    }
  });
}
