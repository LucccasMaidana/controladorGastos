/**
 * ============================================================================
 * SUPABASE CLIENT & CLOUD SYNC ADAPTER
 * Integración con Supabase para sincronización en la nube (PostgreSQL + Realtime)
 * ============================================================================
 */

import { getConfig, setConfig } from './indexedDb.js';

let supabaseClient = null;

/**
 * Obtener o inicializar la instancia de Supabase
 */
export function sanitizeSupabaseUrl(url) {
  if (!url) return '';
  let clean = url.trim();
  clean = clean.replace(/\/rest\/v1\/?$/i, '');
  clean = clean.replace(/\/+$/, '');
  return clean;
}

export async function getSupabase() {
  if (supabaseClient) return supabaseClient;

  // Cargar credenciales guardadas en la configuración local
  const rawUrl = await getConfig('supabase_url');
  const anonKey = await getConfig('supabase_anon_key');

  if (!rawUrl || !anonKey) {
    return null; // Sin configurar todavía
  }

  const url = sanitizeSupabaseUrl(rawUrl);

  // Verificar si la librería global de Supabase está cargada (desde CDN o bundle)
  const createClientFn = window.supabase?.createClient;
  if (!createClientFn) {
    console.warn('Librería de Supabase no disponible en window.supabase');
    return null;
  }

  try {
    supabaseClient = createClientFn(url, anonKey.trim(), {
      auth: { persistSession: false }
    });
    return supabaseClient;
  } catch (err) {
    console.error('Error al inicializar cliente Supabase:', err);
    return null;
  }
}

/**
 * Guardar nuevas credenciales y reconfigurar cliente
 */
export async function configureSupabase(url, anonKey) {
  const cleanUrl = sanitizeSupabaseUrl(url);
  const cleanKey = anonKey.trim();
  await setConfig('supabase_url', cleanUrl);
  await setConfig('supabase_anon_key', cleanKey);
  supabaseClient = null; // Reset para recrear
  return await testSupabaseConnection(cleanUrl, cleanKey);
}

/**
 * Probar conexión con Supabase
 */
export async function testSupabaseConnection(url, anonKey) {
  const createClientFn = window.supabase?.createClient;
  if (!createClientFn) {
    return { success: false, message: 'La librería Supabase JS no se cargó correctamente.' };
  }

  try {
    const cleanUrl = sanitizeSupabaseUrl(url);
    const testClient = createClientFn(cleanUrl, anonKey.trim());
    // Intentar leer la tabla bills o wallets
    const { data, error } = await testClient.from('wallets').select('id').limit(1);

    if (error) {
      return { 
        success: false, 
        message: `Error de Supabase: ${error.message} (Código: ${error.code || 'Desconocido'})` 
      };
    }

    return { 
      success: true, 
      message: '¡Conexión exitosa con Supabase! Base de datos lista.' 
    };
  } catch (err) {
    return { 
      success: false, 
      message: `Fallo de red o URL inválida: ${err.message}` 
    };
  }
}

/**
 * Subir una transacción a Supabase
 */
export async function pushTransactionToCloud(tx) {
  const client = await getSupabase();
  if (!client) return false;

  try {
    const { error } = await client.from('transactions').upsert({
      id: tx.id,
      user_name: tx.user_name || 'Usuario',
      date: tx.date,
      amount: tx.amount,
      type: tx.type,
      wallet_type: tx.wallet_type,
      category: tx.category,
      note: tx.note,
      is_synced: true,
      schema_version: 2,
      updated_at: new Date().toISOString()
    });

    if (error) {
      console.error('Error enviando transacción a la nube:', error);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('Error de red al subir transacción:', e);
    return false;
  }
}

/**
 * Subir o actualizar una billetera a Supabase
 */
export async function pushWalletToCloud(wallet) {
  const client = await getSupabase();
  if (!client) return false;

  try {
    const { error } = await client.from('wallets').upsert({
      id: wallet.id,
      user_name: wallet.user_name,
      name: wallet.name,
      type: wallet.type,
      current_balance: wallet.current_balance,
      schema_version: 2,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_name,type' });

    if (error) {
      console.error('Error subiendo billetera a Supabase:', error);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('Error de red al subir billetera:', e);
    return false;
  }
}

/**
 * Descargar billeteras desde la nube (Pull)
 */
export async function pullWalletsFromCloud() {
  const client = await getSupabase();
  if (!client) return null;

  try {
    const { data, error } = await client.from('wallets').select('*');
    if (error) {
      console.error('Error descargando billeteras de Supabase:', error);
      return null;
    }
    return data || [];
  } catch (e) {
    console.warn('Fallo de red al descargar billeteras:', e);
    return null;
  }
}

/**
 * Subir o actualizar una factura en la nube (creada o liquidada por Lucas)
 */
export async function pushBillToCloud(bill) {
  const client = await getSupabase();
  if (!client) return false;

  try {
    const payload = {
      id: bill.id,
      service_name: bill.service_name,
      amount: bill.amount,
      due_date: bill.due_date,
      status: bill.status,
      paid_at: bill.paid_at || null,
      paid_cash_amount: bill.paid_cash_amount || 0.00,
      paid_digital_amount: bill.paid_digital_amount || 0.00,
      paid_by: bill.paid_by || null,
      created_by: bill.created_by || 'Admin',
      schema_version: 2,
      updated_at: new Date().toISOString()
    };

    if (bill.second_due_date) {
      payload.second_due_date = bill.second_due_date;
    }
    if (bill.second_amount !== undefined && bill.second_amount !== null && !isNaN(bill.second_amount)) {
      payload.second_amount = Number(bill.second_amount);
    }

    let { error } = await client.from('bills').upsert(payload);

    // Fallback defensivo si Supabase todavía no tiene agregadas las columnas second_due_date / second_amount
    if (error && (error.message?.includes('second_due_date') || error.message?.includes('second_amount'))) {
      console.warn('Columnas de 2° vencimiento pendientes en Supabase, reintentando carga básica...');
      delete payload.second_due_date;
      delete payload.second_amount;
      const res = await client.from('bills').upsert(payload);
      error = res.error;
    }

    if (error) {
      console.error('Error subiendo factura a Supabase:', error);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('Error de red al subir factura:', e);
    return false;
  }
}

/**
 * Descargar facturas desde la nube (Pull)
 */
export async function pullBillsFromCloud(lastSyncTimestamp = null) {
  const client = await getSupabase();
  if (!client) return [];

  try {
    let query = client.from('bills').select('*');
    if (lastSyncTimestamp) {
      query = query.gt('updated_at', lastSyncTimestamp);
    }
    const { data, error } = await query;
    if (error) {
      console.error('Error descargando facturas de Supabase:', error);
      return [];
    }
    return data || [];
  } catch (e) {
    console.warn('Fallo de red al descargar facturas:', e);
    return [];
  }
}

/**
 * Descargar transacciones desde la nube (Pull)
 */
export async function pullTransactionsFromCloud(lastSyncTimestamp = null) {
  const client = await getSupabase();
  if (!client) return null;

  try {
    let query = client.from('transactions').select('*');
    if (lastSyncTimestamp) {
      query = query.gt('updated_at', lastSyncTimestamp);
    }
    const { data, error } = await query;
    if (error) {
      console.error('Error descargando transacciones de Supabase:', error);
      return null;
    }
    return data || [];
  } catch (e) {
    console.warn('Fallo de red al descargar transacciones:', e);
    return null;
  }
}

let activeRealtimeChannel = null;

/**
 * Suscribirse a cambios en tiempo real (Supabase Realtime)
 */
export async function subscribeToRealtime(onChangeCallback) {
  const client = await getSupabase();
  if (!client) return null;

  try {
    if (activeRealtimeChannel) {
      try { client.removeChannel(activeRealtimeChannel); } catch (_) {}
    }

    const channel = client
      .channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bills' }, (payload) => {
        console.log('⚡ Cambio en facturas en tiempo real recibido:', payload);
        onChangeCallback('bills', payload);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, (payload) => {
        console.log('⚡ Cambio en transacciones en tiempo real recibido:', payload);
        onChangeCallback('transactions', payload);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallets' }, (payload) => {
        console.log('⚡ Cambio en billeteras en tiempo real recibido:', payload);
        onChangeCallback('wallets', payload);
      })
      .on('broadcast', { event: 'SYSTEM_WIPED' }, (payload) => {
        console.log('🚨 Alerta Realtime: Reinicio total del sistema ordenado por Administrador');
        onChangeCallback('SYSTEM_WIPED', payload);
      })
      .subscribe();

    activeRealtimeChannel = channel;
    return channel;
  } catch (e) {
    console.warn('Error iniciando realtime de Supabase:', e);
    return null;
  }
}

/**
 * Emitir señal de reinicio total a todos los celulares y pestañas conectadas
 */
export async function broadcastSystemWipe() {
  const client = await getSupabase();
  if (!client) return;

  try {
    if (activeRealtimeChannel) {
      await activeRealtimeChannel.send({
        type: 'broadcast',
        event: 'SYSTEM_WIPED',
        payload: { timestamp: new Date().toISOString() }
      });
      console.log('📡 Broadcast SYSTEM_WIPED transmitido exitosamente por canal activo');
      await new Promise(r => setTimeout(r, 250));
    } else {
      const channel = client.channel('schema-db-changes');
      await new Promise((resolve) => {
        channel.subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await channel.send({
              type: 'broadcast',
              event: 'SYSTEM_WIPED',
              payload: { timestamp: new Date().toISOString() }
            });
            console.log('📡 Broadcast SYSTEM_WIPED transmitido tras suscripción');
            setTimeout(resolve, 250);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            resolve();
          }
        });
        setTimeout(resolve, 2000);
      });
    }
  } catch (e) {
    console.warn('Error emitiendo broadcast de reinicio:', e);
  }
}


