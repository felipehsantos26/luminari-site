const { supabase } = require('../supabase');

// 🔌 FUNÇÃO: Buscar dados exclusivos de um Influenciador/Cupom específico
async function obterDadosInfluenciador(req, res) {
    const { cupom } = req.query; // Pega o cupom vindo da URL (ex: ?cupom=THAIS10)

    if (!cupom) {
        return res.status(400).json({ sucesso: false, mensagem: "Cupom não fornecido." });
    }

    try {
        // 🔍 1. Busca no banco real se esse cupom existe e qual o percentual dele
        const { data: cupomInfo, error: erroCupom } = await supabase
            .from('cupons_afiliados')
            .select('*')
            .eq('codigo_cupom', cupom.toUpperCase().trim())
            .single();

        if (erroCupom || !cupomInfo) {
            return res.status(404).json({ sucesso: false, mensagem: "Cupom/Influenciador não encontrado." });
        }

        // 📊 2. Busca todas as vendas reais aprovadas que usaram ESSE cupom específico
        const { data: vendas, error: erroVendas } = await supabase
            .from('pedidos_venda')
            .select('*')
            .eq('cupom_utilizado', cupom.toUpperCase().trim())
            .neq('status_producao', 'Aguardando Pagamento') // Ignora Pix pendentes
            .order('pago_em', { ascending: false });

        if (erroVendas) throw erroVendas;

        // 🧮 3. Faz os cálculos matemáticos com base nas vendas reais dela
        const totalVendasConvertidas = vendas.length;
        
        const faturamentoGerado = vendas.reduce((total, v) => total + Number(v.valor_total), 0);
        
        // Multiplica o faturamento gerado pela porcentagem de comissão cadastrada no banco
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
        console.error("❌ Erro na rota do influenciador:", error);
        return res.status(500).json({ sucesso: false, mensagem: "Erro interno no banco de dados." });
    }
}

module.exports = { obterDadosInfluenciador };
