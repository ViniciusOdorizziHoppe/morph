// Funções globais da aplicação

// ========== AUTENTICAÇÃO ==========

// ========== AUTENTICAÇÃO ==========

async function handleLogin(event) {
    event.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const btn = event.target.querySelector('button[type="submit"]');
    
    // Loading state
    const originalText = btn.textContent;
    btn.textContent = 'Entrando...';
    btn.disabled = true;
    
    try {
        const result = await api.login(email, password);
        closeModals();
        UI.showUserUI(result.user.credits);
        showNotification('Login realizado com sucesso!', 'success');
    } catch (error) {
        console.error('Login error:', error);
        showNotification(error.message || 'Erro ao fazer login. Tente novamente.', 'error');
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

async function handleRegister(event) {
    event.preventDefault();
    
    const name = document.getElementById('registerName').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const btn = event.target.querySelector('button[type="submit"]');
    
    // Loading state
    const originalText = btn.textContent;
    btn.textContent = 'Criando conta...';
    btn.disabled = true;
    
    try {
        const result = await api.register(name, email, password);
        closeModals();
        UI.showUserUI(result.user.credits);
        showNotification('Conta criada com sucesso!', 'success');
    } catch (error) {
        console.error('Register error:', error);
        showNotification(error.message || 'Erro ao criar conta. Tente novamente.', 'error');
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}
// ========== GERAÇÃO DE IMAGEM ==========

async function generateImage() {
    if (UI.state.isGenerating) return;
    
    const { currentImage, currentStyle } = UI.state;
    const prompt = UI.elements.promptInput.value.trim();
    const strength = parseInt(UI.elements.strengthSlider.value);
    
    if (!currentImage) {
        showNotification('Selecione uma imagem primeiro', 'error');
        return;
    }
    
    if (!prompt) {
        showNotification('Digite uma descrição para a transformação', 'error');
        return;
    }
    
    UI.state.isGenerating = true;
    UI.updateGenerateButton();
    
    // Mostrar preview imediatamente
    const reader = new FileReader();
    reader.onload = async (e) => {
        UI.showResult(e.target.result, null, 'processing');
        
        try {
            // Chamar API com nova rota
            const result = await api.generateImage(
                currentImage,
                prompt,
                strength,
                currentStyle
            );
            
            showNotification('Geração iniciada! Aguarde...', 'info');
            
            // Atualizar créditos
            UI.updateCredits(result.data.creditsRemaining);
            
            // Polling para verificar status
            startPolling(result.data.generationId);
            
        } catch (error) {
            showNotification(error.message || 'Erro ao iniciar geração', 'error');
            UI.state.isGenerating = false;
            UI.updateGenerateButton();
            UI.elements.statusBadge.textContent = 'Falhou';
            UI.elements.statusBadge.classList.add('failed');
        }
    };
    reader.readAsDataURL(currentImage);
}

function startPolling(generationId) {
    // Limpar polling anterior se existir
    if (UI.state.pollingInterval) {
        clearInterval(UI.state.pollingInterval);
    }
    
    let attempts = 0;
    const maxAttempts = 60; // 2 minutos (2s * 60)
    
    UI.state.pollingInterval = setInterval(async () => {
        attempts++;
        
        try {
            const result = await api.getGenerationStatus(generationId);
            const data = result.data;
            
            if (data.status === 'completed') {
                clearInterval(UI.state.pollingInterval);
                UI.updateResult(data.outputImage, 'completed');
                showNotification('Imagem gerada com sucesso!', 'success');
            } else if (data.status === 'failed') {
                clearInterval(UI.state.pollingInterval);
                UI.updateResult(null, 'failed');
                showNotification('Falha na geração: ' + (data.errorMessage || 'Erro desconhecido'), 'error');
            }
            
            // Atualizar texto de loading
            if (data.status === 'processing') {
                UI.elements.loadingText.textContent = `Processando${'.'.repeat((attempts % 3) + 1)}`;
            } else if (data.status === 'queued') {
                UI.elements.loadingText.textContent = `Na fila (posição: ${data.queuePosition || '...'})`;
            }
            
        } catch (error) {
            console.error('Erro no polling:', error);
        }
        
        // Timeout
        if (attempts >= maxAttempts) {
            clearInterval(UI.state.pollingInterval);
            UI.updateResult(null, 'failed');
            showNotification('Tempo limite excedido. Tente novamente.', 'error');
        }
    }, 2000);
}

// ========== UTILIDADES ==========

function removeImage() {
    UI.removeImage();
}

function updateStrength(value) {
    UI.updateStrength(value);
}

function selectStyle(element) {
    UI.selectStyle(element);
}

function enhancePrompt() {
    const prompt = UI.elements.promptInput.value;
    if (!prompt) {
        showNotification('Digite um prompt primeiro', 'info');
        return;
    }
    
    // Adicionar melhorias automáticas ao prompt
    const enhancements = [
        'highly detailed',
        'professional quality',
        '8k resolution'
    ];
    
    const currentText = UI.elements.promptInput.value;
    const hasEnhancement = enhancements.some(e => currentText.toLowerCase().includes(e));
    
    if (!hasEnhancement) {
        UI.elements.promptInput.value = `${currentText}, highly detailed, professional quality`;
        UI.updateCharCount();
        showNotification('Prompt melhorado!', 'success');
    }
}

function newGeneration() {
    UI.elements.resultSection.classList.add('hidden');
    UI.removeImage();
    UI.elements.promptInput.value = '';
    UI.updateCharCount();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function downloadImage() {
    const img = UI.elements.resultTransformed;
    if (!img.src) return;
    
    const link = document.createElement('a');
    link.href = img.src;
    link.download = `morph-${Date.now()}.png`;
    link.click();
    
    showNotification('Download iniciado', 'success');
}

function shareImage() {
    const img = UI.elements.resultTransformed;
    if (!img.src) return;
    
    if (navigator.share) {
        navigator.share({
            title: 'Minha criação no MORPH',
            text: 'Veja o que criei com IA no MORPH!',
            url: img.src
        });
    } else {
        // Copiar link para clipboard
        navigator.clipboard.writeText(img.src);
        showNotification('Link copiado para a área de transferência', 'success');
    }
}

async function viewGeneration(id) {
    try {
        const result = await api.getGenerationStatus(id);
        const data = result.data;
        
        UI.showResult(data.inputImage, data.outputImage, data.status);
        UI.elements.promptInput.value = data.prompt;
        UI.updateCharCount();
        
        // Atualizar slider se necessário
        if (data.settings?.strength) {
            const strengthPercent = Math.round(data.settings.strength * 100);
            UI.elements.strengthSlider.value = strengthPercent;
            UI.updateStrength(strengthPercent);
        }
        
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
        showNotification('Erro ao carregar geração', 'error');
    }
}

// ========== CRÉDITOS ==========

function showBuyCredits() {
    UI.showModal('credits');
    loadCreditPlans();
}

function loadCreditPlans() {
    const plans = [
        { id: 'starter', credits: 5, price: 4.90, label: 'Starter' },
        { id: 'basic', credits: 12, price: 10.90, label: 'Básico', popular: true },
        { id: 'pro', credits: 30, price: 24.90, label: 'Pro' },
        { id: 'business', credits: 80, price: 59.90, label: 'Business' }
    ];
    
    const container = document.getElementById('creditPlans');
    container.innerHTML = plans.map(plan => `
        <div class="credit-plan ${plan.popular ? 'selected' : ''}" onclick="selectCreditPlan('${plan.id}')">
            <div class="plan-info">
                <h4>${plan.label}</h4>
                <p>${plan.credits} créditos</p>
            </div>
            <div class="plan-price">
                <div class="amount">R$ ${plan.price.toFixed(2)}</div>
                <div class="unit">R$ ${(plan.price / plan.credits).toFixed(2)}/crédito</div>
            </div>
        </div>
    `).join('');
}

function selectCreditPlan(planId) {
    document.querySelectorAll('.credit-plan').forEach(p => p.classList.remove('selected'));
    event.currentTarget.classList.add('selected');
    
    // Aqui você integraria com Stripe/Mercado Pago
    showNotification(`Plano ${planId} selecionado. Integração de pagamento pendente.`, 'info');
}

// ========== NOTIFICAÇÕES ==========

function showNotification(message, type = 'info') {
    // Criar elemento de notificação
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // Estilos inline (ou adicione ao CSS)
    notification.style.cssText = `
        position: fixed;
        top: 80px;
        right: 24px;
        padding: 16px 24px;
        background: ${type === 'success' ? 'var(--success)' : type === 'error' ? 'var(--error)' : 'var(--primary)'};
        color: white;
        border-radius: 8px;
        box-shadow: var(--shadow-lg);
        z-index: 9999;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 4000);
}

// ========== INICIALIZAÇÃO ==========

// Fechar modais ao clicar fora
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        closeModals();
    }
});

// Animações CSS (adicionar ao style.css)
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);