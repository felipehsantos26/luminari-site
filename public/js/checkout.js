// 1. Mapeando os elementos da tela que vamos usar
const couponInput = document.getElementById('coupon-input');
const applyCouponBtn = document.getElementById('apply-coupon-btn');
const couponMessage = document.getElementById('coupon-message');
const displayPrice = document.getElementById('display-price');
const buyBtn = document.getElementById('buy-btn');

// 🚚 Novos elementos mapeados para o cálculo de frete real
const cepInput = document.getElementById('cep-input');
const calculateShippingBtn = document.getElementById('calculate-shipping-btn');
const shippingOptions = document.getElementById('shipping-options');
const shippingMessage = document.getElementById('shipping-message');

// Variáveis de controle do estado da compra (guardam os valores selecionados)
let activeCoupon = "";
let baseProductPrice = 1.00; // Alinhado com o preço de teste do seu server.js atual
let selectedShippingCost = 0.00;
let selectedShippingId = "";

// Função auxiliar para atualizar o preço final somado na tela do cliente
function atualizarPrecoExibido() {
    const precoTotal = baseProductPrice + selectedShippingCost;
    displayPrice.innerText = `R$ ${precoTotal.toFixed(2).replace('.', ',')}`;
}

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
            baseProductPrice = data.novoPreco;
            atualizarPrecoExibido();
            showResponse(`Cupom ${couponCode} aplicado com sucesso!`, "success");
        } else {
            showResponse(data.mensagem || "Cupom inválido.", "error");
        }

    } catch (error) {
        showResponse("Erro ao validar cupom. Tente novamente.", "error");
    }
});

// 🚚 NOVA AÇÃO: Clicar no botão "Calcular Frete" (Chama a API do Melhor Envio via Servidor)
calculateShippingBtn.addEventListener('click', async () => {
    const cepValue = cepInput.value.trim().replace('-', '');

    if (cepValue.length !== 8) {
        shippingMessage.innerText = "Por favor, digite um CEP válido com 8 números.";
        shippingMessage.className = "message error";
        return;
    }

    try {
        calculateShippingBtn.innerText = "Calculando...";
        calculateShippingBtn.disabled = true;
        shippingOptions.innerHTML = "";
        shippingMessage.innerText = "";

        const response = await fetch('/api/frete/calcular', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cep: cepValue })
        });

        const opcoesFrete = await response.json();

        if (response.ok && opcoesFrete.length > 0) {
            shippingMessage.innerText = "Selecione a opção de entrega:";
            shippingMessage.className = "message success";

            // Monta os botões de seleção de frete de forma bonita na interface
            opcoesFrete.forEach(opcao => {
                const itemFrete = document.createElement('div');
                itemFrete.style.padding = "10px";
                itemFrete.style.border = "1px solid #ccc";
                itemFrete.style.borderRadius = "5px";
                itemFrete.style.display = "flex";
                itemFrete.style.alignItems = "center";
                itemFrete.style.gap = "10px";
                itemFrete.style.cursor = "pointer";

                itemFrete.innerHTML = `
                    <input type="radio" name="opcao-frete" id="frete-${opcao.id}" value="${opcao.price}" data-id="${opcao.id}" style="cursor: pointer;">
                    <label for="frete-${opcao.id}" style="flex: 1; cursor: pointer; font-size: 14px;">
                        <strong>${opcao.name}</strong> - R$ ${Number(opcao.price).toFixed(2).replace('.', ',')} (${opcao.deadline} dias)
                    </label>
                `;

                // Quando o cliente clica na opção do frete, recalcula o total na hora!
                itemFrete.addEventListener('click', () => {
                    const radioButton = itemFrete.querySelector('input[type="radio"]');
                    radioButton.checked = true;
                    selectedShippingCost = Number(opcao.price);
                    selectedShippingId = opcao.id;
                    atualizarPrecoExibido();
                });

                shippingOptions.appendChild(itemFrete);
            });
        } else {
            shippingMessage.innerText = "Não encontramos opções de frete para este CEP. Verifique o número.";
            shippingMessage.className = "message error";
        }

    } catch (error) {
        shippingMessage.innerText = "Erro ao calcular frete. Tente novamente.";
        shippingMessage.className = "message error";
    } finally {
        calculateShippingBtn.innerText = "Calcular Frete";
        calculateShippingBtn.disabled = false;
    }
});

// 3. Ação de clicar no botão principal "Garantir Minha Luminária"
buyBtn.addEventListener('click', async () => {
    // 🚚 SEGURANÇA: Se o cliente ainda não selecionou um frete real, barra a compra!
    if (selectedShippingCost === 0 && selectedShippingId === "") {
        alert("Por favor, preencha seu CEP e selecione uma opção de frete antes de continuar.");
        return;
    }

    try {
        buyBtn.innerText = "Processando...";
        buyBtn.disabled = true;

        // Avisa o servidor enviando o cupom e também o serviço de frete escolhido
        const response = await fetch('/api/vendas/criar-pagamento', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                cupom: activeCoupon,
                freteId: selectedShippingId
            })
        });

        const data = await response.json();

        // Se o servidor devolveu o link do Mercado Pago com sucesso
        if (response.ok && data.init_point) {
            buyBtn.innerText = "Redirecionando...";
            window.location.href = data.init_point;
        } else {
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
