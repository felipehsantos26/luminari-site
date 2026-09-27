const { Resend } = require('resend');

// Conecta o nosso robô de e-mail com a chave secreta guardada no .env
const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Função responsável por avisar você e o influenciador sobre a nova comissão
 */
async function enviarEmailsComissao(infoVenda) {
    // 📬 Captura a nova variável 'entrega' vinda do banco de dados de memória do webhook
    const { cupom, precoPago, comissao, emailInfluenciador, entrega } = infoVenda;

    const valorFormatado = precoPago.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const comissaoFormatada = comissao.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    try {
        // 📧 1. ENVIAR E-MAIL PARA O INFLUENCIADOR (Apenas se houver cupom ativo)
        if (cupom && cupom !== "NENHUM (Venda Direta pelo Site)") {
            await resend.emails.send({
                from: 'onboarding@resend.dev',
                
                // 🛠️ MODO DE TESTE: Enviando para você para o Resend não dar erro 403.
                to: 'felipeh.santos26@gmail.com', 
                
                // 🚀 MODO PRODUÇÃO: Quando o domínio estiver verificado, apague a linha de cima e use esta:
                // to: emailInfluenciador, 

                subject: '🎉 Nova comissão gerada! | SmartGlucolamp',
                html: `
                    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
                        <h2 style="color: #16a34a;">Parabéns! Uma nova venda foi realizada com o seu cupom.</h2>
                        <p>Olá, parceiro(a)! Alguém acabou de comprar uma <strong>Luminária Inteligente SmartGlucolamp</strong> utilizando o seu código: <strong>${cupom}</strong>.</p>
                        <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0;">
                            <p style="margin: 5px 0;"><strong>Valor total da venda:</strong> ${valorFormatado}</p>
                            <p style="margin: 5px 0; color: #16a34a; font-size: 1.2rem;"><strong>Sua comissão (15%):</strong> ${comissaoFormatada}</p>
                        </div>
                        <p style="color: #64748b; font-size: 0.9rem;">⚠️ <em>Lembrete de segurança: A comissão ficará retida por 15 dias contra cancelamentos.</em></p>
                        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">
                        <p style="font-size: 0.85rem; color: #94a3b8; text-align: center;">SmartGlucolamp &copy; 2026</p>
                    </div>
                `
            });
            console.log(`✉️ E-mail de notificação enviado para o influenciador (Redirecionado para o seu e-mail de testes).`);
        }

        // 📧 2. ENVIAR E-MAIL PARA VOCÊ (O VENDEDOR DA LUMINÁRIA - ADM COM DADOS DE ENTREGA!)
        await resend.emails.send({
            from: 'onboarding@resend.dev',
            to: 'felipeh.santos26@gmail.com', // Seu e-mail de administrador
            subject: '📦 Nova Luminária vendida! | SmartGlucolamp',
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
                    <h2 style="color: #2563eb;">Sucesso! Nova venda aprovada no site.</h2>
                    <p>Felipe, uma nova venda da luminária inteligente entrou no circuito do site.</p>
                    
                    <!-- 📊 Resumo Financeiro -->
                    <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2563eb;">
                        <p style="margin: 5px 0;"><strong>Cupom utilizado:</strong> ${cupom}</p>
                        <p style="margin: 5px 0;"><strong>Valor pago pelo cliente:</strong> ${valorFormatado}</p>
                        <p style="margin: 5px 0; color: #b45309;"><strong>Comissão do Influenciador (Agendada):</strong> ${comissaoFormatada}</p>
                        <p style="margin: 5px 0; color: #16a34a;"><strong>Seu Faturamento Líquido (Aproximado):</strong> ${(precoPago - comissao).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                    </div>

                    <!-- 🚚 NOVO: DADOS DE ENTREGA DE CLIENTE PARA COMPRA DE ETIQUETA NO MELHOR ENVIO -->
                    <h3 style="color: #334155; margin-top: 25px; border-bottom: 2px solid #f1f5f9; padding-bottom: 5px;">🚚 Dados de Entrega para Postagem</h3>
                    <div style="background-color: #fffdf5; padding: 15px; border: 1px dashed #e2e8f0; border-radius: 8px; margin: 15px 0;">
                        <p style="margin: 6px 0;"><strong>Nome do Comprador:</strong> ${entrega?.nome || 'Não preenchido'}</p>
                        <p style="margin: 6px 0;"><strong>Telefone de Contato:</strong> ${entrega?.telefone || 'Não preenchido'}</p>
                        <p style="margin: 6px 0;"><strong>Endereço / Rua:</strong> ${entrega?.rua || 'Não preenchido'}, Nº ${entrega?.numero || ''}</p>
                        <p style="margin: 6px 0;"><strong>Complemento / Bairro:</strong> ${entrega?.complemento || 'Não informado'}</p>
                        <p style="margin: 6px 0;"><strong>CEP de Destino:</strong> ${entrega?.cep || 'Não preenchido'}</p>
                    </div>

                    <p style="margin-top: 20px;">Copie os dados acima e cole direto no painel do seu Melhor Envio para gerar a etiqueta com desconto.</p>
                    <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">
                    <p style="font-size: 0.85rem; color: #94a3b8; text-align: center;">Painel de Controle Interno SmartGlucolamp</p>
                </div>
            `
        });

        console.log(`✉️ E-mail de controle do Administrador enviado com sucesso!`);

    } catch (error) {
        console.error("❌ Ocorreu um erro ao enviar as notificações por e-mail:", error);
    }
}

module.exports = { enviarEmailsComissao };
