const express = require('express');
const router = express.Router();
const { supabase } = require('../supabase');

// 🔌 ROTA: Buscar dados gerais do Admin (Faturamento, Estoque e Pedidos)
router.get('/dados-gerais', async (req, res) => {
    try {
        // 📊 1. Busca todas as vendas aprovadas do banco real
        const { data: pedidos, error: erroPedidos } = await supabase
            .from('pedidos_venda')
            .select('*')
            .order('pago_em', { ascending: false });

        if (erroPedidos) throw erroPedidos;

        // 🚨 2. Busca o status atual do estoque do lote
        const { data: estoque, error: erroEstoque } = await supabase
            .from('controle_estoque')
            .select('quantidade_disponivel')
            .eq('id', 1)
            .single();

        if (erroEstoque) throw erroEstoque;

        // 🧮 Calcula o faturamento bruto somando as vendas aprovadas
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
        console.error("❌ Erro na rota admin /dados-gerais:", error);
        return res.status(500).json({ sucesso: false, mensagem: "Erro ao ler banco de dados." });
    }
});

// 🚚 ROTA: Atualizar Código de Rastreio e mudar status para 'Despachado'
router.post('/atualizar-rastreio', async (req, res) => {
    const { idPedido, codigoRastreio } = req.body;

    if (!idPedido || !codigoRastreio) {
        return res.status(400).json({ sucesso: false, mensagem: "Dados incompletos." });
    }

    try {
        // 💾 Atualiza a linha do pedido no Supabase para 'Despachado' com o código do frete
        const { error } = await supabase
            .from('pedidos_venda')
            .update({ 
                status_producao: 'Despachado',
                codigo_rastreio: codigoRastreio.toUpperCase().trim()
            })
            .eq('id_pedido', idPedido);

        if (error) throw error;

        console.log(`📦 PEDIDO ATUALIZADO: ${idPedido} marcado como Despachado com rastreio ${codigoRastreio}`);
        
        // 📧 REQUISITO FUTURO: Aqui vai entrar o gatilho para o Resend mandar o e-mail de rastreio pro cliente!
        
        return res.json({ sucesso: true, mensagem: "Pedido atualizado com sucesso!" });

    } catch (error) {
        console.error("❌ Erro ao atualizar rastreio no Supabase:", error);
        return res.status(500).json({ sucesso: false, mensagem: "Erro interno ao atualizar." });
    }
});

module.exports = router;
