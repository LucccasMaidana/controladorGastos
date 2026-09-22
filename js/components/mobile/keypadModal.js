/**
 * ============================================================================
 * NUMERIC KEYPAD MODAL (TECLADO NUMÉRICO TÁCTIL EN PANTALLA)
 * Carga rápida sin abrir el teclado nativo de Android
 * ============================================================================
 */

import { registerIncome, registerExpense, formatCurrency } from '../../services/accounting.js?v=12';

let currentModalState = {
  isOpen: false,
  userName: 'Usuario',
  mode: 'INCOME', // 'INCOME' o 'EXPENSE'
  amountStr: '0',
  walletType: 'CASH', // 'CASH' o 'DIGITAL'
  category: 'Cobro jornada',
  date: new Date().toISOString().split('T')[0],
  note: '',
  onCloseCallback: null
};

export function openKeypadModal(mode = 'INCOME', userName = 'Usuario', onClose = null) {
  const todayStr = new Date().toISOString().split('T')[0];
  currentModalState = {
    isOpen: true,
    userName: userName || 'Usuario',
    mode: mode,
    amountStr: '0',
    walletType: 'CASH',
    category: mode === 'INCOME' ? 'Cobro jornada' : 'Supermercado',
    date: todayStr,
    note: '',
    onCloseCallback: onClose
  };
  renderKeypadModal();
}

export function closeKeypadModal() {
  currentModalState.isOpen = false;
  const container = document.getElementById('keypad-modal-root');
  if (container) {
    container.innerHTML = '';
  }
  if (currentModalState.onCloseCallback) {
    currentModalState.onCloseCallback();
  }
}

function handleKeyPress(key) {
  if (navigator.vibrate) navigator.vibrate(20);

  let current = currentModalState.amountStr;

  if (key === 'CLEAR') {
    current = '0';
  } else if (key === 'BACKSPACE') {
    if (current.length <= 1) {
      current = '0';
    } else {
      current = current.slice(0, -1);
    }
  } else if (key === '00') {
    if (current !== '0' && current.length < 9) {
      current += '00';
    }
  } else {
    // Dígitos 0-9
    if (current === '0') {
      current = key;
    } else if (current.length < 10) {
      current += key;
    }
  }

  currentModalState.amountStr = current;
  updateDisplayAmount();
}

function updateDisplayAmount() {
  const amountEl = document.getElementById('modal-display-digits');
  if (amountEl) {
    const num = parseFloat(currentModalState.amountStr) || 0;
    amountEl.textContent = formatCurrency(num);
  }
}

async function handleSaveTransaction() {
  const amount = parseFloat(currentModalState.amountStr) || 0;
  if (amount <= 0) {
    alert('Por favor ingrese un monto mayor a cero');
    return;
  }

  const dateInput = document.getElementById('modal-input-date');
  const chosenDate = dateInput?.value || currentModalState.date;

  const saveBtn = document.getElementById('btn-modal-save');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Guardando...';
  }

  try {
    if (currentModalState.mode === 'INCOME') {
      await registerIncome({
        userName: currentModalState.userName,
        walletType: currentModalState.walletType,
        amount: amount,
        category: currentModalState.category,
        note: currentModalState.note,
        date: chosenDate
      });
    } else {
      await registerExpense({
        userName: currentModalState.userName,
        walletType: currentModalState.walletType,
        amount: amount,
        category: currentModalState.category,
        note: currentModalState.note,
        date: chosenDate
      });
    }

    if (navigator.vibrate) navigator.vibrate([40, 60, 40]);
    closeKeypadModal();
  } catch (err) {
    alert(`Error: ${err.message}`);
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Guardar';
    }
  }
}

export function renderKeypadModal() {
  const container = document.getElementById('keypad-modal-root');
  if (!container || !currentModalState.isOpen) return;

  const isIncome = currentModalState.mode === 'INCOME';
  const title = isIncome ? 'Anotar Cobro' : 'Anotar Gasto';
  const icon = isIncome ? '💰' : '🛒';
  const chipClass = isIncome ? 'income' : 'expense';

  const incomeCategories = ['Cobro jornada', 'Propina', 'Horas extra', 'Aguinaldo', 'Varios'];
  const expenseCategories = ['Supermercado', 'Transporte', 'Farmacia', 'Verdulería', 'Kiosco', 'Varios'];
  const categories = isIncome ? incomeCategories : expenseCategories;

  container.innerHTML = `
    <div class="keypad-modal-overlay" id="modal-overlay-bg">
      <div class="keypad-modal-content">
        <!-- Barra de Encabezado -->
        <div class="modal-header-bar">
          <div class="modal-title-chip ${chipClass}">
            <span>${icon}</span>
            <span>${title}</span>
          </div>
          <button class="modal-btn-close" id="btn-modal-close" title="Cerrar">✕</button>
        </div>

        <!-- Pantalla de Monto Grande -->
        <div class="modal-amount-display">
          <span class="amount-currency-label">Monto a registrar</span>
          <div class="amount-digits" id="modal-display-digits">
            ${formatCurrency(parseFloat(currentModalState.amountStr) || 0)}
          </div>
        </div>

        <!-- Conmutador [ Billete ] / [ Digital ] -->
        <div class="wallet-toggle-group">
          <button type="button" class="wallet-toggle-btn ${currentModalState.walletType === 'CASH' ? 'active cash' : ''}" id="toggle-cash">
            <span>💵</span>
            <span>En Billetes</span>
          </button>
          <button type="button" class="wallet-toggle-btn ${currentModalState.walletType === 'DIGITAL' ? 'active digital' : ''}" id="toggle-digital">
            <span>💳</span>
            <span>En Digital</span>
          </button>
        </div>

        <!-- Selector de Fecha del Movimiento -->
        <div style="display: flex; align-items: center; justify-content: space-between; background: var(--bg-surface); border: 1px solid var(--border-subtle); padding: 8px 12px; border-radius: var(--radius-md); margin-bottom: 8px;">
          <label for="modal-input-date" style="font-size: 13px; font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 6px;">
            <span>📅</span>
            <span>Fecha:</span>
          </label>
          <input 
            type="date" 
            id="modal-input-date" 
            value="${currentModalState.date}" 
            style="background: var(--bg-input); border: 1px solid var(--border-medium); color: var(--text-main); padding: 6px 10px; border-radius: var(--radius-sm); font-family: inherit; font-size: 13px; font-weight: 700; cursor: pointer;"
          />
        </div>

        <!-- Categorías Rápidas -->
        <div class="quick-categories-bar" id="category-chips-bar">
          ${categories.map(cat => `
            <button type="button" class="category-chip ${currentModalState.category === cat ? 'active' : ''}" data-cat="${cat}">
              ${cat}
            </button>
          `).join('')}
        </div>

        <!-- Campo de Nota Opcional -->
        <input 
          type="text" 
          id="modal-note-input" 
          class="note-input-field" 
          placeholder="¿Algún detalle? (ej: Casa Marta, propina)" 
          value="${currentModalState.note}"
          maxlength="60"
        />

        <!-- TECLADO NUMÉRICO TÁCTIL GIGANTE -->
        <div class="numeric-keypad-grid">
          <button type="button" class="keypad-key" data-key="1">1</button>
          <button type="button" class="keypad-key" data-key="2">2</button>
          <button type="button" class="keypad-key" data-key="3">3</button>
          
          <button type="button" class="keypad-key" data-key="4">4</button>
          <button type="button" class="keypad-key" data-key="5">5</button>
          <button type="button" class="keypad-key" data-key="6">6</button>
          
          <button type="button" class="keypad-key" data-key="7">7</button>
          <button type="button" class="keypad-key" data-key="8">8</button>
          <button type="button" class="keypad-key" data-key="9">9</button>
          
          <button type="button" class="keypad-key" data-key="00">00</button>
          <button type="button" class="keypad-key" data-key="0">0</button>
          <button type="button" class="keypad-key action-backspace" data-key="BACKSPACE">⌫</button>
        </div>

        <!-- Botón Guardar Gigante -->
        <button type="button" class="btn-save-transaction ${chipClass}" id="btn-modal-save">
          <span>✓</span>
          <span>Guardar ${isIncome ? 'Cobro' : 'Gasto'}</span>
        </button>
      </div>
    </div>
  `;

  // Listeners de eventos
  document.getElementById('btn-modal-close').addEventListener('click', closeKeypadModal);
  
  // Selector de Fecha
  document.getElementById('modal-input-date')?.addEventListener('change', (e) => {
    currentModalState.date = e.target.value;
  });

  // Conmutador Billeteras
  document.getElementById('toggle-cash').addEventListener('click', () => {
    currentModalState.walletType = 'CASH';
    renderKeypadModal();
  });
  document.getElementById('toggle-digital').addEventListener('click', () => {
    currentModalState.walletType = 'DIGITAL';
    renderKeypadModal();
  });

  // Categorías
  document.querySelectorAll('.category-chip').forEach(btn => {
    btn.addEventListener('click', (e) => {
      currentModalState.category = e.target.dataset.cat;
      renderKeypadModal();
    });
  });

  // Nota input
  const noteInput = document.getElementById('modal-note-input');
  noteInput.addEventListener('input', (e) => {
    currentModalState.note = e.target.value;
  });

  // Teclado numérico
  document.querySelectorAll('.keypad-key').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const key = e.currentTarget.dataset.key;
      handleKeyPress(key);
    });
  });

  // Guardar
  document.getElementById('btn-modal-save').addEventListener('click', handleSaveTransaction);
}
