const { createClient } = require('@supabase/supabase-js');

// 🔐 Puxa as credenciais secretas do arquivo .env com segurança
const supabaseUrl = process.env.SUPABASE_URL ? process.env.SUPABASE_URL.trim() : '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ? process.env.SUPABASE_SERVICE_ROLE_KEY.trim() : '';

// 🛡️ Validação de segurança para garantir que o servidor não quebre caso falte as chaves
if (!supabaseUrl || !supabaseServiceKey) {
    console.error("🚨 ERRO CRÍTICO: Chaves de conexão do Supabase estão ausentes no arquivo .env!");
}

// 🌐 Inicializa o cliente oficial do banco de dados em modo administrador (Service Role)
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        persistSession: false // Como roda no servidor backend, desativa cookies de sessão de usuário
    }
});

console.log("🔌 MOTOR: Conexão com o banco de dados Supabase inicializada com sucesso.");

module.exports = { supabase };
