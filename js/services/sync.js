/**
 * ============================================================================
 * SYNC ENGINE (SINCRONIZACIÓN OPORTUNISTA Y TOLERANCIA A FALLOS)
 * Sincronización bidireccional silenciosa entre Local (IndexedDB) y Supabase
 * ============================================================================
 */

import { getAllFromStore, putInStore, deleteFromStore, clearAllLocalData, getConfig, setConfig } from '../db/indexedDb.js?v=11';
import { 
  getSupabase, 
  pullBillsFromCloud, 
  pushTransactionToCloud, 
  pushWalletToCloud,
  pullWalletsFromCloud,
  pullTransactionsFromCloud,
  subscribeToRealtime 
} from '../db/supabase.js?v=11';
import { notifyAccountingChange } from './accounting.js?v=11';

let syncState = {
  isOnline: navigator.onLine,
  isSyncing: false,
  lastSync: null,
  pendingCount: 0
};

let isWipingInProgress = false;

/**
 * Procedimiento de emergencia cuando se detecta un reinicio total (Puesta a Cero)
 */
export async function handleSystemWipeSignal() {
  if (isWipingInProgress) return;
  isWipingInProgress = true;
  console.warn('🚨 RESET TOTAL DETECTADO: El Administrador ha reiniciado el sistema.');

  try {
    await clearAllLocalData();
  } catch (e) {
    console.error('Error vaciando IndexedDB:', e);
  }

  localStorage.removeItem('libreta_active_user');
  sessionStorage.removeItem('libreta_active_user');

  // Modal / Overlay que bloquea todo el celular
  let overlay = document.getElementById('system-wipe-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'system-wipe-overlay';
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 9999999;
      background: rgba(15, 23, 42, 0.97); backdrop-filter: blur(12px);
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      color: white; text-align: center; padding: 24px; font-family: system-ui, sans-serif;
      animation: fadeIn 0.3s ease-out;
    `;
    overlay.innerHTML = `
      <div style="width: 76px; height: 76px; border-radius: 50%; background: rgba(239, 68, 68, 0.2); border: 2px solid #ef4444; display: flex; align-items: center; justify-content: center; font-size: 38px; margin-bottom: 20px;">
        🗑️
      </div>
      <h2 style="font-size: 22px; font-weight: 800; margin-bottom: 10px; color: #f87171;">
        Sistema Reiniciado
      </h2>
      <p style="font-size: 14px; color: #94a3b8; max-width: 320px; line-height: 1.5; margin-bottom: 24px;">
        El Administrador realizó una <strong>Puesta a Cero</strong>. Se eliminaron todos los usuarios, billeteras y saldos.
      </p>
      <div style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: #38bdf8; font-weight: 600;">
        <span style="display: inline-block; animation: spin 1s linear infinite;">🔄</span>
        <span>Redirigiendo a pantalla de inicio...</span>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  setTimeout(() => {
    window.location.reload();
  }, 1200);
}

const syncListeners = new Set();

export function onSyncStateChange(callback) {
  syncListeners.add(callback);
  callback(syncState);
  return () => syncListeners.delete(callback);
}

function updateSyncState(partial) {
  syncState = { ...syncState, ...partial };
  syncListeners.forEach(cb => {
    try { cb(syncState); } catch (e) { console.error('Error en listener de sync:', e); }
  });
}

/**
 * Ejecutar ciclo completo de sincronización
 */
export async function runSyncCycle(triggerReason = 'manual') {
  if (isWipingInProgress) return { success: false, reason: 'wiping' };

  if (!navigator.onLine) {
    updateSyncState({ isOnline: false, isSyncing: false });
    return { success: false, reason: 'offline' };
  }

  const supabase = await getSupabase();
  if (!supabase) {
    // Sin credenciales configuradas todavía: modo puramente local
    updateSyncState({ isOnline: true, isSyncing: false });
    return { success: true, mode: 'local-only' };
  }

  updateSyncState({ isOnline: true, isSyncing: true });

  try {
    let hasChanges = false;
    const activeUser = localStorage.getItem('libreta_active_user');
    let localWallets = await getAllFromStore('wallets');

    // 0. VERIFICACIÓN CRÍTICA EN LA NUBE (DETECCIÓN DE PUESTA A CERO O USUARIO BORRADO)
    const remoteWallets = await pullWalletsFromCloud();

    if (remoteWallets !== null && Array.isArray(remoteWallets)) {
      // CASO A: Supabase está 100% vacío (Puesta a Cero ejecutada por Admin)
      if (remoteWallets.length === 0) {
        if (localWallets.length > 0 || activeUser) {
          console.warn('⚠️ Supabase está completamente vacío. Puesta a Cero detectada en ciclo de sincronización.');
          await handleSystemWipeSignal();
          return { success: true, wiped: true };
        }
      } else {
        // CASO B: Supabase tiene usuarios, pero el usuario logueado en este dispositivo fue eliminado
        if (activeUser && activeUser.toLowerCase() !== 'admin') {
          const userExistsInCloud = remoteWallets.some(w => 
            w.user_name && w.user_name.trim().toLowerCase() === activeUser.trim().toLowerCase()
          );
          if (!userExistsInCloud) {
            console.warn(`⚠️ El usuario "${activeUser}" ya no existe en la nube. Cerrando sesión local...`);
            await handleSystemWipeSignal();
            return { success: true, wiped: true };
          }
        }

        // CASO C: Limpiar billeteras locales de usuarios eliminados de la nube
        const remoteUserNames = new Set(remoteWallets.map(w => w.user_name?.toLowerCase()).filter(Boolean));
        for (const lw of localWallets) {
          if (lw.user_name && lw.user_name.toLowerCase() !== 'usuario' && !remoteUserNames.has(lw.user_name.toLowerCase())) {
            console.log(`🧹 Eliminando billetera local huérfana de: ${lw.user_name}`);
            await deleteFromStore('wallets', lw.id);
            hasChanges = true;
          }
        }
        localWallets = await getAllFromStore('wallets');
      }
    }

    // 1. PUSH: Enviar transacciones locales pendientes (solo si el usuario aún existe)
    const allTx = await getAllFromStore('transactions');
    const unsyncedTx = allTx.filter(t => !t.is_synced);
    updateSyncState({ pendingCount: unsyncedTx.length });

    for (const tx of unsyncedTx) {
      const ok = await pushTransactionToCloud(tx);
      if (ok) {
        tx.is_synced = true;
        await putInStore('transactions', tx);
      }
    }

    // 2. PUSH: Asegurar que la billetera del usuario activo local esté en la nube
    if (activeUser && activeUser.toLowerCase() !== 'admin') {
      for (const w of localWallets) {
        if (w.user_name && w.user_name.toLowerCase() === activeUser.toLowerCase()) {
          await pushWalletToCloud(w);
        }
      }
    }

    // 3. PULL: Descargar billeteras remotas
    if (remoteWallets && remoteWallets.length > 0) {
      for (const rw of remoteWallets) {
        const local = localWallets.find(lw => 
          lw.user_name?.toLowerCase() === rw.user_name?.toLowerCase() && lw.type === rw.type
        );
        if (!local) {
          await putInStore('wallets', rw);
          hasChanges = true;
        } else if (new Date(rw.updated_at) > new Date(local.updated_at || 0)) {
          await putInStore('wallets', rw);
          hasChanges = true;
        }
      }
    }

    // 4. PULL: Descargar transacciones remotas
    const lastTxSync = await getConfig('last_tx_sync_timestamp');
    const remoteTxs = await pullTransactionsFromCloud(lastTxSync);
    if (remoteTxs && remoteTxs.length > 0) {
      for (const rtx of remoteTxs) {
        const existing = allTx.find(t => t.id === rtx.id);
        if (!existing) {
          rtx.is_synced = true;
          await putInStore('transactions', rtx);
          hasChanges = true;
        }
      }
      await setConfig('last_tx_sync_timestamp', new Date().toISOString());
    }

    // 5. PULL: Descargar facturas actualizadas desde la nube
    const lastSyncTime = await getConfig('last_bills_sync_timestamp');
    const remoteBills = await pullBillsFromCloud(lastSyncTime);

    let newBillsCount = 0;
    if (remoteBills && remoteBills.length > 0) {
      for (const bill of remoteBills) {
        const localBills = await getAllFromStore('bills');
        const existing = localBills.find(b => b.id === bill.id);
        if (!existing && bill.status === 'PENDING') {
          newBillsCount++;
        }
        await putInStore('bills', bill);
        hasChanges = true;
      }
    }

    const now = new Date().toISOString();
    await setConfig('last_bills_sync_timestamp', now);

    // Si hay nuevas facturas y se soportan notificaciones, notificar:
    if (newBillsCount > 0) {
      triggerLocalBillNotification(newBillsCount);
    }

    // Si hubo cambios contables (usuarios nuevos, saldos actualizados), refrescar UI:
    if (hasChanges) {
      notifyAccountingChange();
    }

    updateSyncState({
      isSyncing: false,
      lastSync: now,
      pendingCount: 0
    });

    return { success: true, newBillsCount };
  } catch (error) {
    console.warn('Error durante el ciclo de sincronización:', error);
    updateSyncState({ isSyncing: false });
    return { success: false, error: error.message };
  }
}

/**
 * Notificación local visual / sonora al detectar facturas nuevas
 */
function triggerLocalBillNotification(count) {
  console.log(`🔔 Nuevas facturas detectadas: ${count}`);
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('Factura de Servicio Recibida', {
      body: `Lucas ha cargado ${count} nueva(s) factura(s) para revisar.`,
      icon: 'assets/icon.png'
    });
  }
  // Vibración táctil si el dispositivo lo soporta
  if (navigator.vibrate) {
    navigator.vibrate([200, 100, 200]);
  }
}

/**
 * Iniciar observadores de red y ciclo de sincronización
 */
export function initSyncEngine() {
  window.addEventListener('online', () => {
    console.log('🌐 Conexión a internet restablecida');
    updateSyncState({ isOnline: true });
    runSyncCycle('network-online');
  });

  window.addEventListener('offline', () => {
    console.log('🔌 Conexión desconectada. Modo Offline-First activo');
    updateSyncState({ isOnline: false, isSyncing: false });
  });

  // Suscripción Realtime si Supabase está activo
  subscribeToRealtime((table, payload) => {
    console.log(`📡 Evento Realtime recibido en ${table}:`, payload);
    if (table === 'SYSTEM_WIPED') {
      handleSystemWipeSignal();
      return;
    }
    runSyncCycle('realtime-event');
  });

  // Sincronización oportunista inicial
  runSyncCycle('app-init');

  // Intervalo periódico cada 60s
  setInterval(() => {
    if (navigator.onLine && !syncState.isSyncing) {
      runSyncCycle('interval');
    }
  }, 60000);
}
