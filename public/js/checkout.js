// 1. Mapeando os elementos da tela que vamos usar
const couponInput = document.getElementById('coupon-input');
const applyCouponBtn = document.getElementById('apply-coupon-btn');
const couponMessage = document.getElementById('coupon-message');
const displayPrice = document.getElementById('display-price');
const buyBtn = document.getElementById('buy-btn');

// 🚚 Elementos mapeados para o formulário de entrega e frete
const clientNameInput = document.getElementById('client-name-input');
const clientPhoneInput = document.getElementById('client-phone-input');
const cepInput = document.getElementById('cep-input');
const calculateShippingBtn = document.getElementById('calculate-shipping-btn');
const shippingOptions = document.getElementById('shipping-options');
const shippingMessage = document.getElementById('shipping-message');
const streetInput = document.getElementById('street-input');
const numberInput = document.getElementById('number-input');
const complementInput = document.getElementById('complement-input');

// Variáveis de controle do estado da compra
let activeCoupon = "";
let baseProductPrice = 1.00; // Preço de teste alinhado com o servidor
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
        const response = await fetch('/api/vendas/validar-coupon', {
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

// 🚚 Clicar no botão "Calcular Frete"
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
            shippingMessage.innerText = "Erro nas transportadoras. Usando opções de segurança.";
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
    // 🛡️ TRAVA DE SEGURANÇA PROFISSIONAL: Captura os textos e valida se algum está em branco
    const nome = clientNameInput.value.trim();
    const telefone = clientPhoneInput.value.trim();
    const cep = cepInput.value.trim();
    const rua = streetInput.value.trim();
    const numero = numberInput.value.trim();
    const complementoBairro = complementInput.value.trim();

    if (!nome || !telefone || !cep || !rua || !numero || !complementoBairro) {
        alert("⚠️ ATENÇÃO: Por favor, preencha todos os campos dos Dados de Entrega antes de prosseguir com o pagamento!");
        return;
    }

    if (selectedShippingCost === 0 && selectedShippingId === "") {
        alert("⚠️ ATENÇÃO: Por favor, clique em 'Calcular Frete' e selecione uma opção de entrega disponível.");
        return;
    }

    try {
        buyBtn.innerText = "Processando...";
        buyBtn.disabled = true;

        // Pacote completo de dados enviado para o servidor processar e guardar
        const response = await fetch('/api/vendas/criar-pagamento', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                cupom: activeCoupon,
                freteId: selectedShippingId,
                fretePreco: selectedShippingCost,
                // Injeta os dados cadastrados pelo usuário para o backend usar no e-mail
                clienteInfo: {
                    nome: nome,
                    telefone: telefone,
                    cep: cep,
                    rua: rua,
                    numero: numero,
                    complemento: complementoBairro
                }
            })
        });

        const data = await response.json();

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

function showResponse(text, type) {
    couponMessage.innerText = text;
    couponMessage.className = `message ${type}`;
}
