require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const { enviarEmailsComissao } = require('./services/emailService');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// 🔐 BANCO DE DADOS DE CUPONS (Simulando e-mails reais dos parceiros para o futuro)
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

// Rota 2: Criar Pagamento
app.post('/api/vendas/criar-pagamento', async (req, res) => {
    const { cupom } = req.body;

    let precoFinal = PRECO_ORIGINAL;
    let emailDoInfluenciador = "";

    if (cupom && cuponsValidos[cupom]) {
        precoFinal = PRECO_ORIGINAL * (1 - cuponsValidos[cupom].desconto);
        emailDoInfluenciador = cuponsValidos[cupom].iEmail;
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
            console.log(`\n❌ O MERCADO PAGO RECUSOU A REQUISIÇÃO (Status: ${response.status})`);
            return res.status(400).json({ error: true, mensagem_real: "Erro na API do Mercado Pago." });
        }

        const preference = await response.json();

        if (preference.init_point) {
            const valorComissao = cupom && cuponsValidos[cupom] ? (precoFinal * 0.15) : 0;
            
            // Dispara os e-mails
            enviarEmailsComissao({
                cupom: cupom || "NENHUM (Venda Direta pelo Site)",
                precoPago: precoFinal,
                comissao: valorComissao,
                emailInfluenciador: emailDoInfluenciador // Passa o e-mail do banco, mas o service cuida do redirecionamento de teste
            });

            return res.json({ init_point: preference.init_point });
        }

        return res.status(500).json({ error: "Erro desconhecido ao gerar o link." });

    } catch (error) {
        console.error("❌ ERRO GRAVE NO SERVIDOR:", error);
        return res.status(500).json({ error: true, mensagem_real: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(`🚀 SERVIDOR INTEGRADO COM MERCADO PAGO & RESEND`);
    console.log(`🌐 Rodando em: http://localhost:${PORT}`);
    console.log(`==================================================`);
});
