// Configuração da API
const API_CONFIG = {
    BASE_URL: 'https://transformacao.koyeb.app', // Altere para seu URL do Koyeb
    // BASE_URL: 'http://localhost:3001', // Desenvolvimento local
};

// Cliente HTTP
class ApiClient {
    constructor() {
        this.baseURL = API_CONFIG.BASE_URL;
        this.token = localStorage.getItem('morph_token');
    }

    // Obter headers padrão
    getHeaders() {
        const headers = {
            'Content-Type': 'application/json',
        };

        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        return headers;
    }

    // Fazer requisição
    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        
        const config = {
            ...options,
            headers: {
                ...this.getHeaders(),
                ...options.headers,
            },
        };

        // Remover Content-Type se for FormData
        if (options.body instanceof FormData) {
            delete config.headers['Content-Type'];
        }

        try {
            const response = await fetch(url, config);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || `Erro ${response.status}`);
            }

            return data;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }

    // Autenticação
    async login(email, password) {
        const data = await this.request('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        });
        
        if (data.token) {
            this.token = data.token;
            localStorage.setItem('morph_token', data.token);
        }
        
        return data;
    }

    async register(name, email, password) {
        const data = await this.request('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify({ name, email, password }),
        });
        
        if (data.token) {
            this.token = data.token;
            localStorage.setItem('morph_token', data.token);
        }
        
        return data;
    }

    logout() {
        this.token = null;
        localStorage.removeItem('morph_token');
    }

    // Créditos
    async getCredits() {
        return this.request('/api/credits/balance');
    }

    // Imagens - NOVAS ROTAS
    async generateImage(imageFile, prompt, strength, style, aspectRatio = '1:1') {
        const formData = new FormData();
        formData.append('image', imageFile);
        formData.append('prompt', prompt);
        formData.append('strength', (strength / 100).toString()); // Converter 75 -> 0.75
        formData.append('style', style);
        formData.append('aspectRatio', aspectRatio);

        return this.request('/api/images/generate', {
            method: 'POST',
            body: formData,
        });
    }

    async getGenerationStatus(generationId) {
        return this.request(`/api/images/generations/${generationId}`);
    }

    async getHistory(page = 1, limit = 20) {
        return this.request(`/api/images/generations?page=${page}&limit=${limit}`);
    }

    // Preview de prompt (opcional)
    async previewPrompt(prompt, style, strength) {
        return this.request('/api/images/preview-prompt', {
            method: 'POST',
            body: JSON.stringify({ prompt, style, strength }),
        });
    }
}

// Instância global
const api = new ApiClient();