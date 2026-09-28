const { supabase } = require('../supabase');

// 🔌 FUNÇÃO: Buscar dados gerais do Admin
async function obterDadosGerais(req, res) {
    try {
        const { data: pedidos, error: erroPedidos } = await supabase
            .from('pedidos_venda')
            .select('*')
            .order('pago_em', { ascending: false });

        if (erroPedidos) throw erroPedidos;

        const { data: estoque, error: erroEstoque } = await supabase
            .from('controle_estoque')
            .select('quantidade_disponivel')
            .eq('id', 1)
            .single();

        if (erroEstoque) throw erroEstoque;

        const faturamentoBruto = pedidos
            .filter(p => p.status_producao !== 'Aguardando Pagamento')
            .reduce((total, p) => total + Number(p.valor_total), 0);

        return res.json({
            sucesso: true,
            estoqueLote: estoque.quantidade_disponivel,
            faturamentoBruto: faturamentoBruto,
            pedidos: pedidos
        });
    } catch (error) {
        console.error("❌ Erro ao buscar dados do Admin:", error);
        return res.status(500).json({ sucesso: false, mensagem: "Erro ao ler banco de dados." });
    }
}

// 🚚 FUNÇÃO: Atualizar Código de Rastreio
async function atualizarRastreioPedido(req, res) {
    const { idPedido, codigoRastreio } = req.body;

    if (!idPedido || !codigoRastreio) {
        return res.status(400).json({ sucesso: false, message: "Dados incompletos." });
    }

    try {
        const { error } = await supabase
            .from('pedidos_venda')
            .update({ 
                status_producao: 'Despachado',
                codigo_rastreio: codigoRastreio.toUpperCase().trim()
            })
            .eq('id_pedido', idPedido);

        if (error) throw error;
        return res.json({ sucesso: true, mensagem: "Pedido updated com sucesso!" });
    } catch (error) {
        console.error("❌ Erro ao atualizar rastreio:", error);
        return res.status(500).json({ sucesso: false, mensagem: "Erro interno." });
    }
}

// 💸 FUNÇÃO NOVA: Registrar o Pix enviado e dar baixa no saldo do Afiliado
async function registrarPagamentoAfiliado(req, res) {
    const { emailInfluenciador, valorPago } = req.body;

    if (!emailInfluenciador || !valorPago || Number(valorPago) <= 0) {
        return res.status(400).json({ sucesso: false, mensagem: "Dados de pagamento inválidos ou incompletos." });
    }

    try {
        // Insere o registro de pagamento de forma permanente na nova tabela do Supabase
        const { error } = await supabase
            .from('pagamentos_afiliados')
            .insert([
                {
                    email_influenciador: emailInfluenciador.trim(),
                    valor_pago: Number(valorPago)
                }
            ]);

        if (error) throw error;

        return res.json({ sucesso: true, mensagem: "🎉 Baixa realizada! Pix registrado com sucesso no Supabase." });
    } catch (error) {
        console.error("❌ Erro ao registrar pagamento do afiliado:", error);
        return res.status(500).json({ sucesso: false, mensagem: "Erro interno ao salvar pagamento." });
    }
}

// Exporta as funções originais + a função nova de baixa financeira
module.exports = { obterDadosGerais, atualizarRastreioPedido, registrarPagamentoAfiliado };
