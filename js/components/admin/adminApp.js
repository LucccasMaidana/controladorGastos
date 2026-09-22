/**
 * ============================================================================
 * ADMIN WEB CONTROLLER (PANEL PC DE LUCAS)
 * Carga de facturas, liquidación con desglose automático y configuración Supabase
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
  onAccountingChange 
} from '../../services/accounting.js';
import { configureSupabase, testSupabaseConnection } from '../../db/supabase.js';
import { getConfig } from '../../db/indexedDb.js';

let activeFilter = 'PENDING'; // 'PENDING', 'PAID', 'ALL'
let selectedBillForSettlement = null;

export function initAdminApp(rootElement) {
  onAccountingChange(() => {
    renderAdminApp(rootElement);
  });

  renderAdminApp(rootElement);
}

export async function renderAdminApp(rootElement) {
  const summary = await getFinancialSummary();
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
          <p>Control de boletas del hogar y conciliación de pagos con Mariel</p>
        </div>

        <div class="admin-header-actions">
          <button type="button" class="btn-secondary" id="btn-open-settings">
            <span>⚙️</span>
            <span>${isCloudConnected ? 'Nube Conectada' : 'Conectar Supabase'}</span>
          </button>
          <button type="button" class="btn-primary" id="btn-open-create-bill">
            <span>＋</span>
            <span>Cargar Nueva Factura</span>
          </button>
        </div>
      </div>

      <!-- Métricas Financieras Familiares (4 Tarjetas) -->
      <div class="admin-metrics-grid">
        <div class="metric-card">
          <div class="metric-header">
            <span class="metric-title">Billetes en Mano (Mariel)</span>
            <span class="metric-badge">💵</span>
          </div>
          <div class="metric-value cash">${formatCurrency(summary.totalCash)}</div>
          <div class="metric-subtext">Efectivo físico disponible</div>
        </div>

        <div class="metric-card">
          <div class="metric-header">
            <span class="metric-title">En Cuenta Digital / MP</span>
            <span class="metric-badge">💳</span>
          </div>
          <div class="metric-value digital">${formatCurrency(summary.totalDigital)}</div>
          <div class="metric-subtext">Transferencias y billeteras</div>
        </div>

        <div class="metric-card">
          <div class="metric-header">
            <span class="metric-title">Facturas Pendientes</span>
            <span class="metric-badge">⚠️</span>
          </div>
          <div class="metric-value warning">${formatCurrency(summary.totalPendingDebt)}</div>
          <div class="metric-subtext">${summary.pendingBillsCount} boleta(s) por pagar</div>
        </div>

        <div class="metric-card">
          <div class="metric-header">
            <span class="metric-title">Balance Real Neto</span>
            <span class="metric-badge">📊</span>
          </div>
          <div class="metric-value net">${formatCurrency(summary.realNetBalance)}</div>
          <div class="metric-subtext">Total disponible menos deudas</div>
        </div>
      </div>

      <!-- Controles de Tabla y Filtros -->
      <div class="admin-table-controls">
        <div style="font-size: 15px; font-weight: 700;">
          Listado de Servicios y Facturas
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
                        <div style="font-size: 11px; color: var(--text-dim);">Cargado por: ${bill.created_by || 'Lucas'}</div>
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
                      <div>💵 Efectivo: $${bill.paid_cash_amount || 0}</div>
                      <div>💳 Digital: $${bill.paid_digital_amount || 0}</div>
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
  document.getElementById('btn-open-create-bill')?.addEventListener('click', () => openCreateBillModal(rootElement));
  document.getElementById('btn-open-settings')?.addEventListener('click', () => openSettingsModal(rootElement));

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
        openSettleBillModal(bill, rootElement);
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

  // Fecha de vencimiento por defecto: 7 días en adelante
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

  // Presets click
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
        createdBy: 'Lucas - PC'
      });
      closeModal();
    } catch (err) {
      alert(`Error al guardar factura: ${err.message}`);
    }
  });
}

// ============================================================================
// MODAL: LIQUIDAR FACTURA (DESGLOSE BILLETE / DIGITAL)
// ============================================================================
function openSettleBillModal(bill, rootElement) {
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

    const diff = roundCurrency(totalAmount - currentSum);

    if (Math.abs(diff) <= 0.01) {
      feedbackBox.className = 'validation-feedback-box valid';
      feedbackBox.innerHTML = `
        <span>✓</span>
        <span>Desglose exacto: ${formatCurrency(currentSum)}. Se generarán automáticamente 2 egresos en la app de Mariel.</span>
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

        <!-- Presets Rápidos de Desglose -->
        <div class="admin-form-group">
          <label class="admin-form-label">Distribución rápida del dinero entregado:</label>
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

        <div class="settlement-note">
          ℹ️ <strong>Importante:</strong> Al confirmar, esta boleta pasará a estado <strong>PAGADA</strong> y se generarán automáticamente los registros de egreso correspondientes en la libreta de Mariel, descontando los saldos en cuanto sincronice.
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

  cashInput.addEventListener('input', updateFeedback);
  digitalInput.addEventListener('input', updateFeedback);

  // Preset buttons
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

    try {
      await settleBill({
        billId: bill.id,
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
          <strong>Pasos para conectar la nube (Gratis en 3 minutos):</strong><br/>
          1. Entra a <strong>supabase.com</strong> y crea un proyecto.<br/>
          2. En <strong>Settings -> API</strong> copia el URL y la clave anon.<br/>
          3. Pega el script <code>supabase_schema.sql</code> en el SQL Editor de Supabase y ¡listo!
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
