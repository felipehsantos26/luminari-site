// 1. Mapeando os elementos da tela que vamos usar
const couponInput = document.getElementById('coupon-input');
const applyCouponBtn = document.getElementById('apply-coupon-btn');
const couponMessage = document.getElementById('coupon-message');
const displayPrice = document.getElementById('display-price');
const buyBtn = document.getElementById('buy-btn');

// Variável para guardar o cupom digitado (começa vazia)
let activeCoupon = "";

// 2. Ação de clicar no botão "Aplicar" Cupom
applyCouponBtn.addEventListener('click', async () => {
    const couponCode = couponInput.value.trim().toUpperCase();

    if (!couponCode) {
        showResponse("Por favor, digite um cupom.", "error");
        return;
    }

    try {
        const response = await fetch('/api/vendas/validar-cupom', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cupom: couponCode })
        });

        const data = await response.json();

        if (response.ok) {
            activeCoupon = couponCode;
            displayPrice.innerText = `R$ ${data.novoPreco.toFixed(2).replace('.', ',')}`;
            showResponse(`Cupom ${couponCode} aplicado com sucesso!`, "success");
        } else {
            showResponse(data.mensagem || "Cupom inválido.", "error");
        }

    } catch (error) {
        showResponse("Erro ao validar cupom. Tente novamente.", "error");
    }
});

// 3. Ação de clicar no botão principal "Garantir Minha Luminária"
buyBtn.addEventListener('click', async () => {
    try {
        buyBtn.innerText = "Processando...";
        buyBtn.disabled = true;

        // Avisa o servidor que o cliente quer comprar e envia o cupom (se houver)
        const response = await fetch('/api/vendas/criar-pagamento', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cupom: activeCoupon })
        });

        const data = await response.json();

        // Se o servidor devolveu o link do Mercado Pago com sucesso
        if (response.ok && data.init_point) {
            buyBtn.innerText = "Redirecionando...";
            // Redireciona o cliente diretamente para a página de pagamento estável do Mercado Pago
            window.location.href = data.init_point;
        } else {
            // Se o servidor mandou uma mensagem de erro real, mostra ela na tela
            const msgErro = data.mensagem_real || "Erro ao gerar link de pagamento.";
            alert(`Ops! ${msgErro}`);
            buyBtn.innerText = "Garantir Minha Luminária";
            buyBtn.disabled = false;
        }

    } catch (error) {
        alert("Erro de conexão com o servidor. Verifique se o terminal está ligado.");
        buyBtn.innerText = "Garantir Minha Luminária";
        buyBtn.disabled = false;
    }
});

// Função auxiliar para mostrar as mensagens bonitas na tela (Verde ou Vermelho)
function showResponse(text, type) {
    couponMessage.innerText = text;
    couponMessage.className = `message ${type}`;
}