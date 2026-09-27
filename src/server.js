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

// 📦 CONFIGURAÇÕES FÍSICAS DA CAIXA DA LUMINÁRIA (Para o cálculo real de frete)
const DIMENSOES_PRODUTO = {
    peso: 0.35,         // 350 gramas reais
    altura: 15,         // Cubo de 15cm
    largura: 15,        // Cubo de 15cm
    comprimento: 15,    // Cubo de 15cm
    cep_origem: "14810346" // CEP base de Araraquara/SP (onde a luminária é postada)
};

// Rota 1: Validar Cupom
app.post('/api/vendas/validar-cupom', (req, res) => { 
    const { cupom } = req.body; 
    if (cupom && cuponsValidos[cupom]) { 
        const infoCupom = cuponsValidos[cupom]; 
        const novoPreco = PRECO_ORIGINAL * (1 - infoCupom.desconto); 
        return res.json({ valido: true, novoPreco: novoPreco, message: "Cupom aplicado!" }); 
    } 
    return res.status(400).json({ valido: false, message: "Cupom inválido." });
});
// 🚚 ROTA NOVA: Calcular frete dinâmico na API do Melhor Envio
app.post('/api/frete/calcular', async (req, res) => {
    const { cep } = req.body;

    if (!cep || cep.length !== 8) {
        return res.status(400).json({ error: true, mensagem: "CEP inválido fornecido." });
    }

    try {
        const tokenMelhorEnvio = process.env.MELHOR_ENVIO_TOKEN ? process.env.MELHOR_ENVIO_TOKEN.trim() : '';

        // Corpo da requisição com o formato de dados que o Melhor Envio exige
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

        const response = await fetch('https://melhorenvio.com.br/api/v2/me/shipment/calculate', {
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
            return res.status(400).json({ error: true, mensagem: "Erro ao calcular frete no Melhor Envio." });
        }

        const resultadoTransportadoras = await response.json();

        // Filtra para mandar para a tela do cliente apenas as opções válidas dos Correios que não tenham erros
        const opcoesValidas = resultadoTransportadoras
            .filter(tp => (tp.id === 1 || tp.id === 2) && !tp.error)
            .map(tp => ({
                id: tp.id, // 1 = PAC, 2 = Sedex
                name: tp.name,
                price: Number(tp.price),
                deadline: tp.delivery_time
            }));

        return res.json(opcoesValidas);

    } catch (error) {
        console.error("❌ Erro no cálculo de frete:", error);
        return res.status(500).json({ error: true, mensagem: error.message });
    }
});

// Rota 2: Criar Pagamento com Coleta de Dados e Frete Real Embutido
// Rota 2: Criar Pagamento com Coleta de Dados e Frete Real Embutido (SOMA CORRIGIDA!)
// Rota 2: Criar Pagamento com Frete Dinâmico Real
app.post('/api/vendas/criar-pagamento', async (req, res) => { 
    const { cupom, freteId, fretePreco } = req.body; // 📥 Captura o preço real vindo do site

    let precoProduto = PRECO_ORIGINAL; 
    if (cupom && cuponsValidos[cupom]) { 
        precoProduto = PRECO_ORIGINAL * (1 - cuponsValidos[cupom].desconto); 
    } 

    // Se o cliente mandou o preço real da tela, usa ele! Caso contrário, usa zero.
    let valorFrete = fretePreco ? Number(fretePreco) : 0.00;

    let nomeFrete = "Entrega Padrão";

    // Se o cliente escolheu um frete real, o servidor valida o preço por segurança
    //if (freteId) {
       // try {
            // Em produção completa com a API do Melhor Envio ativa, o freteId 1 (PAC) e 2 (Sedex) 
            // recalcula o valor exato. Mantemos os fallbacks corretos para o seu teste de 1 real.
            //valorFrete = freteId == 2 ? 25.00 : 18.00; 
           // nomeFrete = freteId == 2 ? "Correios Sedex" : "Correios PAC";
        //} catch (e) {
       //     console.error("Erro ao validar valor do frete, usando fallback.");
     //   }
   //}

    try { 
        const dadosPreferencia = { 
            items: [ 
                { 
                    title: "Luminária Inteligente SmartGlucolamp", 
                    quantity: 1, 
                    currency_id: "BRL", 
                    // 🧮 SOMA REAL: O item cobra apenas o valor do produto com desconto
                    unit_price: Number(precoProduto.toFixed(2)) 
                } 
            ], 
            payer: {
                phone: {},
                identification: {},
                address: {}
            },
            shipments: {
                mode: "not_specified",
                // 🚚 SOMA REAL: O Mercado Pago adiciona o valor do frete e faz a soma matemática perfeita no total!
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

// 🚨 ROTA 3: WEBHOOK SUPER BLINDADO COM CAPTURA DE ENDEREÇO DE ENTREGA
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

                    // 📝 CAPTURA OS DADOS DE ENTREGA COLETADOS PELO CHECKOUT DO MERCADO PAGO
                    const infoComprador = pagamentoInfo.additional_info?.payer || {};
                    const enderecoEntrega = infoComprador.address || {};
                    
                    console.log(`==================================================`);
                    console.log(`💰 SUCESSO REAL! PAGAMENTO APROVADO EM PRODUÇÃO`);
                    console.log(`📦 ID DO PAGAMENTO: ${pagamentoId}`);
                    console.log(`👤 CLIENTE: ${infoComprador.first_name || ''} ${infoComprador.last_name || ''}`);
                    console.log(`📱 TELEFONE: (${infoComprador.phone?.area_code || ''}) ${infoComprador.phone?.number || ''}`);
                    console.log(`📍 ENDEREÇO DE ENTREGA:`);
                    console.log(`   Rua: ${enderecoEntrega.street_name || 'Não preenchido'}, Nº ${enderecoEntrega.street_number || ''}`);
                    console.log(`   CEP: ${enderecoEntrega.zip_code || ''}`);
                    console.log(`   Valor Total Pago (Produto + Frete): R$ ${precoPago}`);
                    console.log(`==================================================`);

                    let valorComissao = 0; 
                    let emailInfluenciador = "felipeh.santos26@gmail.com"; 

                    if (cupomUsado && cuponsValidos[cupomUsado]) { 
                        // Calcula a comissão com base no valor que foi pago
                        valorComissao = precoPago * 0.15; 
                        emailInfluenciador = cuponsValidos[cupomUsado].iEmail; 
                    } 

                    await enviarEmailsComissao({ 
                        cupom: !cupomUsado || cupomUsado === "NENHUM" ? "NENHUM (Venda Direta pelo Site)" : cupomUsado, 
                        precoPago: precoPago, 
                        comissao: valorComissao, 
                        emailInfluenciador: emailInfluenciador 
                    }); 
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
