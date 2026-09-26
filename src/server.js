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

const PRECO_ORIGINAL = 299.00;

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

// Rota 2: Criar Pagamento (O GATILHO DE E-MAIL FOI REMOVIDO DAQUI!)
app.post('/api/vendas/criar-pagamento', async (req, res) => {
    const { cupom } = req.body;

    let precoFinal = PRECO_ORIGINAL;

    if (cupom && cuponsValidos[cupom]) {
        precoFinal = PRECO_ORIGINAL * (1 - cuponsValidos[cupom].desconto);
    }

    try {
        const dadosPreferencia = {
            items: [
                {
                    title: "Luminária Inteligente SmartGlucolamp",
                    quantity: 1,
                    currency_id: "BRL",
                    unit_price: Number(precoFinal.toFixed(2))
                }
            ],
            metadata: {
                // Passamos o cupom aqui para o Mercado Pago guardar e nos devolver no Webhook depois
                cupom_utilizado: cupom || "NENHUM"
            },
            back_urls: {
                success: "https://mercadopago.com.br",
                failure: "https://mercadopago.com.br",
                pending: "https://mercadopago.com.br"
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
            // Retorna apenas a URL de pagamento. Nenhum e-mail é disparado ainda!
            return res.json({ init_point: preference.init_point });
        }

        return res.status(500).json({ error: "Erro desconhecido ao gerar o link." });

    } catch (error) {
        console.error("❌ ERRO GRAVE NO SERVIDOR:", error);
        return res.status(500).json({ error: true, mensagem_real: error.message });
    }
});

// 🚨 ROTA 3: WEBHOOK SEGURO DO MERCADO PAGO
// O Mercado Pago vai chamar essa rota automaticamente quando o pagamento mudar de status
app.post('/api/vendas/webhook', async (req, res) => {
    const { action, data } = req.body;

    // Só processa se recebermos dados com um ID de pagamento válido
    if (data && data.id) {
        try {
            const tokenLimpo = process.env.MP_ACCESS_TOKEN ? process.env.MP_ACCESS_TOKEN.trim() : '';
            
            // Consultamos a API do Mercado Pago para conferir se o pagamento foi pago mesmo
            const mpResponse = await fetch(`https://mercadopago.com{data.id}`, {
                headers: { 'Authorization': `Bearer ${tokenLimpo}` }
            });

            if (mpResponse.ok) {
                const pagamentoInfo = await mpResponse.json();

                // 🔥 SÓ ENVIA O E-MAIL SE O STATUS FOR "approved" (Dinheiro na conta!)
                if (pagamentoInfo.status === 'approved') {
                    // Resgatamos o cupom que deixamos salvo no metadado lá no passo 2
                    const cupomUsado = pagamentoInfo.metadata.cupom_utilizado;
                    const precoPago = pagamentoInfo.transaction_amount;

                    let valorComissao = 0;
                    let emailInfluenciador = "felipeh.santos26@gmail.com";

                    if (cupomUsado && cuponsValidos[cupomUsado]) {
                        valorComissao = precoPago * 0.15;
                        emailInfluenciador = cuponsValidos[cupomUsado].iEmail;
                    }

                    console.log(`💰 Sucesso! Pagamento aprovado. ID: ${data.id}. Disparando e-mails legítimos...`);
                    
                    // O e-mail agora é disparado com segurança máxima pós-venda
                    await enviarEmailsComissao({
                        cupom: cupomUsado === "NENHUM" ? "NENHUM (Venda Direta pelo Site)" : cupomUsado,
                        precoPago: precoPago,
                        comissao: valorComissao,
                        emailInfluenciador: emailInfluenciador
                    });
                }
            }
        } catch (error) {
            console.error("❌ Erro ao ler dados do Webhook:", error);
        }
    }

    // O Mercado Pago exige que o servidor retorne um status 200 rápido para confirmar o aviso
    return res.status(200).send('OK');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(`🚀 SERVIDOR COM WEBHOOK ATIVO E PRONTO PARA A VERCEL`);
    console.log(`🌐 Rodando na porta: ${PORT}`);
    console.log(`==================================================`);
});
