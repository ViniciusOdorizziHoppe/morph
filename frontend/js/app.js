// ==========================================
// MORPH - Frontend Application
// ==========================================
// NOTA: API_CONFIG e api vêm de api.js (carregado antes deste script)

// ==========================================
// ESTADO E ELEMENTOS
// ==========================================

const state = {
    currentImage: null,
    currentStyle: 'anime',
    isGenerating: false,
    pollingInterval: null
};

// Elementos DOM (inicializados no DOMContentLoaded)
let elements = {};

// ==========================================
// FUNÇÕES GLOBAIS (necessárias para HTML)
// ==========================================

window.showLogin = function() {
    closeModals();
    document.getElementById('loginModal').classList.remove('hidden');
};

window.showRegister = function() {
    closeModals();
    document.getElementById('registerModal').classList.remove('hidden');
};

window.closeModals = function() {
    document.getElementById('loginModal').classList.add('hidden');
    document.getElementById('registerModal').classList.add('hidden');
    document.getElementById('creditsModal').classList.add('hidden');
};

window.logout = function() {
    api.logout();
    showAuthUI();
    showNotification('Logout realizado', 'info');
};

window.removeImage = function() {
    state.currentImage = null;
    elements.imageInput.value = '';
    elements.previewImage.src = '';
    elements.previewImage.classList.add('hidden');
    elements.uploadPlaceholder.classList.remove('hidden');
    elements.removeImage.classList.add('hidden');
    updateGenerateButton();
};

window.updateStrength = function(value) {
    elements.strengthValue.textContent = `${value}%`;
};

window.selectStyle = function(chip) {
    document.querySelectorAll('.style-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    state.currentStyle = chip.dataset.style;
};

window.enhancePrompt = function() {
    const prompt = elements.promptInput.value;
    if (!prompt) {
        showNotification('Digite um prompt primeiro', 'info');
        return;
    }

    const hasEnhancement = ['highly detailed', 'professional quality', '8k'].some(e =>
        prompt.toLowerCase().includes(e)
    );

    if (!hasEnhancement) {
        elements.promptInput.value = `${prompt}, highly detailed, professional quality`;
        updateCharCount();
        showNotification('Prompt melhorado!', 'success');
    }
};

window.generateImage = async function() {
    if (state.isGenerating) return;

    const token = localStorage.getItem('morph_token');
    if (!token) {
        showLogin();
        return;
    }

    const { currentImage, currentStyle } = state;
    const prompt = elements.promptInput.value.trim();
    const strength = parseInt(elements.strengthSlider.value);

    if (!currentImage || !prompt) return;

    state.isGenerating = true;
    updateGenerateButton();

    const reader = new FileReader();
    reader.onload = async (e) => {
        showResult(e.target.result, null, 'processing');

        try {
            const result = await api.generateImage(currentImage, prompt, strength, currentStyle);
            showNotification('Geração iniciada!', 'info');
            updateCredits(result.data.creditsRemaining);
            startPolling(result.data.generationId);
        } catch (error) {
            showNotification(error.message, 'error');
            state.isGenerating = false;
            updateGenerateButton();
            elements.statusBadge.textContent = 'Falhou';
            elements.statusBadge.classList.add('failed');
        }
    };
    reader.readAsDataURL(currentImage);
};

window.downloadImage = function() {
    const img = elements.resultTransformed;
    if (!img.src) return;

    const link = document.createElement('a');
    link.href = img.src;
    link.download = `morph-${Date.now()}.png`;
    link.click();
    showNotification('Download iniciado', 'success');
};

window.shareImage = function() {
    const img = elements.resultTransformed;
    if (!img.src) return;

    if (navigator.share) {
        navigator.share({
            title: 'Minha criação no MORPH',
            text: 'Veja o que criei com IA!',
            url: img.src
        });
    } else {
        navigator.clipboard.writeText(img.src);
        showNotification('Link copiado!', 'success');
    }
};

window.newGeneration = function() {
    elements.resultSection.classList.add('hidden');
    removeImage();
    elements.promptInput.value = '';
    updateCharCount();
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.showBuyCredits = function() {
    closeModals();
    document.getElementById('creditsModal').classList.remove('hidden');
    loadCreditPlans();
};

window.selectCreditPlan = function(planId, element) {
    document.querySelectorAll('.credit-plan').forEach(p => p.classList.remove('selected'));
    element.classList.add('selected');
    showNotification(`Plano ${planId} selecionado (integração pendente)`, 'info');
};

window.viewGeneration = async function(id) {
    try {
        const result = await api.getGenerationStatus(id);
        const data = result.data;

        showResult(data.inputImage, data.outputImage, data.status);
        elements.promptInput.value = data.prompt;
        updateCharCount();

        if (data.settings?.strength) {
            const percent = Math.round(data.settings.strength * 100);
            elements.strengthSlider.value = percent;
            updateStrength(percent);
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
        showNotification('Erro ao carregar', 'error');
    }
};

// ==========================================
// FUNÇÕES INTERNAS
// ==========================================

function initElements() {
    elements = {
        authSection: document.getElementById('authSection'),
        userSection: document.getElementById('userSection'),
        creditsCount: document.getElementById('creditsCount'),
        loginModal: document.getElementById('loginModal'),
        registerModal: document.getElementById('registerModal'),
        creditsModal: document.getElementById('creditsModal'),
        formLogin: document.getElementById('formLogin'),
        formRegister: document.getElementById('formRegister'),
        uploadArea: document.getElementById('uploadArea'),
        imageInput: document.getElementById('imageInput'),
        uploadPlaceholder: document.getElementById('uploadPlaceholder'),
        previewImage: document.getElementById('previewImage'),
        removeImage: document.getElementById('removeImage'),
        promptInput: document.getElementById('promptInput'),
        charCount: document.getElementById('charCount'),
        strengthSlider: document.getElementById('strengthSlider'),
        strengthValue: document.getElementById('strengthValue'),
        generateBtn: document.getElementById('generateBtn'),
        generateText: document.getElementById('generateText'),
        resultSection: document.getElementById('resultSection'),
        resultOriginal: document.getElementById('resultOriginal'),
        resultTransformed: document.getElementById('resultTransformed'),
        loadingOverlay: document.getElementById('loadingOverlay'),
        loadingText: document.getElementById('loadingText'),
        statusBadge: document.getElementById('statusBadge'),
        resultActions: document.getElementById('resultActions'),
        historyGrid: document.getElementById('historyGrid'),
        styleChips: document.getElementById('styleChips')
    };
}

function bindEvents() {
    // Botões header
    document.getElementById('btnEntrar').addEventListener('click', showLogin);
    document.getElementById('btnCriarConta').addEventListener('click', showRegister);

    // Fechar modais
    document.getElementById('closeLogin').addEventListener('click', closeModals);
    document.getElementById('closeRegister').addEventListener('click', closeModals);
    document.getElementById('closeCredits').addEventListener('click', closeModals);

    // Links modais
    document.getElementById('linkCriarConta').addEventListener('click', (e) => {
        e.preventDefault();
        showRegister();
    });
    document.getElementById('linkEntrar').addEventListener('click', (e) => {
        e.preventDefault();
        showLogin();
    });

    // Forms
    elements.formLogin.addEventListener('submit', handleLogin);
    elements.formRegister.addEventListener('submit', handleRegister);

    // Upload
    elements.uploadArea.addEventListener('click', () => elements.imageInput.click());
    elements.uploadArea.addEventListener('dragover', handleDragOver);
    elements.uploadArea.addEventListener('dragleave', handleDragLeave);
    elements.uploadArea.addEventListener('drop', handleDrop);
    elements.imageInput.addEventListener('change', handleFileSelect);

    // Controles
    elements.promptInput.addEventListener('input', updateCharCount);
    elements.strengthSlider.addEventListener('input', (e) => updateStrength(e.target.value));
    document.getElementById('btnMelhorarPrompt').addEventListener('click', enhancePrompt);
    elements.generateBtn.addEventListener('click', generateImage);

    // Style chips
    elements.styleChips.querySelectorAll('.style-chip').forEach(chip => {
        chip.addEventListener('click', () => selectStyle(chip));
    });

    // Modais - clicar fora
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModals();
        });
    });
}

async function handleLogin(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.textContent;

    btn.textContent = 'Entrando...';
    btn.disabled = true;

    try {
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;

        const result = await api.login(email, password);
        closeModals();
        showUserUI(result.user.credits);
        showNotification('Login realizado com sucesso!', 'success');
    } catch (error) {
        showNotification(error.message || 'Erro ao fazer login', 'error');
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.textContent;

    btn.textContent = 'Criando...';
    btn.disabled = true;

    try {
        const name = document.getElementById('registerName').value;
        const email = document.getElementById('registerEmail').value;
        const password = document.getElementById('registerPassword').value;

        const result = await api.register(name, email, password);
        closeModals();
        showUserUI(result.user.credits);
        showNotification('Conta criada com sucesso!', 'success');
    } catch (error) {
        showNotification(error.message || 'Erro ao criar conta', 'error');
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

function handleDragOver(e) {
    e.preventDefault();
    elements.uploadArea.classList.add('dragover');
}

function handleDragLeave(e) {
    e.preventDefault();
    elements.uploadArea.classList.remove('dragover');
}

function handleDrop(e) {
    e.preventDefault();
    elements.uploadArea.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length) handleFile(files[0]);
}

function handleFileSelect(e) {
    const files = e.target.files;
    if (files.length) handleFile(files[0]);
}

function handleFile(file) {
    if (!file.type.startsWith('image/')) {
        showNotification('Selecione uma imagem válida', 'error');
        return;
    }
    if (file.size > 10 * 1024 * 1024) {
        showNotification('Imagem muito grande. Máximo 10MB.', 'error');
        return;
    }

    state.currentImage = file;

    const reader = new FileReader();
    reader.onload = (e) => {
        elements.previewImage.src = e.target.result;
        elements.previewImage.classList.remove('hidden');
        elements.uploadPlaceholder.classList.add('hidden');
        elements.removeImage.classList.add('hidden');
        updateGenerateButton();
    };
    reader.readAsDataURL(file);
}

function updateCharCount() {
    const length = elements.promptInput.value.length;
    elements.charCount.textContent = `${length}/1000`;
    elements.charCount.style.color = length > 1000 ? 'var(--error)' : 'var(--text-secondary)';
    updateGenerateButton();
}

function updateGenerateButton() {
    const hasImage = !!state.currentImage;
    const hasPrompt = elements.promptInput.value.trim().length > 0;
    const isLogged = !!localStorage.getItem('morph_token');

    elements.generateBtn.disabled = !hasImage || !hasPrompt || state.isGenerating;

    if (!isLogged) {
        elements.generateText.textContent = 'Faça login para gerar';
    } else if (state.isGenerating) {
        elements.generateText.textContent = 'Gerando...';
    } else {
        elements.generateText.textContent = 'Gerar Imagem';
    }
}

function showResult(originalUrl, transformedUrl = null, status = 'processing') {
    elements.resultSection.classList.remove('hidden');
    elements.resultOriginal.src = originalUrl;

    if (transformedUrl) {
        elements.resultTransformed.src = transformedUrl;
        elements.resultTransformed.classList.remove('loading');
        elements.loadingOverlay.classList.add('hidden');
        elements.statusBadge.textContent = 'Concluído';
        elements.statusBadge.classList.add('completed');
        elements.resultActions.classList.remove('hidden');
    } else {
        elements.resultTransformed.classList.add('loading');
        elements.loadingOverlay.classList.remove('hidden');
        elements.statusBadge.textContent = 'Processando...';
        elements.statusBadge.classList.remove('completed', 'failed');
        elements.resultActions.classList.add('hidden');
    }

    elements.resultSection.scrollIntoView({ behavior: 'smooth' });
}

function startPolling(generationId) {
    if (state.pollingInterval) clearInterval(state.pollingInterval);

    let attempts = 0;
    const maxAttempts = 60;

    state.pollingInterval = setInterval(async () => {
        attempts++;

        try {
            const result = await api.getGenerationStatus(generationId);
            const data = result.data;

            if (data.status === 'completed') {
                clearInterval(state.pollingInterval);
                updateResult(data.outputImage, 'completed');
                showNotification('Imagem gerada!', 'success');
            } else if (data.status === 'failed') {
                clearInterval(state.pollingInterval);
                updateResult(null, 'failed');
                showNotification('Falha na geração', 'error');
            }

            elements.loadingText.textContent = data.status === 'processing'
                ? `Processando${'.'.repeat((attempts % 3) + 1)}`
                : `Na fila...`;

        } catch (error) {
            console.error('Polling error:', error);
        }

        if (attempts >= maxAttempts) {
            clearInterval(state.pollingInterval);
            updateResult(null, 'failed');
        }
    }, 2000);
}

function updateResult(imageUrl, status) {
    if (status === 'completed') {
        elements.resultTransformed.src = imageUrl;
        elements.resultTransformed.classList.remove('loading');
        elements.loadingOverlay.classList.add('hidden');
        elements.statusBadge.textContent = 'Concluído';
        elements.statusBadge.classList.add('completed');
        elements.resultActions.classList.remove('hidden');
        state.isGenerating = false;
        updateGenerateButton();
        loadHistory();
    } else if (status === 'failed') {
        elements.statusBadge.textContent = 'Falhou';
        elements.statusBadge.classList.add('failed');
        state.isGenerating = false;
        updateGenerateButton();
    }
}

async function checkAuth() {
    const token = localStorage.getItem('morph_token');
    if (!token) {
        showAuthUI();
        return;
    }

    try {
        const result = await api.verifyToken();
        showUserUI(result.user.credits);
    } catch (error) {
        api.logout();
        showAuthUI();
    }
}

function showAuthUI() {
    elements.authSection.classList.remove('hidden');
    elements.userSection.classList.add('hidden');
    updateGenerateButton();
}

function showUserUI(credits) {
    elements.authSection.classList.add('hidden');
    elements.userSection.classList.remove('hidden');
    elements.creditsCount.textContent = credits;
    updateGenerateButton();
    loadHistory();
}

function updateCredits(credits) {
    elements.creditsCount.textContent = credits;
}

async function loadHistory() {
    try {
        const result = await api.getHistory();
        const generations = result.data?.generations || [];

        if (generations.length === 0) {
            elements.historyGrid.innerHTML = '<div class="history-empty"><p>Nenhuma transformação ainda</p></div>';
            return;
        }

        elements.historyGrid.innerHTML = generations.map(gen => `
            <div class="history-item" onclick="viewGeneration('${gen.id}')">
                <img src="${gen.outputImage || gen.inputImage}" alt="${gen.prompt}">
            </div>
        `).join('');
    } catch (error) {
        console.error('Erro ao carregar histórico:', error);
    }
}

function loadCreditPlans() {
    const plans = [
        { id: 'starter',  credits: 5,  price: 4.90,  label: 'Starter' },
        { id: 'basic',    credits: 12, price: 10.90, label: 'Básico', popular: true },
        { id: 'pro',      credits: 30, price: 24.90, label: 'Pro' },
        { id: 'business', credits: 80, price: 59.90, label: 'Business' }
    ];

    const container = document.getElementById('creditPlans');
    container.innerHTML = plans.map(plan => `
        <div class="credit-plan ${plan.popular ? 'selected' : ''}" onclick="selectCreditPlan('${plan.id}', this)">
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

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 80px;
        right: 24px;
        padding: 16px 24px;
        background: ${type === 'success' ? '#10B981' : type === 'error' ? '#EF4444' : '#8B5CF6'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.4);
        z-index: 9999;
        animation: slideIn 0.3s ease;
        font-weight: 500;
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 4000);
}

// ==========================================
// INICIALIZAÇÃO
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    initElements();
    bindEvents();
    checkAuth();
    updateCharCount();

    // Animações de notificação
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to   { transform: translateX(0);    opacity: 1; }
        }
        @keyframes slideOut {
            from { transform: translateX(0);    opacity: 1; }
            to   { transform: translateX(100%); opacity: 0; }
        }
    `;
    document.head.appendChild(style);
});