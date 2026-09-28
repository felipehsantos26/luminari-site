const { Resend } = require('resend');

// Conecta o nosso robô de e-mail com a chave secreta guardada no .env
const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Função responsável por avisar você, o influenciador e o COMPRADOR sobre a nova venda
 */
async function enviarEmailsComissao(infoVenda) {
    // 📬 Captura todas as variáveis enviadas pelo Webhook do servidor
    const { cupom, precoPago, comissao, emailInfluenciador, entrega, emailComprador } = infoVenda;

    const valorFormatado = precoPago.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const comissaoFormatada = comissao.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    try {
        // 📧 1. ENVIAR E-MAIL PARA O INFLUENCIADOR (Dinâmico para o e-mail do parceiro!)
        if (cupom && cupom !== "NENHUM (Venda Directa pelo Site)") {
            await resend.emails.send({
                from: 'onboarding@resend.dev',
                to: emailInfluenciador, // 🌟 AGORA DINÂMICO: Vai direto para o e-mail do dono do cupom!
                subject: '🎉 Nova comissão gerada! | EcoAngel',
                html: `
                    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
                        <h2 style="color: #16a34a;">Parabéns! Uma nova venda foi realizada com o seu cupom.</h2>
                        <p>Olá, parceiro(a)! Alguém acabou de comprar uma <strong>Luminária Inteligente EcoAngel</strong> utilizando o seu código: <strong>${cupom}</strong>.</p>
                        <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0;">
                            <p style="margin: 5px 0;"><strong>Valor total da venda:</strong> ${valorFormatado}</p>
                            <p style="margin: 5px 0; color: #16a34a; font-size: 1.2rem;"><strong>Sua comissão:</strong> ${comissaoFormatada}</p>
                        </div>
                        <p style="color: #64748b; font-size: 0.9rem;">⚠️ <em>Lembrete de segurança: A comissão ficará retida por 15 dias contra cancelamentos.</em></p>
                        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">
                        <p style="font-size: 0.85rem; color: #94a3b8; text-align: center;">EcoAngel &copy; 2026</p>
                    </div>
                `
            });
            console.log(`✉️ E-mail enviado para o influenciador real (${emailInfluenciador}).`);
        }

        // 📧 2. ENVIAR E-MAIL PARA VOCÊ (O ADMINISTRADOR - Mantido fixo para sua fábrica!)
        await resend.emails.send({
            from: 'onboarding@resend.dev',
            to: 'felipeh.santos26@gmail.com', // 🔒 Mantido fixo para você gerenciar a produção!
            subject: '📦 Nova Luminária vendida! | EcoAngel',
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
                    <h2 style="color: #2563eb;">Sucesso! Nova venda aprovada no site.</h2>
                    <p>Felipe, uma nova venda da luminária inteligente entrou no circuito do site.</p>
                    
                    <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2563eb;">
                        <p style="margin: 5px 0;"><strong>Cupom utilizado:</strong> ${cupom}</p>
                        <p style="margin: 5px 0;"><strong>Valor pago pelo cliente:</strong> ${valorFormatado}</p>
                        <p style="margin: 5px 0; color: #b45309;"><strong>Comissão do Influenciador:</strong> ${comissaoFormatada}</p>
                        <p style="margin: 5px 0; color: #16a34a;"><strong>Seu Faturamento Líquido:</strong> ${(precoPago - comissao).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                    </div>

                    <h3 style="color: #334155; margin-top: 25px; border-bottom: 2px solid #f1f5f9; padding-bottom: 5px;">🚚 Dados de Entrega para Postagem</h3>
                    <div style="background-color: #fffdf5; padding: 15px; border: 1px dashed #e2e8f0; border-radius: 8px; margin: 15px 0;">
                        <p style="margin: 6px 0;"><strong>Nome do Comprador:</strong> ${entrega?.nome || 'Não preenchido'}</p>
                        <p style="margin: 6px 0;"><strong>Telefone de Contato:</strong> ${entrega?.telefone || 'Não preenchido'}</p>
                        <p style="margin: 6px 0;"><strong>E-mail do Cliente:</strong> ${emailComprador}</p>
                        <p style="margin: 6px 0;"><strong>Endereço / Rua:</strong> ${entrega?.rua || 'Não preenchido'}, Nº ${entrega?.numero || ''}</p>
                        <p style="margin: 6px 0;"><strong>Complemento / Bairro:</strong> ${entrega?.complemento || 'Não informado'}</p>
                        <p style="margin: 6px 0;"><strong>CEP de Destino:</strong> ${entrega?.cep || 'Não preenchido'}</p>
                    </div>
                    <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">
                    <p style="font-size: 0.85rem; color: #94a3b8; text-align: center;">Painel de Controle Interno EcoAngel</p>
                </div>
            `
        });
        console.log(`✉️ E-mail enviado para o Administrador.`);

        // 📧 3. 🚀 CONFIRMAÇÃO AUTOMÁTICA PARA O COMPRADOR (Dinâmico para quem comprou!)
        await resend.emails.send({
            from: 'onboarding@resend.dev',
            to: emailComprador, // 🌟 AGORA DINÂMICO: Vai direto para o e-mail real do cliente que comprou!
            subject: '📦 Seu pedido da EcoAngel foi aprovado!',
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
                    <div style="text-align: center; margin-bottom: 20px;">
                        <span style="font-size: 24px; font-weight: bold; color: #232323;">EcoAngel</span>
                    </div>
                    <h2 style="color: #16a34a; text-align: center;">Olá, ${entrega?.nome || 'Cliente'}! Seu pagamento foi confirmado.</h2>
                    <p style="text-align: center; color: #475569;">Ficamos muito felizes com a sua compra! O seu pedido já foi recebido e entrou na nossa linha de montagem e testes.</p>
                    
                    <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 25px 0;">
                        <h4 style="margin: 0 0 10px 0; color: #334155;">📋 Resumo do Pedido:</h4>
                        <p style="margin: 5px 0; font-size: 14px;"><strong>Produto:</strong> 1x Luminária Inteligente EcoAngel</p>
                        <p style="margin: 5px 0; font-size: 14px;"><strong>Valor Total Pago:</strong> ${valorFormatado}</p>
                        <p style="margin: 5px 0; font-size: 14px;"><strong>Status do Pagamento:</strong> Aprovado via Pix</p>
                    </div>

                    <div style="border-left: 4px solid #eab308; background-color: #fefce8; padding: 15px; border-radius: 4px; margin-bottom: 25px;">
                        <p style="margin: 0; font-size: 14px; color: #713f12;">🚚 <strong>Próximo passo:</strong> Assim que a sua luminária inteligente for postada na agência dos Correios, nós enviaremos um novo e-mail contendo o seu <strong>número de rastreamento</strong> para você acompanhar a entrega em tempo real.</p>
                    </div>

                    <p style="font-size: 14px; color: #475569; text-align: center;">Se você tiver qualquer dúvida ou precisar de suporte com o pareamento do seu produto, basta responder diretamente a este e-mail ou entrar em contato com o nosso time de atendimento.</p>
                    <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 30px 0;">
                    <p style="font-size: 0.8rem; color: #94a3b8; text-align: center;">EcoAngel - Tecnologia cuidando de quem você ama.<br />Araraquara - SP</p>
                </div>
            `
        });
        console.log(`✉️ E-mail profissional de confirmação enviado para o Comprador real (${emailComprador})!`);

    } catch (error) {
        console.error("❌ Ocorreu um erro ao enviar as notificações por e-mail:", error);
    }
}

module.exports = { enviarEmailsComissao };
