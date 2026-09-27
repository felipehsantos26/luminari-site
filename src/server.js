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

const PRECO_ORIGINAL = 1.00;

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
            // Retorna apenas a URL de pagamento. Nenhum e-mail é disparado ainda!
            return res.json({ init_point: preference.init_point });
        }

        return res.status(500).json({ error: "Erro desconhecido ao gerar o link." });

    } catch (error) {
        console.error("❌ ERRO GRAVE NO SERVIDOR:", error);
        return res.status(500).json({ error: true, mensagem_real: error.message });
    }
});

// 🚨 ROTA 3: WEBHOOK SUPER BLINDADO DO MERCADO PAGO
app.post('/api/vendas/webhook', async (req, res) => {
    // O Mercado Pago pode mandar o ID direto em data.id ou dentro de resource para orders
    const { data, resource, action } = req.body;

    // Descobre o ID do pagamento de forma inteligente, não importa o formato do evento
    let pagamentoId = null;
    if (data && data.id) {
        pagamentoId = data.id;
    } else if (resource) {
        // Se vier como URL (ex: https://mercadopago.com), pega só o número do final
        pagamentoId = resource.split('/').pop();
    }

    // Se encontramos um ID e a ação tem a ver com pagamento ou pedido
    if (pagamentoId && (!action || action.includes('payment') || action.includes('order'))) {
        try {
            const tokenLimpo = process.env.MP_ACCESS_TOKEN ? process.env.MP_ACCESS_TOKEN.trim() : '';
            
            // Consulta oficial na API do Mercado Pago para checar o status real
            const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${pagamentoId}`, {
                headers: { 'Authorization': `Bearer ${tokenLimpo}` }
            });

            if (mpResponse.ok) {
                const pagamentoInfo = await mpResponse.json();

                // 🔥 SÓ ENVIA O E-MAIL SE O STATUS FOR "approved"
                if (pagamentoInfo.status === 'approved') {
                    // Busca os metadados com segurança contra valores nulos
                    const metadata = pagamentoInfo.metadata || {};
                    const cupomUsado = metadata.cupom_utilizado;
                    const precoPago = pagamentoInfo.transaction_amount;

                    let valorComissao = 0;
                    let emailInfluenciador = "felipeh.santos26@gmail.com";

                    if (cupomUsado && cuponsValidos[cupomUsado]) {
                        valorComissao = precoPago * 0.15;
                        emailInfluenciador = cuponsValidos[cupomUsado].iEmail;
                    }

                    console.log(`💰 Sucesso real! Pagamento aprovado. ID: ${pagamentoId}. Disparando e-mails legítimos...`);
                    
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

    // Sempre responde 200 rápido para o Mercado Pago não ficar reenviando o mesmo aviso
    return res.status(200).send('OK');
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(`🚀 SERVIDOR COM WEBHOOK ATIVO E PRONTO PARA A VERCEL`);
    console.log(`🌐 Rodando na porta: ${PORT}`);
    console.log(`==================================================`);
});
