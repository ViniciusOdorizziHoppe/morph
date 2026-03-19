// Gerenciamento de estado da UI
const UI = {
    elements: {
        // Upload
        uploadArea: document.getElementById('uploadArea'),
        imageInput: document.getElementById('imageInput'),
        uploadPlaceholder: document.getElementById('uploadPlaceholder'),
        previewImage: document.getElementById('previewImage'),
        removeImage: document.getElementById('removeImage'),
        
        // Controles
        promptInput: document.getElementById('promptInput'),
        charCount: document.getElementById('charCount'),
        strengthSlider: document.getElementById('strengthSlider'),
        strengthValue: document.getElementById('strengthValue'),
        generateBtn: document.getElementById('generateBtn'),
        
        // Resultado
        resultSection: document.getElementById('resultSection'),
        resultOriginal: document.getElementById('resultOriginal'),
        resultTransformed: document.getElementById('resultTransformed'),
        loadingOverlay: document.getElementById('loadingOverlay'),
        loadingText: document.getElementById('loadingText'),
        statusBadge: document.getElementById('statusBadge'),
        resultActions: document.getElementById('resultActions'),
        
        // Auth
        authSection: document.getElementById('authSection'),
        userSection: document.getElementById('userSection'),
        creditsCount: document.getElementById('creditsCount'),
        
        // Modals
        loginModal: document.getElementById('loginModal'),
        registerModal: document.getElementById('registerModal'),
        creditsModal: document.getElementById('creditsModal'),
        
        // History
        historyGrid: document.getElementById('historyGrid'),
    },

    state: {
        currentImage: null,
        currentStyle: 'anime',
        isGenerating: false,
        pollingInterval: null,
    },

    init() {
        this.bindEvents();
        this.checkAuth();
        this.updateCharCount();
    },

    bindEvents() {
        const { elements } = this;

        // Upload
        elements.uploadArea.addEventListener('click', () => elements.imageInput.click());
        elements.uploadArea.addEventListener('dragover', this.handleDragOver.bind(this));
        elements.uploadArea.addEventListener('dragleave', this.handleDragLeave.bind(this));
        elements.uploadArea.addEventListener('drop', this.handleDrop.bind(this));
        elements.imageInput.addEventListener('change', this.handleFileSelect.bind(this));

        // Prompt
        elements.promptInput.addEventListener('input', this.updateCharCount.bind(this));

        // Drag and drop visual
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            elements.uploadArea.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });
    },

    // Upload handlers
    handleDragOver(e) {
        this.elements.uploadArea.classList.add('dragover');
    },

    handleDragLeave(e) {
        this.elements.uploadArea.classList.remove('dragover');
    },

    handleDrop(e) {
        this.elements.uploadArea.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length) this.handleFile(files[0]);
    },

    handleFileSelect(e) {
        const files = e.target.files;
        if (files.length) this.handleFile(files[0]);
    },

    handleFile(file) {
        if (!file.type.startsWith('image/')) {
            alert('Por favor, selecione uma imagem válida (JPG, PNG ou WebP)');
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            alert('Imagem muito grande. Máximo 10MB.');
            return;
        }

        this.state.currentImage = file;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            this.elements.previewImage.src = e.target.result;
            this.elements.previewImage.classList.remove('hidden');
            this.elements.uploadPlaceholder.classList.add('hidden');
            this.elements.removeImage.classList.remove('hidden');
            this.updateGenerateButton();
        };
        reader.readAsDataURL(file);
    },

    removeImage() {
        this.state.currentImage = null;
        this.elements.imageInput.value = '';
        this.elements.previewImage.src = '';
        this.elements.previewImage.classList.add('hidden');
        this.elements.uploadPlaceholder.classList.remove('hidden');
        this.elements.removeImage.classList.add('hidden');
        this.updateGenerateButton();
    },

    // Controles
    updateStrength(value) {
        this.elements.strengthValue.textContent = `${value}%`;
    },

    updateCharCount() {
        const length = this.elements.promptInput.value.length;
        this.elements.charCount.textContent = `${length}/1000`;
        
        if (length > 1000) {
            this.elements.charCount.style.color = 'var(--error)';
        } else {
            this.elements.charCount.style.color = 'var(--text-secondary)';
        }
        
        this.updateGenerateButton();
    },

    selectStyle(element) {
        document.querySelectorAll('.style-chip').forEach(chip => {
            chip.classList.remove('active');
        });
        element.classList.add('active');
        this.state.currentStyle = element.dataset.style;
    },

    updateGenerateButton() {
        const hasImage = !!this.state.currentImage;
        const hasPrompt = this.elements.promptInput.value.trim().length > 0;
        const hasAuth = !!api.token;
        
        this.elements.generateBtn.disabled = !hasImage || !hasPrompt || !hasAuth || this.state.isGenerating;
        
        if (!hasAuth) {
            this.elements.generateBtn.querySelector('#generateText').textContent = 'Faça login para gerar';
        } else if (this.state.isGenerating) {
            this.elements.generateBtn.querySelector('#generateText').textContent = 'Gerando...';
        } else {
            this.elements.generateBtn.querySelector('#generateText').textContent = 'Gerar Imagem';
        }
    },

    // Resultados
    showResult(originalUrl, transformedUrl = null, status = 'processing') {
        this.elements.resultSection.classList.remove('hidden');
        this.elements.resultOriginal.src = originalUrl;
        
        if (transformedUrl) {
            this.elements.resultTransformed.src = transformedUrl;
            this.elements.resultTransformed.classList.remove('loading');
            this.elements.loadingOverlay.classList.add('hidden');
            this.elements.statusBadge.textContent = 'Concluído';
            this.elements.statusBadge.classList.add('completed');
            this.elements.resultActions.classList.remove('hidden');
        } else {
            this.elements.resultTransformed.classList.add('loading');
            this.elements.loadingOverlay.classList.remove('hidden');
            this.elements.statusBadge.textContent = 'Processando...';
            this.elements.statusBadge.classList.remove('completed', 'failed');
            this.elements.resultActions.classList.add('hidden');
        }
        
        this.elements.resultSection.scrollIntoView({ behavior: 'smooth' });
    },

    updateResult(transformedUrl, status) {
        if (status === 'completed') {
            this.elements.resultTransformed.src = transformedUrl;
            this.elements.resultTransformed.classList.remove('loading');
            this.elements.loadingOverlay.classList.add('hidden');
            this.elements.statusBadge.textContent = 'Concluído';
            this.elements.statusBadge.classList.add('completed');
            this.elements.resultActions.classList.remove('hidden');
            this.state.isGenerating = false;
            this.updateGenerateButton();
            this.loadHistory(); // Recarregar histórico
        } else if (status === 'failed') {
            this.elements.statusBadge.textContent = 'Falhou';
            this.elements.statusBadge.classList.add('failed');
            this.elements.loadingText.textContent = 'Erro na geração';
            this.state.isGenerating = false;
            this.updateGenerateButton();
        }
    },

    // Auth UI
    async checkAuth() {
        if (api.token) {
            try {
                const credits = await api.getCredits();
                this.showUserUI(credits.data.credits);
            } catch (error) {
                api.logout();
                this.showAuthUI();
            }
        } else {
            this.showAuthUI();
        }
    },

    showAuthUI() {
        this.elements.authSection.classList.remove('hidden');
        this.elements.userSection.classList.add('hidden');
        this.updateGenerateButton();
    },

    showUserUI(credits) {
        this.elements.authSection.classList.add('hidden');
        this.elements.userSection.classList.remove('hidden');
        this.elements.creditsCount.textContent = credits;
        this.updateGenerateButton();
        this.loadHistory();
    },

    updateCredits(credits) {
        this.elements.creditsCount.textContent = credits;
    },

    // Modals
    showModal(modalName) {
        closeModals();
        const modal = this.elements[`${modalName}Modal`];
        if (modal) modal.classList.remove('hidden');
    },

    // Histórico
    async loadHistory() {
        try {
            const response = await api.getHistory();
            const generations = response.data?.generations || [];
            
            if (generations.length === 0) {
                this.elements.historyGrid.innerHTML = `
                    <div class="history-empty">
                        <p>Nenhuma transformação ainda</p>
                    </div>
                `;
                return;
            }

            this.elements.historyGrid.innerHTML = generations.map(gen => `
                <div class="history-item" onclick="viewGeneration('${gen.id}')">
                    <img src="${gen.outputImage || gen.inputImage}" alt="${gen.prompt}">
                </div>
            `).join('');
        } catch (error) {
            console.error('Erro ao carregar histórico:', error);
        }
    },
};

// Inicializar quando DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => UI.init());