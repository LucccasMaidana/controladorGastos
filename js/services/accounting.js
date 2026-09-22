/**
 * ============================================================================
 * ACCOUNTING SERVICE (LÓGICA DE NEGOCIO Y REGLAS CONTABLES MULTIUSUARIO)
 * Manejo estricto de decimales, billeteras independientes y consolidación
 * ============================================================================
 */

import { 
  getAllFromStore, 
  getFromStore, 
  putInStore, 
  deleteFromStore, 
  initializeUserWallets,
  clearAllLocalData 
} from '../db/indexedDb.js';
import { pushTransactionToCloud, pushBillToCloud, pushWalletToCloud, getSupabase } from '../db/supabase.js';

// Subscriptores a cambios de estado contable
const listeners = new Set();

export function onAccountingChange(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function notifyAccountingChange() {
  listeners.forEach(cb => {
    try { cb(); } catch (e) { console.error('Error en listener contable:', e); }
  });
}

function notifyChange() {
  notifyAccountingChange();
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
 * Obtener o crear billetera por usuario y tipo ('CASH' o 'DIGITAL')
 */
export async function getWalletByType(userName = 'Usuario', walletType = 'CASH') {
  const normUser = (userName || 'Usuario').trim();
  const userWallets = await initializeUserWallets(normUser);
  userWallets.forEach(w => pushWalletToCloud(w).catch(() => {}));
  const wallets = await getAllFromStore('wallets');
  let wallet = wallets.find(w => 
    w.user_name && w.user_name.toLowerCase() === normUser.toLowerCase() && w.type === walletType
  );

  if (!wallet) {
    wallet = {
      id: `${walletType.toLowerCase()}_${normUser.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
      user_name: normUser,
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
 * 1. REGISTRAR INGRESO (POR USUARIO)
 */
export async function registerIncome({ userName = 'Usuario', walletType, amount, note = '', category = 'Cobro jornada', date = null }) {
  const normUser = (userName || 'Usuario').trim();
  const validAmount = roundCurrency(amount);
  if (validAmount <= 0) throw new Error('El monto debe ser mayor a cero');

  const wallet = await getWalletByType(normUser, walletType);
  wallet.current_balance = roundCurrency(wallet.current_balance + validAmount);
  wallet.updated_at = new Date().toISOString();
  await putInStore('wallets', wallet);

  let txDate;
  if (date) {
    if (typeof date === 'string' && date.length === 10) {
      const now = new Date();
      txDate = new Date(`${date}T${now.toTimeString().split(' ')[0]}`).toISOString();
    } else {
      txDate = new Date(date).toISOString();
    }
  } else {
    txDate = new Date().toISOString();
  }

  const tx = {
    id: generateUUID(),
    user_name: normUser,
    date: txDate,
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
 * 2. REGISTRAR EGRESO (POR USUARIO)
 */
export async function registerExpense({ userName = 'Usuario', walletType, amount, note = '', category = 'Gasto vario', date = null }) {
  const normUser = (userName || 'Usuario').trim();
  const validAmount = roundCurrency(amount);
  if (validAmount <= 0) throw new Error('El monto debe ser mayor a cero');

  const wallet = await getWalletByType(normUser, walletType);
  wallet.current_balance = roundCurrency(wallet.current_balance - validAmount);
  wallet.updated_at = new Date().toISOString();
  await putInStore('wallets', wallet);

  let txDate;
  if (date) {
    if (typeof date === 'string' && date.length === 10) {
      const now = new Date();
      txDate = new Date(`${date}T${now.toTimeString().split(' ')[0]}`).toISOString();
    } else {
      txDate = new Date(date).toISOString();
    }
  } else {
    txDate = new Date().toISOString();
  }

  const tx = {
    id: generateUUID(),
    user_name: normUser,
    date: txDate,
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
 * 3. CÁLCULO DE BALANCE Y MÉTRICAS (POR USUARIO O CONSOLIDADO HOGAR)
 */
export async function getFinancialSummary(userName = null) {
  const wallets = await getAllFromStore('wallets');
  const bills = await getAllFromStore('bills');

  const pendingBills = bills.filter(b => b.status === 'PENDING');
  const totalPendingDebt = roundCurrency(pendingBills.reduce((acc, b) => acc + (Number(b.amount) || 0), 0));

  if (userName) {
    const normUser = userName.trim();
    const matchedWallets = wallets.filter(w => w.user_name && w.user_name.toLowerCase() === normUser.toLowerCase());
    const cash = matchedWallets.find(w => w.type === 'CASH')?.current_balance || 0;
    const digital = matchedWallets.find(w => w.type === 'DIGITAL')?.current_balance || 0;

    return {
      userName,
      totalCash: roundCurrency(cash),
      totalDigital: roundCurrency(digital),
      totalAvailable: roundCurrency(cash + digital),
      totalPendingDebt,
      pendingBillsCount: pendingBills.length,
      realNetBalance: roundCurrency((cash + digital) - totalPendingDebt),
      pendingBills
    };
  } else {
    // Total consolidado del hogar
    const totalCash = roundCurrency(wallets.filter(w => w.type === 'CASH').reduce((a, b) => a + (Number(b.current_balance) || 0), 0));
    const totalDigital = roundCurrency(wallets.filter(w => w.type === 'DIGITAL').reduce((a, b) => a + (Number(b.current_balance) || 0), 0));

    return {
      userName: 'Hogar',
      totalCash,
      totalDigital,
      totalAvailable: roundCurrency(totalCash + totalDigital),
      totalPendingDebt,
      pendingBillsCount: pendingBills.length,
      realNetBalance: roundCurrency((totalCash + totalDigital) - totalPendingDebt),
      pendingBills
    };
  }
}

/**
 * 4. OBTENER LISTA DE TODOS LOS INTEGRANTES REGISTRADOS
 */
export async function getAllRegisteredUsers() {
  const wallets = await getAllFromStore('wallets');
  const txs = await getAllFromStore('transactions');
  const userSet = new Set();

  wallets.forEach(w => { 
    if (w.user_name && w.user_name.toLowerCase() !== 'usuario') userSet.add(w.user_name); 
  });
  txs.forEach(t => { 
    if (t.user_name && t.user_name.toLowerCase() !== 'usuario') userSet.add(t.user_name); 
  });

  return Array.from(userSet).sort();
}

/**
 * 5. GESTIÓN DE FACTURAS (BILLS)
 */
export async function createBill({ serviceName, amount, dueDate, createdBy = 'Admin' }) {
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
    paid_by: null,
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
 * 6. LIQUIDACIÓN DE FACTURA (CON INDICACIÓN DE QUIÉN PAGÓ)
 */
export async function settleBill({ billId, paidByUserName, paidCashAmount, paidDigitalAmount }) {
  const bill = await getFromStore('bills', billId);
  if (!bill) throw new Error('Factura no encontrada');
  if (bill.status === 'PAID') throw new Error('Esta factura ya fue liquidada');

  const cash = roundCurrency(paidCashAmount);
  const digital = roundCurrency(paidDigitalAmount);
  const totalPaid = roundCurrency(cash + digital);
  const payer = (paidByUserName || 'Usuario').trim();

  if (Math.abs(totalPaid - bill.amount) > 0.01) {
    throw new Error(`La suma pagada ($${totalPaid}) debe ser exactamente igual al monto de la factura ($${bill.amount})`);
  }

  // Marcar factura como PAGADA
  bill.status = 'PAID';
  bill.paid_at = new Date().toISOString();
  bill.paid_cash_amount = cash;
  bill.paid_digital_amount = digital;
  bill.paid_by = payer;
  bill.updated_at = new Date().toISOString();

  await putInStore('bills', bill);
  pushBillToCloud(bill);

  // Se generan automáticamente los egresos contables para la persona que pagó:
  if (cash > 0) {
    await registerExpense({
      userName: payer,
      walletType: 'CASH',
      amount: cash,
      category: 'Servicios',
      note: `Pago servicio: ${bill.service_name} (Efectivo)`
    });
  }

  if (digital > 0) {
    await registerExpense({
      userName: payer,
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
 * Obtener transacciones por usuario y filtro de billetera
 */
export async function getTransactions(userName = null, walletFilter = 'ALL') {
  let transactions = await getAllFromStore('transactions');
  if (userName) {
    const norm = userName.trim().toLowerCase();
    transactions = transactions.filter(t => t.user_name && t.user_name.toLowerCase() === norm);
  }
  // Ordenar de más reciente a más antigua
  transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

  if (walletFilter === 'ALL') return transactions;
  return transactions.filter(t => t.wallet_type === walletFilter);
}

/**
 * Obtener todas las facturas
 */
export async function getBillsList(statusFilter = 'ALL') {
  const bills = await getAllFromStore('bills');
  bills.sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

  if (statusFilter === 'ALL') return bills;
  return bills.filter(b => b.status === statusFilter);
}

/**
 * 7. PUESTA A CERO PARA PRODUCCIÓN (VACIAR BASE DE DATOS LOCAL Y NUBE)
 */
export async function wipeAllDataForProduction() {
  await clearAllLocalData();
  localStorage.removeItem('libreta_active_user');

  // Limpiar completamente también las tablas remotas de Supabase
  const client = await getSupabase();
  if (client) {
    try {
      await client.from('transactions').delete().neq('amount', -999999);
      await client.from('bills').delete().neq('amount', -999999);
      await client.from('wallets').delete().neq('current_balance', -999999);
      console.log('☁️ Base de datos en la nube (Supabase) vaciada por completo');
    } catch (e) {
      console.warn('Advertencia al limpiar datos en Supabase:', e);
    }
  }

  notifyChange();
  return true;
}

/**
 * 8. ELIMINAR UN INTEGRANTE INDIVIDUAL ESPECÍFICO (LOCAL Y NUBE)
 */
export async function deleteUserCompletely(userName) {
  if (!userName) return;
  const norm = userName.trim();
  const normLower = norm.toLowerCase();

  const wallets = await getAllFromStore('wallets');
  for (const w of wallets) {
    if (w.user_name && w.user_name.toLowerCase() === normLower) {
      await deleteFromStore('wallets', w.id);
    }
  }

  const txs = await getAllFromStore('transactions');
  for (const t of txs) {
    if (t.user_name && t.user_name.toLowerCase() === normLower) {
      await deleteFromStore('transactions', t.id);
    }
  }

  const client = await getSupabase();
  if (client) {
    try {
      await client.from('wallets').delete().ilike('user_name', norm);
      await client.from('transactions').delete().ilike('user_name', norm);
    } catch (e) {
      console.warn('Error borrando usuario en Supabase:', e);
    }
  }

  if (localStorage.getItem('libreta_active_user')?.toLowerCase() === normLower) {
    localStorage.removeItem('libreta_active_user');
  }

  notifyChange();
}
