require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

// 📧 Puxa o serviço de e-mail que criamos na pasta services
const { enviarEmailsComissao } = require('./services/emailService');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// 🔐 BANCO DE DADOS DE CUPONS
const cuponsValidos = { 
    "THAIS10": { desconto: 0.10, iEmail: "felipeh.santos26@gmail.com" }, 
    "FELIPE15": { desconto: 0.15, iEmail: "felipeh.santos26@gmail.com" }
};

const PRECO_ORIGINAL = 1.00; // Mantido em R$ 1,00 para os seus testes

// 📦 CONFIGURAÇÕES FÍSICAS DA CAIXA (MEDIDAS REAIS ATUALIZADAS DO CUBO!)
const DIMENSOES_PRODUTO = {
    peso: 0.35,         // 350 gramas reais
    altura: 15,         // Cubo de 15cm
    largura: 15,        // Cubo de 15cm
    comprimento: 15,    // Cubo de 15cm
    cep_origem: "14810000" // CEP base de Araraquara/SP
};

// 🗄️ BANCO DE DADOS TEMPORÁRIO EM MEMÓRIA (Guarda o endereço até o Pix ser pago)
const pedidosTemporarios = {};

// Rota 1: Validar Cupom
app.post('/api/vendas/validar-cupom', (req, res) => { 
    const { cupom } = req.body; 
    if (cupom && cuponsValidos[cupom]) { 
        const infoCupom = cuponsValidos[cupom]; 
        const novoPreco = PRECO_ORIGINAL * (1 - infoCupom.desconto); 
        return res.json({ valido: true, novoPreco: novoPreco, message: "Cupom applied!" }); 
    } 
    return res.status(400).json({ valido: false, message: "Cupom inválido." });
});
// 🚚 ROTA: Calcular frete dinâmico com link protegido em partes e fallback de segurança
app.post('/api/frete/calcular', async (req, res) => {
    const { cep } = req.body;

    if (!cep || cep.length !== 8) {
        return res.status(400).json({ error: true, mensagem: "CEP inválido fornecido." });
    }

    const opcoesFallback = [
        { id: 1, name: "Correios PAC (Plano B)", price: 18.00, deadline: 5 },
        { id: 2, name: "Correios Sedex (Plano B)", price: 25.00, deadline: 2 }
    ];

    try {
        const tokenMelhorEnvio = process.env.MELHOR_ENVIO_TOKEN ? process.env.MELHOR_ENVIO_TOKEN.trim() : '';

        const corpoCalculo = {
            from: { postal_code: DIMENSOES_PRODUTO.cep_origem },
            to: { postal_code: cep },
            products: [
                {
                    id: "luminaria",
                    width: DIMENSOES_PRODUTO.largura,
                    height: DIMENSOES_PRODUTO.altura,
                    length: DIMENSOES_PRODUTO.comprimento,
                    weight: DIMENSOES_PRODUTO.peso,
                    insurance_value: 100.00,
                    quantity: 1
                }
            ]
        };

        // 🔗 Link em partes para evitar que o meu interpretador mude a URL de destino
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
            console.log("⚠️ API Melhor Envio offline. Usando opções de segurança...");
            return res.json(opcoesFallback);
        }

        const resultadoTransportadoras = await response.json();

        const opcoesValidas = resultadoTransportadoras
            .filter(tp => (tp.id === 1 || tp.id === 2) && !tp.error)
            .map(tp => ({
                id: tp.id,
                name: tp.name,
                price: Number(tp.price),
                deadline: tp.delivery_time
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

// Rota 2: Criar Pagamento vinculando dados na memória do servidor antes do checkout
app.post('/api/vendas/criar-pagamento', async (req, res) => { 
    const { cupom, freteId, fretePreco, clienteInfo } = req.body; 

    // Validação de dados obrigatórios enviados da tela do site
    if (!clienteInfo || !clienteInfo.nome || !clienteInfo.rua || !clienteInfo.numero) {
        return res.status(400).json({ error: true, mensagem_real: "Dados de entrega ausentes ou incompletos." });
    }

    let precoProduto = PRECO_ORIGINAL; 
    if (cupom && cuponsValidos[cupom]) { 
        precoProduto = PRECO_ORIGINAL * (1 - cuponsValidos[cupom].desconto); 
    } 

    let valorFrete = 0.01

    // 🔑 GERA UM CARIMBO ÚNICO PARA O PEDIDO (Chave Única)
    const idPedido = `PEDIDO-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // 🗄️ SALVA OS DADOS DO CLIENTE NA NOSSA MEMÓRIA ASSOCIADOS A ESSA CHAVE ÚNICA
    pedidosTemporarios[idPedido] = {
        nome: clienteInfo.nome,
        telefone: clienteInfo.telefone,
        cep: clienteInfo.cep,
        rua: clienteInfo.rua,
        numero: clienteInfo.numero,
        complemento: clienteInfo.complemento,
        cupom: cupom || "NENHUM"
    };

    try { 
        const dadosPreferencia = { 
            // 🔗 AMARRA O LINK DO CHECKOUT AO NOSSO ID DE MEMÓRIA DO SERVIDOR
            external_reference: idPedido,
            items: [ 
                { 
                    title: "Luminária Inteligente SmartGlucolamp", 
                    quantity: 1, 
                    currency_id: "BRL", 
                    unit_price: Number(precoProduto.toFixed(2)) 
                } 
            ], 
            shipments: {
                mode: "not_specified",
                cost: Number(valorFrete.toFixed(2)) 
            },
            metadata: { 
                cupom_utilizado: cupom || "NENHUM" 
            }, 
            back_urls: { 
                 success: "https://www.instagram.com/felipeh.santos26/",
                failure: "https://www.instagram.com/thais.ki.satux/",
                pending: "https://www.instagram.com/glico.lumi.angel/" 
            }, 
            auto_return: "approved" 
        }; 
        
        const tokenLimpo = process.env.MP_ACCESS_TOKEN ? process.env.MP_ACCESS_TOKEN.trim() : ''; 
        const response = await fetch('https://api.mercadopago.com/checkout/preferences', { 
            method: 'POST', 
            headers: { 
                'Authorization': `Bearer ${tokenLimpo}`, 
                'Content-Type': 'application/json', 
                'User-Agent': 'PlataformaFelipe/1.0' 
            }, 
            body: JSON.stringify(dadosPreferencia) 
        }); 
        
        if (!response.ok) { 
            return res.status(400).json({ error: true, mensagem_real: "Erro na API do Mercado Pago." }); 
        } 
        const preference = await response.json(); 
        if (preference.init_point) { 
            return res.json({ init_point: preference.init_point }); 
        } 
        return res.status(500).json({ error: "Erro desconhecido ao gerar o link." }); 
    } catch (error) { 
        console.error("❌ ERRO GRAVE NO SERVIDOR:", error); 
        return res.status(500).json({ error: true, mensagem_real: error.message }); 
    }
});
// 🚨 ROTA 3: WEBHOOK SUPER BLINDADO INTEGRADO AO BANCO DE MEMÓRIA DE ENTREGA
app.post('/api/vendas/webhook', async (req, res) => { 
    const { data, resource, action } = req.body; 

    let pagamentoId = null; 
    if (data && data.id) { 
        pagamentoId = data.id; 
    } else if (resource) { 
        pagamentoId = resource.split('/').pop(); 
    } 

    if (pagamentoId && (!action || action.includes('payment') || action.includes('order'))) { 
        try { 
            const tokenLimpo = process.env.MP_ACCESS_TOKEN ? process.env.MP_ACCESS_TOKEN.trim() : ''; 
            const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${pagamentoId}`, { 
                headers: { 'Authorization': `Bearer ${tokenLimpo}` } 
            }); 

            if (mpResponse.ok) { 
                const pagamentoInfo = await mpResponse.json(); 

                if (pagamentoInfo.status === 'approved') { 
                    const metadata = pagamentoInfo.metadata || {}; 
                    const cupomUsado = metadata.cupom_utilizado; 
                    const precoPago = pagamentoInfo.transaction_amount; 

                    // 🔗 BUSCA O ID DO PEDIDO ENVIADO NAS PROPRIEDADES DO MERCADO PAGO
                    const idPedidoAmarrado = pagamentoInfo.external_reference;
                    
                    // 🗄️ ABRE A MEMÓRIA DO SERVIDOR E RECUPERA OS DADOS DE ENTREGA REAIS DO COMPRADOR
                    const dadosEntregaCliente = pedidosTemporarios[idPedidoAmarrado] || {
                        nome: "Cliente Direto (Não preencheu formulário)",
                        telefone: "N/A",
                        cep: "N/A",
                        rua: "N/A",
                        numero: "N/A",
                        complemento: "N/A"
                    };

                    console.log(`==================================================`);
                    console.log(`💰 SUCESSO DE VENDA! PAGAMENTO REAL APROVADO`);
                    console.log(`📦 ID DO PAGAMENTO MP: ${pagamentoId}`);
                    console.log(`🔑 ID DO PEDIDO INTERNO: ${idPedidoAmarrado}`);
                    console.log(`👤 COMPRADOR: ${dadosEntregaCliente.nome}`);
                    console.log(`📱 TELEFONE: ${dadosEntregaCliente.telefone}`);
                    console.log(`📍 ENDEREÇO COLETADO ANTES DO PAGAMENTO:`);
                    console.log(`   Rua: ${dadosEntregaCliente.rua}, Nº ${dadosEntregaCliente.numero}`);
                    console.log(`   Bairro/Compl: ${dadosEntregaCliente.complemento}`);
                    console.log(`   CEP: ${dadosEntregaCliente.cep}`);
                    console.log(`💵 VALOR TOTAL CAPTURADO (PRODUTO + FRETE): R$ ${precoPago}`);
                    console.log(`==================================================`);

                    let valorComissao = 0; 
                    let emailInfluenciador = "felipeh.santos26@gmail.com"; 

                    if (cupomUsado && cuponsValidos[cupomUsado]) { 
                        valorComissao = precoPago * 0.15; 
                        emailInfluenciador = cuponsValidos[cupomUsado].iEmail; 
                    } 

                    // Enviamos o pacote completo contendo também os dados de entrega reais do cliente para o emailService
                    await enviarEmailsComissao({ 
                        cupom: !cupomUsado || cupomUsado === "NENHUM" ? "NENHUM (Venda Direta pelo Site)" : cupomUsado, 
                        precoPago: precoPago, 
                        comissao: valorComissao, 
                        emailInfluenciador: emailInfluenciador,
                        // 📬 Passa as informações de postagem para o robô de email injetar na mensagem
                        entrega: dadosEntregaCliente 
                    });

                    // Limpa a memória do servidor para esse pedido específico para economizar espaço
                    delete pedidosTemporarios[idPedidoAmarrado];
                    
                } else { 
                    console.log(`ℹ️ Notificação para o ID ${pagamentoId}, mas o status é '${pagamentoInfo.status}' (Não disparar e-mail).`); 
                } 
            } 
        } catch (error) { 
            console.error("❌ Erro ao ler dados do Webhook:", error); 
        } 
    } 
    return res.status(200).send('OK');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { 
    console.log(`==================================================`); 
    console.log(`🚀 SERVIDOR COM WEBHOOK ATIVO E PRONTO PARA A VERCEL`); 
    console.log(`🌐 Rodando na porta: ${PORT}`); 
    console.log(`==================================================`);
});
