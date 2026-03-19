// Configuração da API
const API_CONFIG = {
    BASE_URL: 'https://transformacao.koyeb.app', // Seu backend Koyeb
    // BASE_URL: 'http://localhost:3001', // Desenvolvimento local
};

// Cliente HTTP
class ApiClient {
    constructor() {
        this.baseURL = API_CONFIG.BASE_URL;
        this.token = localStorage.getItem('morph_token');
    }

    getHeaders() {
        const headers = {
            'Content-Type': 'application/json',
        };

        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        return headers;
    }

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
            
            // Verificar se é JSON
            const contentType = response.headers.get('content-type');
            let data;
            
            if (contentType && contentType.includes('application/json')) {
                data = await response.json();
            } else {
                const text = await response.text();
                throw new Error(text || `Erro ${response.status}`);
            }

            if (!response.ok) {
                throw new Error(data.message || `Erro ${response.status}`);
            }

            return data;
        } catch (error) {
            console.error('API Error:', error);
            
            // Melhorar mensagem de erro para CORS
            if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                throw new Error('Erro de conexão com o servidor. Verifique se o backend está online.');
            }
            
            throw error;
        }
    }

    // ✅ AUTENTICAÇÃO
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

    async verifyToken() {
        return this.request('/api/auth/me');
    }

    logout() {
        this.token = null;
        localStorage.removeItem('morph_token');
    }

    // Créditos
    async getCredits() {
        return this.request('/api/credits/balance');
    }

    // Imagens
    async generateImage(imageFile, prompt, strength, style, aspectRatio = '1:1') {
        const formData = new FormData();
        formData.append('image', imageFile);
        formData.append('prompt', prompt);
        formData.append('strength', (strength / 100).toString());
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

    async previewPrompt(prompt, style, strength) {
        return this.request('/api/images/preview-prompt', {
            method: 'POST',
            body: JSON.stringify({ prompt, style, strength }),
        });
    }
}

// Instância global
const api = new ApiClient();