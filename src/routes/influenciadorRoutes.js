const { supabase } = require('../supabase');

// 🔌 FUNÇÃO: Buscar dados do influenciador cruzando o E-MAIL logado com o cupom dele
async function obterDadosInfluenciador(req, res) {
    const { email } = req.query; // 🌟 LÊ O EMAIL AUTOMÁTICO DO LOGIN!

    if (!email) {
        return res.status(400).json({ sucesso: false, mensagem: "E-mail de acesso não fornecido." });
    }

    try {
        // 🔍 1. Abre a tabela 'cupons_afiliados' e procura qual cupom pertence a esse e-mail de login!
        const { data: cupomInfo, error: erroCupom } = await supabase
            .from('cupons_afiliados')
            .select('*')
            .eq('email_influenciador', email.trim())
            .single();

        if (erroCupom || !cupomInfo) {
            return res.status(404).json({ sucesso: false, mensagem: "Sua conta de e-mail ainda não possui um cupom de parceiro vinculado no Supabase." });
        }

        // 📊 2. Busca as indicações que usaram o cupom descoberto
        const { data: vendas, error: erroVendas } = await supabase
            .from('pedidos_venda')
            .select('*')
            .eq('cupom_utilizado', cupomInfo.codigo_cupom)
            .neq('status_producao', 'Aguardando Pagamento')
            .order('pago_em', { ascending: false });

        if (erroVendas) throw erroVendas;

        const totalVendasConvertidas = vendas.length;
        const faturamentoGerado = vendas.reduce((total, v) => total + Number(v.valor_total), 0);
        const comissaoAcumulada = faturamentoGerado * Number(cupomInfo.desconto_percentual);

        return res.json({
            sucesso: true,
            cupom: cupomInfo.codigo_cupom,
            comissaoPercentual: cupomInfo.desconto_percentual * 100,
            totalVendas: totalVendasConvertidas,
            faturamentoGerado: faturamentoGerado,
            comissaoReceber: comissaoAcumulada,
            historico: vendas.map(v => ({
                id_pedido: v.id_pedido,
                valor: v.valor_total,
                data: v.pago_em,
                status: v.status_producao
            }))
        });

    } catch (error) {
        console.error("❌ Erro na rota do influenciador por e-mail:", error);
        return res.status(500).json({ sucesso: false, mensagem: "Erro interno no banco de dados." });
    }
}

module.exports = { obterDadosInfluenciador };
