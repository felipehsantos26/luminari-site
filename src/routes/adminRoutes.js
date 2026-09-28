const { supabase } = require('../supabase');

// 🔌 FUNÇÃO: Buscar dados gerais do Admin + Matemática Completa de Afiliados e Prazos
async function obterDadosGerais(req, res) {
    try {
        // 1. Busca todos os pedidos de venda
        const { data: pedidos, error: erroPedidos } = await supabase
            .from('pedidos_venda')
            .select('*')
            .order('pago_em', { ascending: false });

        if (erroPedidos) throw erroPedidos;

        // 2. Busca o controle de estoque do lote
        const { data: estoque, error: erroEstoque } = await supabase
            .from('controle_estoque')
            .select('quantidade_disponivel')
            .eq('id', 1)
            .single();

        if (erroEstoque) throw erroEstoque;

        // 3. Busca a lista completa de afiliados cadastrados no sistema
        const { data: afiliados, error: erroAfiliados } = await supabase
            .from('cupons_afiliados')
            .select('*');

        if (erroAfiliados) throw erroAfiliados;

        // 4. Busca todos os pagamentos (Pix) já realizados na história
        const { data: pagamentos, error: erroPagamentos } = await supabase
            .from('pagamentos_afiliados')
            .select('*');

        if (erroPagamentos) throw erroPagamentos;

        // 📊 Calcular Faturamento Bruto da Fábrica (desconsiderando pendentes)
        const faturamentoBruto = pedidos
            .filter(p => p.status_producao !== 'Aguardando Pagamento')
            .reduce((total, p) => total + Number(p.valor_total), 0);

        // ⏱️ Configura a barreira de tempo dos 15 dias de retenção contra cancelamentos
        const agora = new Date();
        const MILISSEGUNDOS_EM_15_DIAS = 15 * 24 * 60 * 60 * 1000;

        // 🧮 PROCESSAMENTO FINANCEIRO INDIVIDUAL DE CADA AFILIADO
        const resumoAfiliados = afiliados.map(afiliado => {
            const cupom = afiliado.codigo_cupom;
            const email = afiliado.email_influenciador;
            const taxaComissao = Number(afiliado.desconto_percentual);

            // Filtrar apenas as vendas aprovadas deste cupom específico
            const vendasDoCupom = pedidos.filter(p => 
                p.cupom_utilizado === cupom && 
                p.status_producao !== 'Aguardando Pagamento' && 
                p.pago_em
            );

            let comissaoRetida = 0;   // Vendas com menos de 15 dias
            let comissaoLiberada = 0; // Vendas com mais de 15 dias

            vendasDoCupom.forEach(venda => {
                const dataPagamento = new Date(venda.pago_em);
                const valorComissao = Number(venda.valor_total) * taxaComissao;

                // Se o tempo passado desde o pagamento for menor que 15 dias, fica retido
                if (agora - dataPagamento < MILISSEGUNDOS_EM_15_DIAS) {
                    comissaoRetida += valorComissao;
                } else {
                    comissaoLiberada += valorComissao;
                }
            });

            // Somar tudo o que você já pagou de verdade via Pix para este e-mail específico
            const totalJaPago = pagamentos
                .filter(pg => pg.email_influenciador.trim().toLowerCase() === email.trim().toLowerCase())
                .reduce((total, pg) => total + Number(pg.valor_pago), 0);

            // O total já pago abate primeiro o saldo que já estava liberado
            const saldoLiberadoDisponivel = Math.max(0, comissaoLiberada - totalJaPago);

            return {
                nomeParceiro: afiliado.email_influenciador.split('@')[0].toUpperCase(), // Nome aproximado pelo e-mail
                email: email,
                cupom: cupom,
                totalVendas: vendasDoCupom.length,
                comissaoBrutaTotal: comissaoRetida + comissaoLiberada,
                comissaoRetida: comissaoRetida, // ⏳ Guardado na geladeira
                comissaoLiberadaApta: saldoLiberadoDisponivel, // 🔓 Pronto para você pagar via Pix!
                totalPago: totalJaPago
            };
        });

        // Retorna o pacote de dados completo para alimentar o painel do Admin
        return res.json({
            sucesso: true,
            estoqueLote: estoque.quantidade_disponivel,
            faturamentoBruto: faturamentoBruto,
            pedidos: pedidos,
            resumoAfiliados: resumoAfiliados // 👈 Sua nova lista financeira inteligente
        });
    } catch (error) {
        console.error("❌ Erro ao buscar dados do Admin:", error);
        return res.status(500).json({ sucesso: false, mensagem: "Erro ao ler banco de dados." });
    }
}

// 🚚 FUNÇÃO: Atualizar Código de Rastreio (Inalterada)
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

// 💸 FUNÇÃO: Registrar o Pix enviado e dar baixa no saldo (Inalterada)
async function registrarPagamentoAfiliado(req, res) {
    const { emailInfluenciador, valorPago } = req.body;

    if (!emailInfluenciador || !valorPago || Number(valorPago) <= 0) {
        return res.status(400).json({ sucesso: false, mensagem: "Dados de pagamento inválidos ou incompletos." });
    }

    try {
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

module.exports = { obterDadosGerais, atualizarRastreioPedido, registrarPagamentoAfiliado };
