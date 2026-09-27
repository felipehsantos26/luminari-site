// Rota 2: Criar Pagamento com Coleta Obrigatória de Endereço e CPF
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
            // 👤 OBRIGA O MERCADO PAGO A COLETAR OS DADOS DO CLIENTE
            payer: {
                phone: {},
                identification: {},
                address: {}
            },
            // 🚚 ATIVA A TELA DE PREENCHIMENTO DO ENDEREÇO DE ENTREGA
            shipments: {
                mode: "not_specified",
                cost: 0.00 // Deixamos o frete zerado por enquanto para o seu teste de 1 real
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
// 🚨 ROTA 3: WEBHOOK BLINDADO DO MERCADO PAGO COM CAPTURA DE ENDEREÇO
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

                    // 📝 CAPTURA OS DADOS DE ENTREGA COLETADOS PELO MERCADO PAGO
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
                    console.log(`==================================================`);

                    let valorComissao = 0;
                    let emailInfluenciador = "felipeh.santos26@gmail.com";

                    if (cupomUsado && cuponsValidos[cupomUsado]) {
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
