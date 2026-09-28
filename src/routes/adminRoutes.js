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
        return res.json({ sucesso: true, mensagem: "Pedido atualizado com sucesso!" });
    } catch (error) {
        console.error("❌ Erro ao atualizar rastreio:", error);
        return res.status(500).json({ sucesso: false, mensagem: "Erro interno." });
    }
}

// Exporta as funções limpas
module.exports = { obterDadosGerais, atualizarRastreioPedido };
