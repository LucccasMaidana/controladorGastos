-- ============================================================================
-- LIBRETA CONTABLE Y GESTOR DE SERVICIOS FAMILIARES
-- Esquema de Base de Datos para Supabase (PostgreSQL) - MULTIUSUARIO DINÁMICO
-- ============================================================================

-- 1. Habilitar extensión para UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Conceder uso del esquema public a todos los roles
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- 3. TABLA: wallets (Billeteras individuales por integrante)
CREATE TABLE IF NOT EXISTS public.wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_name TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('CASH', 'DIGITAL')),
    current_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_user_wallet_type UNIQUE (user_name, type)
);

-- Si la tabla ya existía sin la columna user_name, agregarla de forma segura:
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='wallets' AND column_name='user_name') THEN
        ALTER TABLE public.wallets ADD COLUMN user_name TEXT NOT NULL DEFAULT 'Usuario';
        ALTER TABLE public.wallets ADD CONSTRAINT uq_user_wallet_type UNIQUE (user_name, type);
    END IF;
END $$;

-- 4. TABLA: transactions (Movimientos individuales por integrante)
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_name TEXT NOT NULL,
    date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
    type TEXT NOT NULL CHECK (type IN ('INCOME', 'EXPENSE', 'TRANSFER')),
    wallet_type TEXT NOT NULL CHECK (wallet_type IN ('CASH', 'DIGITAL')),
    category TEXT NOT NULL,
    note TEXT,
    is_synced BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transactions' AND column_name='user_name') THEN
        ALTER TABLE public.transactions ADD COLUMN user_name TEXT NOT NULL DEFAULT 'Usuario';
    END IF;
END $$;

-- 5. TABLA: bills (Facturas de servicios compartidas para el hogar)
CREATE TABLE IF NOT EXISTS public.bills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_name TEXT NOT NULL,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
    due_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID')),
    paid_at TIMESTAMPTZ,
    paid_cash_amount NUMERIC(12, 2) DEFAULT 0.00,
    paid_digital_amount NUMERIC(12, 2) DEFAULT 0.00,
    paid_by TEXT,
    second_due_date DATE,
    second_amount NUMERIC(12, 2),
    created_by TEXT DEFAULT 'Admin',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bills' AND column_name='paid_by') THEN
        ALTER TABLE public.bills ADD COLUMN paid_by TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bills' AND column_name='second_due_date') THEN
        ALTER TABLE public.bills ADD COLUMN second_due_date DATE;
        ALTER TABLE public.bills ADD COLUMN second_amount NUMERIC(12, 2);
    END IF;
END $$;

-- 6. CONCEDER TODOS LOS PERMISOS AL ROL ANON Y AUTHENTICATED
GRANT ALL ON TABLE public.wallets TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.transactions TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.bills TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;

-- 7. ÍNDICES DE ALTO RENDIMIENTO
CREATE INDEX IF NOT EXISTS idx_transactions_user ON public.transactions(user_name);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON public.transactions(date DESC);
CREATE INDEX IF NOT EXISTS idx_wallets_user ON public.wallets(user_name);
CREATE INDEX IF NOT EXISTS idx_bills_status ON public.bills(status);
CREATE INDEX IF NOT EXISTS idx_bills_due_date ON public.bills(due_date ASC);
CREATE INDEX IF NOT EXISTS idx_bills_updated_at ON public.bills(updated_at DESC);

-- 8. TRIGGER AUTOMÁTICO PARA ACTUALIZAR updated_at
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_wallets_updated_at ON wallets;
CREATE TRIGGER tr_wallets_updated_at BEFORE UPDATE ON wallets FOR EACH ROW EXECUTE FUNCTION update_modified_column();

DROP TRIGGER IF EXISTS tr_transactions_updated_at ON transactions;
CREATE TRIGGER tr_transactions_updated_at BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION update_modified_column();

DROP TRIGGER IF EXISTS tr_bills_updated_at ON bills;
CREATE TRIGGER tr_bills_updated_at BEFORE UPDATE ON bills FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- ============================================================================
-- 9. PROTECCIÓN CONTRA CLIENTES CON CACHÉ DESACTUALIZADO (SCHEMA VERSION GUARD)
-- Bloquea automáticamente a cualquier cliente con código viejo que intente
-- insertar o modificar usuarios antiguos o saldos desactualizados.
-- ============================================================================

-- Agregar columna schema_version a wallets, transactions y bills
ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS schema_version INT DEFAULT 2;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS schema_version INT DEFAULT 2;
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS schema_version INT DEFAULT 2;

-- Función de validación de versión de protocolo
CREATE OR REPLACE FUNCTION validate_client_version()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.schema_version IS NULL OR NEW.schema_version < 2 THEN
        RAISE EXCEPTION 'CLIENT_OUTDATED: La aplicación en este dispositivo tiene una versión desactualizada en caché. Escritura bloqueada para proteger la base de datos.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_validate_wallet_version ON public.wallets;
CREATE TRIGGER tr_validate_wallet_version
    BEFORE INSERT OR UPDATE ON public.wallets
    FOR EACH ROW
    EXECUTE FUNCTION validate_client_version();

DROP TRIGGER IF EXISTS tr_validate_transaction_version ON public.transactions;
CREATE TRIGGER tr_validate_transaction_version
    BEFORE INSERT OR UPDATE ON public.transactions
    FOR EACH ROW
    EXECUTE FUNCTION validate_client_version();

DROP TRIGGER IF EXISTS tr_validate_bill_version ON public.bills;
CREATE TRIGGER tr_validate_bill_version
    BEFORE INSERT OR UPDATE ON public.bills
    FOR EACH ROW
    EXECUTE FUNCTION validate_client_version();

-- 10. POLÍTICAS DE ROW LEVEL SECURITY (BLOQUEO A NIVEL API)
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir todo acceso a wallets" ON public.wallets;
DROP POLICY IF EXISTS "Permitir escritura solo a clientes actualizados" ON public.wallets;
CREATE POLICY "Permitir todo acceso a wallets" ON public.wallets 
    FOR ALL TO anon, authenticated 
    USING (true) 
    WITH CHECK (schema_version >= 2);

DROP POLICY IF EXISTS "Permitir todo acceso a transactions" ON public.transactions;
DROP POLICY IF EXISTS "Permitir escritura solo a clientes actualizados" ON public.transactions;
CREATE POLICY "Permitir todo acceso a transactions" ON public.transactions 
    FOR ALL TO anon, authenticated 
    USING (true) 
    WITH CHECK (schema_version >= 2);

DROP POLICY IF EXISTS "Permitir todo acceso a bills" ON public.bills;
DROP POLICY IF EXISTS "Permitir escritura solo a clientes actualizados" ON public.bills;
CREATE POLICY "Permitir todo acceso a bills" ON public.bills 
    FOR ALL TO anon, authenticated 
    USING (true) 
    WITH CHECK (schema_version >= 2);

-- 11. Habilitar Publicación en Realtime de forma segura
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bills;
  EXCEPTION WHEN duplicate_object THEN
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
  EXCEPTION WHEN duplicate_object THEN
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.wallets;
  EXCEPTION WHEN duplicate_object THEN
  END;
END $$;
