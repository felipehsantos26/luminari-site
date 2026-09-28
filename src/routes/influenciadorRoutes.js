const { supabase } = require('../supabase');

// 🔌 FUNÇÃO: Buscar dados do influenciador cruzando o E-MAIL logado com o cupom e descontando pagamentos
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

        // 💸 3. Busca todo o histórico de pagamentos (Pix) que o administrador já enviou para este afiliado
        const { data: pagamentosFeitos, error: erroPagamentos } = await supabase
            .from('pagamentos_afiliados')
            .select('*')
            .eq('email_influenciador', email.trim())
            .order('pago_em', { ascending: false });

        if (erroPagamentos) throw erroPagamentos;

        // 🧮 4. MATEMÁTICA FINANCEIRA REAL
        const totalVendasConvertidas = vendas.length;
        const faturamentoGerado = vendas.reduce((total, v) => total + Number(v.valor_total), 0);
        
        // Comissão bruta total acumulada na vida do cupom
        const comissaoBrutaTotal = faturamentoGerado * Number(cupomInfo.desconto_percentual);
        
        // Total que você já pagou de verdade via Pix para ele
        const totalJaPagoAoInfluenciador = pagamentosFeitos.reduce((total, p) => total + Number(p.valor_pago), 0);
        
        // Saldo líquido atualizado na tela (Bruto menos o que já recebeu)
        const comissaoReceberLiquida = comissaoBrutaTotal - totalJaPagoAoInfluenciador;

        return res.json({
            sucesso: true,
            cupom: cupomInfo.codigo_cupom,
            comissaoPercentual: cupomInfo.desconto_percentual * 100,
            totalVendas: totalVendasConvertidas,
            faturamentoGerado: faturamentoGerado,
            comissaoReceber: comissaoReceberLiquida, // 👈 Agora exibe o saldo real com a baixa!
            totalPago: totalJaPagoAoInfluenciador,
            historico: vendas.map(v => ({
                id_pedido: v.id_pedido,
                valor: v.valor_total,
                data: v.pago_em,
                status: v.status_producao
            })),
            // 📋 Envia a lista de Pix recebidos para desenhar o histórico no painel do parceiro
            historicoPagamentos: pagamentosFeitos.map(p => ({
                id_pagamento: p.id,
                valor_pago: p.valor_pago,
                data: p.pago_em
            }))
        });

    } catch (error) {
        console.error("❌ Erro na rota do influenciador por e-mail:", error);
        return res.status(500).json({ sucesso: false, mensagem: "Erro interno no banco de dados." });
    }
}

module.exports = { obterDadosInfluenciador };
