/**
 * ============================================================================
 * ACCOUNTING SERVICE (LÓGICA DE NEGOCIO Y REGLAS CONTABLES)
 * Manejo estricto de decimales, cálculo de métricas y liquidación de facturas
 * ============================================================================
 */

import { 
  getAllFromStore, 
  getFromStore, 
  putInStore, 
  deleteFromStore, 
  initializeDefaultWallets 
} from '../db/indexedDb.js';
import { pushTransactionToCloud, pushBillToCloud } from '../db/supabase.js';

// Subscriptores a cambios de estado contable
const listeners = new Set();

export function onAccountingChange(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function notifyChange() {
  listeners.forEach(cb => {
    try { cb(); } catch (e) { console.error('Error en listener contable:', e); }
  });
}

/**
 * Redondear monto a 2 decimales exactos
 */
export function roundCurrency(amount) {
  return Math.round((Number(amount) || 0) * 100) / 100;
}

/**
 * Formatear número como moneda ($ 15.000,00)
 */
export function formatCurrency(amount) {
  const rounded = roundCurrency(amount);
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(rounded);
}

/**
 * Generar UUID v4 para compatibilidad nube/local
 */
export function generateUUID() {
  if (crypto && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Obtener billetera por tipo ('CASH' o 'DIGITAL')
 */
export async function getWalletByType(walletType) {
  await initializeDefaultWallets();
  const wallets = await getAllFromStore('wallets');
  let wallet = wallets.find(w => w.type === walletType);

  if (!wallet) {
    wallet = {
      id: walletType === 'CASH' ? 'cash_wallet' : 'digital_wallet',
      name: walletType === 'CASH' ? 'Billetes en Mano' : 'Cuenta Digital / MP',
      type: walletType,
      current_balance: 0.00,
      updated_at: new Date().toISOString()
    };
    await putInStore('wallets', wallet);
  }
  return wallet;
}

/**
 * 1. REGISTRAR INGRESO DIARIO
 */
export async function registerIncome({ walletType, amount, note = '', category = 'Cobro jornada' }) {
  const validAmount = roundCurrency(amount);
  if (validAmount <= 0) throw new Error('El monto debe ser mayor a cero');

  const wallet = await getWalletByType(walletType);
  wallet.current_balance = roundCurrency(wallet.current_balance + validAmount);
  wallet.updated_at = new Date().toISOString();
  await putInStore('wallets', wallet);

  const tx = {
    id: generateUUID(),
    date: new Date().toISOString(),
    amount: validAmount,
    type: 'INCOME',
    wallet_type: walletType,
    category: category.trim() || 'Cobro jornada',
    note: note.trim() || '',
    is_synced: false
  };

  await putInStore('transactions', tx);
  
  // Intento de push a la nube silencioso
  pushTransactionToCloud(tx).then(synced => {
    if (synced) {
      tx.is_synced = true;
      putInStore('transactions', tx);
    }
  });

  notifyChange();
  return tx;
}

/**
 * 2. REGISTRAR EGRESO COMÚN
 */
export async function registerExpense({ walletType, amount, note = '', category = 'Gasto vario' }) {
  const validAmount = roundCurrency(amount);
  if (validAmount <= 0) throw new Error('El monto debe ser mayor a cero');

  const wallet = await getWalletByType(walletType);
  wallet.current_balance = roundCurrency(wallet.current_balance - validAmount);
  wallet.updated_at = new Date().toISOString();
  await putInStore('wallets', wallet);

  const tx = {
    id: generateUUID(),
    date: new Date().toISOString(),
    amount: validAmount,
    type: 'EXPENSE',
    wallet_type: walletType,
    category: category.trim() || 'Gasto vario',
    note: note.trim() || '',
    is_synced: false
  };

  await putInStore('transactions', tx);

  // Intento de push silencioso
  pushTransactionToCloud(tx).then(synced => {
    if (synced) {
      tx.is_synced = true;
      putInStore('transactions', tx);
    }
  });

  notifyChange();
  return tx;
}

/**
 * 3. CÁLCULO DE BALANCE Y MÉTRICAS
 */
export async function getFinancialSummary() {
  await initializeDefaultWallets();
  const cashWallet = await getWalletByType('CASH');
  const digitalWallet = await getWalletByType('DIGITAL');
  const bills = await getAllFromStore('bills');

  const pendingBills = bills.filter(b => b.status === 'PENDING');
  const totalCash = roundCurrency(cashWallet.current_balance);
  const totalDigital = roundCurrency(digitalWallet.current_balance);
  const totalPendingDebt = roundCurrency(pendingBills.reduce((acc, b) => acc + (Number(b.amount) || 0), 0));
  const realNetBalance = roundCurrency((totalCash + totalDigital) - totalPendingDebt);

  return {
    totalCash,
    totalDigital,
    totalAvailable: roundCurrency(totalCash + totalDigital),
    totalPendingDebt,
    pendingBillsCount: pendingBills.length,
    realNetBalance,
    pendingBills
  };
}

/**
 * 4. GESTIÓN DE FACTURAS (BILLS)
 */

export async function createBill({ serviceName, amount, dueDate, createdBy = 'Lucas - PC' }) {
  const validAmount = roundCurrency(amount);
  if (validAmount <= 0) throw new Error('El monto de la factura debe ser mayor a cero');
  if (!serviceName) throw new Error('Debe especificar el nombre del servicio');
  if (!dueDate) throw new Error('Debe especificar la fecha de vencimiento');

  const bill = {
    id: generateUUID(),
    service_name: serviceName.trim(),
    amount: validAmount,
    due_date: dueDate,
    status: 'PENDING',
    paid_at: null,
    paid_cash_amount: 0.00,
    paid_digital_amount: 0.00,
    created_by: createdBy,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  await putInStore('bills', bill);
  pushBillToCloud(bill);

  notifyChange();
  return bill;
}

/**
 * 5. LIQUIDACIÓN DE FACTURA (DESGLOSE DE PAGO EFECTIVO / DIGITAL)
 * Al pagar una factura, genera automáticamente los egresos correspondientes
 */
export async function settleBill({ billId, paidCashAmount, paidDigitalAmount }) {
  const bill = await getFromStore('bills', billId);
  if (!bill) throw new Error('Factura no encontrada');
  if (bill.status === 'PAID') throw new Error('Esta factura ya fue liquidada');

  const cash = roundCurrency(paidCashAmount);
  const digital = roundCurrency(paidDigitalAmount);
  const totalPaid = roundCurrency(cash + digital);

  if (Math.abs(totalPaid - bill.amount) > 0.01) {
    throw new Error(`La suma pagada ($${totalPaid}) debe ser exactamente igual al monto de la factura ($${bill.amount})`);
  }

  // Marcar factura como PAGADA
  bill.status = 'PAID';
  bill.paid_at = new Date().toISOString();
  bill.paid_cash_amount = cash;
  bill.paid_digital_amount = digital;
  bill.updated_at = new Date().toISOString();

  await putInStore('bills', bill);
  pushBillToCloud(bill);

  // d) Se generan automáticamente los egresos contables:
  if (cash > 0) {
    await registerExpense({
      walletType: 'CASH',
      amount: cash,
      category: 'Servicios',
      note: `Pago servicio: ${bill.service_name} (Efectivo)`
    });
  }

  if (digital > 0) {
    await registerExpense({
      walletType: 'DIGITAL',
      amount: digital,
      category: 'Servicios',
      note: `Pago servicio: ${bill.service_name} (Transferencia)`
    });
  }

  notifyChange();
  return bill;
}

/**
 * Eliminar factura
 */
export async function deleteBill(billId) {
  await deleteFromStore('bills', billId);
  notifyChange();
}

/**
 * Obtener transacciones con filtro
 */
export async function getTransactions(walletFilter = 'ALL') {
  const transactions = await getAllFromStore('transactions');
  // Ordenar de más reciente a más antigua
  transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

  if (walletFilter === 'ALL') return transactions;
  return transactions.filter(t => t.wallet_type === walletFilter);
}

/**
 * Obtener todas las facturas ordenadas por fecha de vencimiento
 */
export async function getBillsList(statusFilter = 'ALL') {
  const bills = await getAllFromStore('bills');
  bills.sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

  if (statusFilter === 'ALL') return bills;
  return bills.filter(b => b.status === statusFilter);
}
