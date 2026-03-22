/**
 * MORPH - Frontend Application
 * Aplicação principal para transformação de imagens com IA
 */

// Estado da aplicação
const appState = {
  user: null,
  credits: 0,
  currentImage: null,
  currentGeneration: null,
  selectedStyle: 'anime',
  strength: 0.75,
  isGenerating: false
};

// Elementos DOM
const elements = {};

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
  initializeElements();
  initializeEventListeners();
  checkAuth();
  loadHistory();
});

// Inicializar referências aos elementos
function initializeElements() {
  // Header
  elements.authSection = document.getElementById('authSection');
  elements.userSection = document.getElementById('userSection');
  elements.creditsCount = document.getElementById('creditsCount');
  elements.btnEntrar = document.getElementById('btnEntrar');
  elements.btnCriarConta = document.getElementById('btnCriarConta');
  
  // Upload
  elements.uploadArea = document.getElementById('uploadArea');
  elements.imageInput = document.getElementById('imageInput');
  elements.uploadPlaceholder = document.getElementById('uploadPlaceholder');
  elements.previewImage = document.getElementById('previewImage');
  elements.removeImage = document.getElementById('removeImage');
  
  // Controls
  elements.promptInput = document.getElementById('promptInput');
  elements.charCount = document.getElementById('charCount');
  elements.btnMelhorarPrompt = document.getElementById('btnMelhorarPrompt');
  elements.styleChips = document.getElementById('styleChips');
  elements.strengthSlider = document.getElementById('strengthSlider');
  elements.strengthValue = document.getElementById('strengthValue');
  elements.generateBtn = document.getElementById('generateBtn');
  elements.generateText = document.getElementById('generateText');
  
  // Result
  elements.resultSection = document.getElementById('resultSection');
  elements.statusBadge = document.getElementById('statusBadge');
  elements.resultOriginal = document.getElementById('resultOriginal');
  elements.resultTransformed = document.getElementById('resultTransformed');
  elements.loadingOverlay = document.getElementById('loadingOverlay');
  elements.loadingText = document.getElementById('loadingText');
  elements.resultActions = document.getElementById('resultActions');
  elements.btnDownload = document.getElementById('btnDownload');
  elements.btnShare = document.getElementById('btnShare');
  elements.btnNova = document.getElementById('btnNova');
  
  // History
  elements.historyGrid = document.getElementById('historyGrid');
  
  // Modals
  elements.loginModal = document.getElementById('loginModal');
  elements.registerModal = document.getElementById('registerModal');
  elements.creditsModal = document.getElementById('creditsModal');
  elements.closeLogin = document.getElementById('closeLogin');
  elements.closeRegister = document.getElementById('closeRegister');
  elements.closeCredits = document.getElementById('closeCredits');
  elements.formLogin = document.getElementById('formLogin');
  elements.formRegister = document.getElementById('formRegister');
  elements.linkCriarConta = document.getElementById('linkCriarConta');
  elements.linkEntrar = document.getElementById('linkEntrar');
}

// Inicializar event listeners
function initializeEventListeners() {
  // Upload
  elements.uploadArea.addEventListener('click', () => elements.imageInput.click());
  elements.imageInput.addEventListener('change', handleImageSelect);
  elements.uploadArea.addEventListener('dragover', handleDragOver);
  elements.uploadArea.addEventListener('dragleave', handleDragLeave);
  elements.uploadArea.addEventListener('drop', handleDrop);
  elements.removeImage.addEventListener('click', removeImage);
  
  // Prompt
  elements.promptInput.addEventListener('input', updateCharCount);
  elements.btnMelhorarPrompt.addEventListener('click', improvePrompt);
  
  // Style chips
  elements.styleChips.addEventListener('click', handleStyleSelect);
  
  // Strength slider
  elements.strengthSlider.addEventListener('input', updateStrength);
  
  // Generate
  elements.generateBtn.addEventListener('click', generateImage);
  
  // Result actions
  elements.btnNova.addEventListener('click', resetForm);
  elements.btnDownload.addEventListener('click', downloadImage);
  elements.btnShare.addEventListener('click', shareImage);
  
  // Auth buttons
  elements.btnEntrar.addEventListener('click', () => showModal('login'));
  elements.btnCriarConta.addEventListener('click', () => showModal('register'));
  
  // Modal close
  elements.closeLogin.addEventListener('click', () => hideModal('login'));
  elements.closeRegister.addEventListener('click', () => hideModal('register'));
  elements.closeCredits.addEventListener('click', () => hideModal('credits'));
  
  // Forms
  elements.formLogin.addEventListener('submit', handleLogin);
  elements.formRegister.addEventListener('submit', handleRegister);
  
  // Links
  elements.linkCriarConta.addEventListener('click', (e) => {
    e.preventDefault();
    hideModal('login');
    showModal('register');
  });
  elements.linkEntrar.addEventListener('click', (e) => {
    e.preventDefault();
    hideModal('register');
    showModal('login');
  });
  
  // Close modals on outside click
  window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
      e.target.classList.add('hidden');
    }
  });
}

// ========== AUTH ==========

async function checkAuth() {
  const token = localStorage.getItem('morph_token');
  if (!token) {
    updateAuthUI(false);
    return;
  }
  
  try {
    const data = await api.getMe();
    if (data.success) {
      appState.user = data.user;
      appState.credits = data.user.credits;
      updateAuthUI(true);
    }
  } catch (error) {
    console.error('Auth check failed:', error);
    localStorage.removeItem('morph_token');
    updateAuthUI(false);
  }
}

function updateAuthUI(isLoggedIn) {
  if (isLoggedIn && appState.user) {
    elements.authSection.classList.add('hidden');
    elements.userSection.classList.remove('hidden');
    elements.creditsCount.textContent = appState.credits;
  } else {
    elements.authSection.classList.remove('hidden');
    elements.userSection.classList.add('hidden');
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  
  try {
    const data = await api.login(email, password);
    if (data.success) {
      appState.user = data.user;
      appState.credits = data.user.credits;
      updateAuthUI(true);
      hideModal('login');
      showNotification('Login realizado com sucesso!', 'success');
      loadHistory();
    }
  } catch (error) {
    showNotification(error.data?.message || 'Erro ao fazer login', 'error');
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const name = document.getElementById('registerName').value;
  const email = document.getElementById('registerEmail').value;
  const password = document.getElementById('registerPassword').value;
  
  try {
    const data = await api.register(name, email, password);
    if (data.success) {
      appState.user = data.user;
      appState.credits = data.user.credits;
      updateAuthUI(true);
      hideModal('register');
      showNotification(`Bem-vindo! Você recebeu ${data.user.credits} créditos grátis!`, 'success');
      loadHistory();
    }
  } catch (error) {
    showNotification(error.data?.message || 'Erro ao criar conta', 'error');
  }
}

function logout() {
  api.logout();
  appState.user = null;
  appState.credits = 0;
  updateAuthUI(false);
  showNotification('Logout realizado', 'info');
}

// ========== UPLOAD ==========

function handleImageSelect(e) {
  const file = e.target.files[0];
  if (file) processImageFile(file);
}

function handleDragOver(e) {
  e.preventDefault();
  elements.uploadArea.classList.add('drag-over');
}

function handleDragLeave(e) {
  e.preventDefault();
  elements.uploadArea.classList.remove('drag-over');
}

function handleDrop(e) {
  e.preventDefault();
  elements.uploadArea.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) {
    processImageFile(file);
  }
}

function processImageFile(file) {
  if (file.size > 10 * 1024 * 1024) {
    showNotification('Imagem muito grande. Máximo 10MB.', 'error');
    return;
  }
  
  appState.currentImage = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    elements.previewImage.src = e.target.result;
    elements.previewImage.classList.remove('hidden');
    elements.uploadPlaceholder.classList.add('hidden');
    elements.removeImage.classList.remove('hidden');
    updateGenerateButton();
  };
  reader.readAsDataURL(file);
}

function removeImage(e) {
  e.stopPropagation();
  appState.currentImage = null;
  elements.imageInput.value = '';
  elements.previewImage.src = '';
  elements.previewImage.classList.add('hidden');
  elements.uploadPlaceholder.classList.remove('hidden');
  elements.removeImage.classList.add('hidden');
  updateGenerateButton();
}

// ========== CONTROLS ==========

function updateCharCount() {
  const count = elements.promptInput.value.length;
  elements.charCount.textContent = `${count}/1000`;
  updateGenerateButton();
}

async function improvePrompt() {
  const prompt = elements.promptInput.value.trim();
  if (!prompt) {
    showNotification('Digite um prompt primeiro', 'error');
    return;
  }
  
  // Simulação de melhoria de prompt
  const improvements = {
    'anime': 'anime style, detailed background, vibrant colors, cel shaded, beautiful detailed eyes',
    'professional': 'professional photography, 8k resolution, highly detailed, sharp focus, studio lighting',
    'artistic': 'digital art masterpiece, trending on artstation, intricate details, vibrant colors',
    'realistic': 'photorealistic, RAW photo, DSLR quality, natural lighting, 8k uhd',
    'cinematic': 'cinematic film still, depth of field, dramatic lighting, anamorphic lens'
  };
  
  const improved = `${prompt}, ${improvements[appState.selectedStyle] || improvements.anime}`;
  elements.promptInput.value = improved;
  updateCharCount();
  showNotification('Prompt melhorado!', 'success');
}

function handleStyleSelect(e) {
  if (e.target.classList.contains('style-chip')) {
    document.querySelectorAll('.style-chip').forEach(chip => {
      chip.classList.remove('active');
    });
    e.target.classList.add('active');
    appState.selectedStyle = e.target.dataset.style;
  }
}

function updateStrength(e) {
  appState.strength = e.target.value / 100;
  elements.strengthValue.textContent = `${e.target.value}%`;
}

function updateGenerateButton() {
  const hasImage = appState.currentImage !== null;
  const hasPrompt = elements.promptInput.value.trim().length > 0;
  elements.generateBtn.disabled = !hasImage || !hasPrompt;
}

// ========== GENERATION ==========

async function generateImage() {
  if (!appState.user) {
    showModal('login');
    return;
  }
  
  if (appState.credits < 1) {
    showBuyCredits();
    return;
  }
  
  if (appState.isGenerating) return;
  
  const prompt = elements.promptInput.value.trim();
  if (!prompt || !appState.currentImage) {
    showNotification('Selecione uma imagem e digite um prompt', 'error');
    return;
  }
  
  appState.isGenerating = true;
  elements.generateBtn.disabled = true;
  elements.generateText.textContent = 'Gerando...';
  
  try {
    const data = await api.generateImage(
      appState.currentImage,
      prompt,
      appState.strength,
      appState.selectedStyle
    );
    
    if (data.success) {
      appState.credits = data.data.creditsRemaining;
      elements.creditsCount.textContent = appState.credits;
      appState.currentGeneration = data.data.generationId;
      
      showResultSection();
      pollGenerationStatus(data.data.generationId);
    }
  } catch (error) {
    console.error('Generation error:', error);
    showNotification(error.data?.message || 'Erro ao gerar imagem', 'error');
    elements.generateBtn.disabled = false;
    elements.generateText.textContent = 'Gerar Imagem';
  }
  
  appState.isGenerating = false;
}

function showResultSection() {
  elements.resultOriginal.src = elements.previewImage.src;
  elements.resultSection.classList.remove('hidden');
  elements.statusBadge.textContent = 'Processando...';
  elements.statusBadge.className = 'status-badge processing';
  elements.loadingOverlay.classList.remove('hidden');
  elements.resultActions.classList.add('hidden');
  elements.resultTransformed.classList.add('loading');
  
  elements.resultSection.scrollIntoView({ behavior: 'smooth' });
}

async function pollGenerationStatus(generationId) {
  const pollInterval = setInterval(async () => {
    try {
      const data = await api.getGenerationStatus(generationId);
      const generation = data.data;
      
      if (generation.status === 'completed') {
        clearInterval(pollInterval);
        elements.resultTransformed.src = generation.outputImage;
        elements.resultTransformed.classList.remove('loading');
        elements.loadingOverlay.classList.add('hidden');
        elements.statusBadge.textContent = 'Concluído';
        elements.statusBadge.className = 'status-badge completed';
        elements.resultActions.classList.remove('hidden');
        elements.generateBtn.disabled = false;
        elements.generateText.textContent = 'Gerar Imagem';
        loadHistory();
      } else if (generation.status === 'failed') {
        clearInterval(pollInterval);
        elements.statusBadge.textContent = 'Falhou';
        elements.statusBadge.className = 'status-badge failed';
        elements.loadingOverlay.classList.add('hidden');
        elements.generateBtn.disabled = false;
        elements.generateText.textContent = 'Gerar Imagem';
        showNotification('Falha na geração. Crédito reembolsado.', 'error');
        appState.credits += 1;
        elements.creditsCount.textContent = appState.credits;
      }
    } catch (error) {
      console.error('Poll error:', error);
    }
  }, 3000);
}

// ========== HISTORY ==========

async function loadHistory() {
  if (!appState.user) {
    elements.historyGrid.innerHTML = `
      <div class="history-empty">
        <p>Faça login para ver seu histórico</p>
      </div>
    `;
    return;
  }
  
  try {
    const data = await api.getGenerations();
    if (data.success && data.data.length > 0) {
      renderHistory(data.data);
    } else {
      elements.historyGrid.innerHTML = `
        <div class="history-empty">
          <p>Nenhuma transformação ainda</p>
        </div>
      `;
    }
  } catch (error) {
    console.error('Load history error:', error);
  }
}

function renderHistory(generations) {
  elements.historyGrid.innerHTML = generations.map(gen => `
    <div class="history-item" data-id="${gen.id}">
      <img src="${gen.outputImage || gen.inputImage}" alt="${gen.prompt}" loading="lazy">
      <div class="history-overlay">
        <span class="history-status ${gen.status}">${gen.status}</span>
        <p class="history-prompt">${gen.prompt.substring(0, 50)}...</p>
      </div>
    </div>
  `).join('');
}

// ========== RESULT ACTIONS ==========

function resetForm() {
  removeImage({ stopPropagation: () => {} });
  elements.promptInput.value = '';
  updateCharCount();
  elements.resultSection.classList.add('hidden');
  elements.resultTransformed.src = '';
  elements.resultOriginal.src = '';
  appState.currentGeneration = null;
}

async function downloadImage() {
  if (!elements.resultTransformed.src) return;
  
  try {
    const response = await fetch(elements.resultTransformed.src);
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `morph-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    showNotification('Erro ao baixar imagem', 'error');
  }
}

async function shareImage() {
  if (!elements.resultTransformed.src) return;
  
  if (navigator.share) {
    try {
      await navigator.share({
        title: 'Minha transformação MORPH',
        text: 'Veja o que criei com MORPH AI!',
        url: elements.resultTransformed.src
      });
    } catch (error) {
      console.log('Share cancelled');
    }
  } else {
    // Copiar link para clipboard
    try {
      await navigator.clipboard.writeText(elements.resultTransformed.src);
      showNotification('Link copiado!', 'success');
    } catch (error) {
      showNotification('Erro ao copiar link', 'error');
    }
  }
}

// ========== UI HELPERS ==========

function showModal(type) {
  const modal = document.getElementById(`${type}Modal`);
  if (modal) {
    modal.classList.remove('hidden');
  }
}

function hideModal(type) {
  const modal = document.getElementById(`${type}Modal`);
  if (modal) {
    modal.classList.add('hidden');
  }
}

function showBuyCredits() {
  if (!appState.user) {
    showModal('login');
    return;
  }
  showModal('credits');
}

function showNotification(message, type = 'info') {
  // Criar elemento de notificação
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  
  // Estilos inline para notificação
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 16px 24px;
    border-radius: 12px;
    color: white;
    font-weight: 500;
    z-index: 10000;
    animation: slideIn 0.3s ease;
    background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#7c3aed'};
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Adicionar animações CSS
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

// Expor funções globais
window.logout = logout;
window.showBuyCredits = showBuyCredits;