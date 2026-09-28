require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { obterDadosGerais, atualizarRastreioPedido } = require('./routes/adminRoutes');
const { obterDadosInfluenciador } = require('./routes/influenciadorRoutes');



// 📧 Puxa o serviço de e-mail transacional
const { enviarEmailsComissao } = require('./services/emailService');

// 🔌 CONEXÃO DO SUPABASE: Importa o motor do banco de dados que criamos juntos!
const { supabase } = require('./supabase');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));
// 🌐 Rotas do Painel Administrativo explicitadas para a Vercel
app.get('/api/admin/dados-generais', obterDadosGerais);
app.post('/api/admin/atualizar-rastreio', atualizarRastreioPedido);
// 🌐 Rota do Painel do Influenciador explicada para a Vercel
app.get('/api/influenciador/dados', obterDadosInfluenciador);


// 💰 PREÇO DE TESTE MANTIDO EM R\$ 1,00 PARA A SUA VALIDAÇÃO RÁPIDA DE CUSTO ZERO
const PRECO_ORIGINAL = 1.00; 

// 📦 CONFIGURAÇÕES FÍSICAS DA CAIXA DA LUMINÁRIA (MEDIDAS REAIS DO CUBO!)
const DIMENSOES_PRODUTO = {
    peso: 0.35,         // 350 gramas reais
    altura: 15,         // Cubo de 15cm
    largura: 15,        // Cubo de 15cm
    comprimento: 15,    // Cubo de 15cm
    cep_origem: 14810000 // CEP base de Araraquara/SP
};

// 🗄️ BANCO DE DADOS TEMPORÁRIO EM MEMÓRIA (Mantido apenas para segurar o endereço até o Pix aprovar)
const pedidosTemporarios = {};

// 🏷️ ROTA 1 REFORMULADA: Validar Cupom lendo direto do Banco de Dados Real!
app.post('/api/vendas/validar-cupom', async (req, res) => { 
    const { cupom } = req.body; 

    if (!cupom) {
        return res.status(400).json({ valido: false, message: "Por favor, digite um cupom." });
    }

    try {
        // 🔍 Consulta a tabela 'cupons_afiliados' procurando o código digitado
        const { data: cupomEncontrado, error } = await supabase
            .from('cupons_afiliados')
            .select('*')
            .eq('codigo_cupom', cupom.toUpperCase())
            .single(); // Traz apenas 1 resultado exato

        // Se der erro ou não encontrar nada, o cupom é inválido
        if (error || !cupomEncontrado) {
            return res.status(400).json({ valido: false, message: "Cupom inválido ou expirado." });
        }

        // Se achar, calcula o desconto dinamicamente usando a porcentagem do banco!
        const desconto = Number(cupomEncontrado.desconto_percentual);
        const novoPreco = PRECO_ORIGINAL * (1 - desconto); 

        return res.json({ 
            valido: true, 
            novoPreco: novoPreco, 
            message: `Cupom ${cupom.toUpperCase()} aplicado com sucesso!` 
        }); 

    } catch (err) {
        console.error("❌ Erro ao validar cupom no Supabase:", err);
        return res.status(500).json({ valido: false, message: "Erro interno no banco de dados." });
    }
});
// 🚚 ROTA: Calcular frete dinâmico SOMANDO AUTOMATICAMENTE OS 7 DIAS DE FABRICAÇÃO
app.post('/api/frete/calcular', async (req, res) => {
    const { cep } = req.body;

    if (!cep || cep.length !== 8) {
        return res.status(400).json({ error: true, mensagem: "CEP inválido fornecido." });
    }

    // 🛡️ OPÇÕES PADRÃO COM OS 7 DIAS ÚTEIS JÁ EMBUTIDOS (Fallback de segurança)
    const opcoesFallback = [
        { id: 1, name: "Correios PAC (Fabricação + Envio)", price: 18.00, deadline: 12 },
        { id: 2, name: "Correios Sedex (Fabricação + Envio)", price: 25.00, deadline: 9 }
    ];

    try {
        const tokenMelhorEnvio = process.env.MELHOR_ENVIO_TOKEN ? process.env.MELHOR_ENVIO_TOKEN.trim() : '';

        const corpoCalculo = {
            // 🛡️ Garante que ambos os CEPs sejam enviados como números puros para a API
            from: { postal_code: Number(DIMENSOES_PRODUTO.cep_origem) },
            to: { postal_code: Number(cep) },
            products: [
                {
                    id: "luminaria",
                    width: Number(DIMENSOES_PRODUTO.largura),
                    height: Number(DIMENSOES_PRODUTO.altura),
                    length: Number(DIMENSOES_PRODUTO.comprimento),
                    weight: Number(DIMENSOES_PRODUTO.peso),
                    insurance_value: 100.00,
                    quantity: 1
                }
            ]
        };

        const urlCalculo = `https://melhorenvio.com.br/api/v2/me/shipment/calculate`;

        const response = await fetch(urlCalculo, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${tokenMelhorEnvio}`,
                'Content-Type': 'application/json',
                'User-Agent': 'PlataformaFelipe/1.0',
                'Accept': 'application/json'
            },
            body: JSON.stringify(corpoCalculo)
        });

        if (!response.ok) {
            console.log("⚠️ API Melhor Envio offline. Usando prazos com dias de fabricação embutidos...");
            return res.json(opcoesFallback);
        }

        const resultadoTransportadoras = await response.json();

        const opcoesValidas = resultadoTransportadoras
            .filter(tp => (tp.id === 1 || tp.id === 2) && !tp.error)
            .map(tp => ({
                id: tp.id,
                name: tp.id === 2 ? "Correios Sedex (Fabricação + Envio)" : "Correios PAC (Fabricação + Envio)",
                price: Number(tp.price),
                // ➕ Soma os 7 dias úteis de produção direto no prazo final!
                deadline: Number(tp.delivery_time) + 7
            }));

        if (opcoesValidas.length === 0) {
            return res.json(opcoesFallback);
        }

        return res.json(opcoesValidas);

    } catch (error) {
        console.error("❌ Erro ao cotar frete, usando fallback:", error);
        return res.json(opcoesFallback);
    }
});

// Rota 2: Criar Pagamento com TRAVA DE ESTOQUE DINÂMICA DIRETO NO BANCO REAL (SUPABASE)
// Rota 2: Criar Pagamento salvando os dados IMEDIATAMENTE no banco real (Supabase)
app.post('/api/vendas/criar-pagamento', async (req, res) => { 
    const { cupom, freteId, fretePreco, clienteInfo } = req.body; 

    if (!clienteInfo || !clienteInfo.nome || !clienteInfo.email || !clienteInfo.rua || !clienteInfo.numero) {
        return res.status(400).json({ error: true, message: "Dados de entrega ausentes ou incompletos." });
    }

    try {
        // 🚨 1. LEITURA DE ESTOQUE NO BANCO REAL
        const { data: estoqueAtual, error: erroEstoque } = await supabase
            .from('controle_estoque')
            .select('quantidade_disponivel')
            .eq('id', 1)
            .single();

        if (erroEstoque || !estoqueAtual || estoqueAtual.quantidade_disponivel <= 0) {
            return res.status(400).json({ error: true, mensagem_real: "🚨 LOTE ESGOTADO! Infelizmente todas as vagas já foram preenchidas." });
        }

        // 🚨 2. SUBTRAI O ESTOQUE NA NUVEM
        const novoEstoque = estoqueAtual.quantidade_disponivel - 1;
        await supabase.from('controle_estoque').update({ quantidade_disponivel: novoEstoque }).eq('id', 1);

        console.log(`📉 Vaga reservada no Banco Real! Estoque na nuvem: ${novoEstoque} unidades.`);

        // Calcular Preço com Cupom
        let precoProduto = PRECO_ORIGINAL; 
        if (cupom) {
            const { data: cInfo } = await supabase.from('cupons_afiliados').select('desconto_percentual').eq('codigo_cupom', cupom.toUpperCase()).single();
            if (cInfo) precoProduto = PRECO_ORIGINAL * (1 - Number(cInfo.desconto_percentual));
        }

        let valorFrete = 0.01; // Frete fixo de teste mantido para economizar seu bolso
        const idPedido = `PEDIDO-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        // 💾 3. GRAVAÇÃO IMEDIATA NO SUPABASE (Blindagem contra reinicialização de memória!)
        const { error: erroGravarPedido } = await supabase
            .from('pedidos_venda')
            .insert([
                {
                    id_pedido: idPedido,
                    comprador_nome: clienteInfo.nome,
                    comprador_telefone: clienteInfo.telefone,
                    comprador_email: clienteInfo.email, // Salva o e-mail digitado no site!
                    cep: clienteInfo.cep,
                    rua: clienteInfo.rua,
                    numero: clienteInfo.numero,
                    complemento: clienteInfo.complemento,
                    cupom_utilizado: cupom || "NENHUM",
                    valor_total: Number((precoProduto + valorFrete).toFixed(2)),
                    status_producao: 'Aguardando Pagamento' // Fica aguardando o Pix ser pago!
                }
            ]);

        if (erroGravarPedido) {
            console.error("❌ Erro ao pré-registrar pedido no Supabase:", erroGravarPedido);
            // Devolve o estoque caso dê erro de banco
            await supabase.from('controle_estoque').update({ quantidade_disponivel: estoqueAtual.quantidade_disponivel }).eq('id', 1);
            return res.status(500).json({ error: true, mensagem_real: "Erro ao registrar intenção de compra no banco." });
        }

        // 💳 4. GERAÇÃO DA PREFERÊNCIA DO MERCADO PAGO
        const dadosPreferencia = { 
            external_reference: idPedido,
            items: [ { title: "Luminária Inteligente SmartGlucolamp", quantity: 1, currency_id: "BRL", unit_price: Number(precoProduto.toFixed(2)) } ], 
            shipments: { mode: "not_specified", cost: Number(valorFrete.toFixed(2)) },
            metadata: { cupom_utilizado: cupom || "NENHUM" }, 
            back_urls: { success: "https://www.instagram.com/felipeh.santos26/",
                failure: "https://www.instagram.com/thais.ki.satux/",
                pending: "https://www.instagram.com/glico.lumi.angel/"}, 
            auto_return: "approved" 
        }; 
        
        const tokenLimpo = process.env.MP_ACCESS_TOKEN ? process.env.MP_ACCESS_TOKEN.trim() : ''; 
        const response = await fetch('https://api.mercadopago.com/checkout/preferences', { 
            method: 'POST', 
            headers: { 'Authorization': `Bearer ${tokenLimpo}`, 'Content-Type': 'application/json', 'User-Agent': 'PlataformaFelipe/1.0' }, 
            body: JSON.stringify(dadosPreferencia) 
        }); 
        
        const preference = await response.json(); 
        if (preference.init_point) {
            return res.json({ init_point: preference.init_point }); 
        } 
        
        return res.status(500).json({ error: "Erro ao gerar link de checkout." }); 
    } catch (error) { 
        console.error("❌ ERRO GRAVE ROTA 2:", error); 
        return res.status(500).json({ error: true, mensagem_real: error.message }); 
    }
});

// 🚨 ROTA 3: WEBHOOK BLINDADO COM PERSISTÊNCIA DE PEDIDOS NO BANCO REAL (SUPABASE)
// 🚨 ROTA 3: WEBHOOK TOTALMENTE INDEPENDENTE DE MEMÓRIA (CONSULTA DIRETO NO BANCO REAL)
app.post('/api/vendas/webhook', async (req, res) => { 
    const { data, resource, action } = req.body; 

    let pagamentoId = data?.id || resource?.split('/').pop(); 

    if (pagamentoId && (!action || action.includes('payment') || action.includes('order'))) { 
        try { 
            const tokenLimpo = process.env.MP_ACCESS_TOKEN ? process.env.MP_ACCESS_TOKEN.trim() : ''; 
            const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${pagamentoId}`, { 
                headers: { 'Authorization': `Bearer ${tokenLimpo}` } 
            }); 

            if (mpResponse.ok) { 
                const pagamentoInfo = await mpResponse.json(); 

                if (pagamentoInfo.status === 'approved') { 
                    const idPedidoAmarrado = pagamentoInfo.external_reference;

                    console.log(`==================================================`);
                    console.log(`🔗 WEBHOOK SINALIZADO COM PIX APROVADO: ${idPedidoAmarrado}`);
                    console.log(`==================================================`);

                    // 🔍 1. ABRE O SUPABASE E BUSCA O PEDIDO QUE JÁ ESTAVA GRAVADO LÁ DESDE O CLIQUE DO BOTÃO!
                    const { data: pedidoGravado, error: erroBuscarPedido } = await supabase
                        .from('pedidos_venda')
                        .select('*')
                        .eq('id_pedido', idPedidoAmarrado)
                        .single();

                    // Se achar o pedido e ele ainda estiver pendente, roda a confirmação!
                    if (pedidoGravado && pedidoGravado.status_producao === 'Aguardando Pagamento') {
                        
                        // 💾 2. ATUALIZA O STATUS DO PEDIDO PARA "Em Preparo" NO BANCO REAL!
                        await supabase
                            .from('pedidos_venda')
                            .update({ status_producao: 'Em Preparo' })
                            .eq('id_pedido', idPedidoAmarrado);

                        console.log("💾 STATUS ATUALIZADO: Pedido alterado para 'Em Preparo' na sua planilha online!");

                        // 📈 3. CALCULA A COMISSÃO BUSCANDO O PERCENTUAL DO INFLUENCIADOR DO BANCO REAL
                        let valorComissao = 0;
                        let emailInfluenciador = "felipeh.santos26@gmail.com";
                        const cupomUsado = pedidoGravado.cupom_utilizado;

                        if (cupomUsado && cupomUsado !== "NENHUM") {
                            const { data: cupomInfo } = await supabase
                                .from('cupons_afiliados')
                                .select('*')
                                .eq('codigo_cupom', cupomUsado.toUpperCase())
                                .single();

                            if (cupomInfo) {
                                valorComissao = pagamentoInfo.transaction_amount * Number(cupomInfo.desconto_percentual);
                                emailInfluenciador = cupomInfo.email_influenciador;
                            }
                        }

                        // Reestrutura o objeto de entrega para enviar idêntico ao template de e-mail antigo
                        const dadosEntregaFormatoEmail = {
                            nome: pedidoGravado.comprador_nome,
                            telefone: pedidoGravado.comprador_telefone,
                            cep: pedidoGravado.cep,
                            rua: pedidoGravado.rua,
                            numero: pedidoGravado.numero,
                            complemento: pedidoGravado.complemento
                        };

                        // 📧 4. DISPARA AS TRÊS NOTIFICAÇÕES (Lê o e-mail do site salvo de forma ultra estável!)
                        await enviarEmailsComissao({ 
                            cupom: !cupomUsado || cupomUsado === "NENHUM" ? "NENHUM (Venda Direta pelo Site)" : cupomUsado, 
                            precoPago: pagamentoInfo.transaction_amount, 
                            comissao: valorComissao, 
                            emailInfluenciador: emailInfluenciador,
                            entrega: dadosEntregaFormatoEmail,
                            emailComprador: pedidoGravado.comprador_email // Pegando o e-mail direto do site sem riscos!
                        });

                    } else {
                        console.log(`⚠️ Pedido ${idPedidoAmarrado} já foi processado anteriormente ou não existe.`);
                    }
                } 
            } 
        } catch (error) { 
            console.error("❌ Erro grave no processamento do Webhook:", error); 
        } 
    } 
    return res.status(200).send('OK');
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { 
    console.log(`==================================================`); 
    console.log(`🚀 SERVIDOR COM BANCO DE DADOS REAL E PRONTO PARA A VERCEL`); 
    console.log(`🌐 Rodando na porta: ${PORT}`); 
    console.log(`==================================================`);
});
