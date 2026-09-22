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
export async function getSupabase() {
  if (supabaseClient) return supabaseClient;

  // Cargar credenciales guardadas en la configuración local
  const url = await getConfig('supabase_url');
  const anonKey = await getConfig('supabase_anon_key');

  if (!url || !anonKey) {
    return null; // Sin configurar todavía
  }

  // Verificar si la librería global de Supabase está cargada (desde CDN o bundle)
  const createClientFn = window.supabase?.createClient;
  if (!createClientFn) {
    console.warn('Librería de Supabase no disponible en window.supabase');
    return null;
  }

  try {
    supabaseClient = createClientFn(url, anonKey, {
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
  await setConfig('supabase_url', url.trim());
  await setConfig('supabase_anon_key', anonKey.trim());
  supabaseClient = null; // Reset para recrear
  return await testSupabaseConnection(url, anonKey);
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
    const testClient = createClientFn(url, anonKey);
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
      date: tx.date,
      amount: tx.amount,
      type: tx.type,
      wallet_type: tx.wallet_type,
      category: tx.category,
      note: tx.note,
      is_synced: true,
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
 * Subir o actualizar una factura en la nube (creada o liquidada por Lucas)
 */
export async function pushBillToCloud(bill) {
  const client = await getSupabase();
  if (!client) return false;

  try {
    const { error } = await client.from('bills').upsert({
      id: bill.id,
      service_name: bill.service_name,
      amount: bill.amount,
      due_date: bill.due_date,
      status: bill.status,
      paid_at: bill.paid_at || null,
      paid_cash_amount: bill.paid_cash_amount || 0.00,
      paid_digital_amount: bill.paid_digital_amount || 0.00,
      created_by: bill.created_by || 'Lucas - PC',
      updated_at: new Date().toISOString()
    });

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
 * Suscribirse a cambios en tiempo real (Supabase Realtime)
 */
export async function subscribeToRealtime(onChangeCallback) {
  const client = await getSupabase();
  if (!client) return null;

  try {
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
      .subscribe();

    return channel;
  } catch (e) {
    console.warn('Error iniciando realtime de Supabase:', e);
    return null;
  }
}
