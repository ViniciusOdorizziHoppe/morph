/**
 * MORPH API Client
 * Configuração de URLs e funções de comunicação com o backend
 */

// Configuração das URLs - usar variável de ambiente ou fallback
const API_CONFIG = {
  // URL do backend - configure através de variável de ambiente no Vercel
  // ou altere diretamente aqui para testes locais
  BASE_URL: window.location.hostname === 'localhost' 
    ? 'http://localhost:3001'
    : (window.env?.REACT_APP_API_URL || 'https://realistic-viper-morph-82184336.koyeb.app'),
  
  // Timeout para requisições
  TIMEOUT: 60000,
  
  // Headers padrão
  HEADERS: {
    'Content-Type': 'application/json'
  }
};

// Classe para gerenciar requisições API
class MorphAPI {
  constructor() {
    this.baseURL = API_CONFIG.BASE_URL;
    this.token = localStorage.getItem('morph_token');
  }
  
  // Atualizar token
  setToken(token) {
    this.token = token;
    if (token) {
      localStorage.setItem('morph_token', token);
    } else {
      localStorage.removeItem('morph_token');
    }
  }
  
  // Obter headers com autenticação
  getHeaders(includeAuth = true) {
    const headers = { ...API_CONFIG.HEADERS };
    if (includeAuth && this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }
  
  // Requisição GET
  async get(endpoint, requiresAuth = true) {
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      method: 'GET',
      headers: this.getHeaders(requiresAuth),
      credentials: 'include'
    });
    return this.handleResponse(response);
  }
  
  // Requisição POST
  async post(endpoint, data, requiresAuth = true) {
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      method: 'POST',
      headers: this.getHeaders(requiresAuth),
      credentials: 'include',
      body: JSON.stringify(data)
    });
    return this.handleResponse(response);
  }
  
  // Requisição POST com FormData (para upload de arquivos)
  async postFormData(endpoint, formData, requiresAuth = true) {
    const headers = {};
    if (requiresAuth && this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: formData
    });
    return this.handleResponse(response);
  }
  
  // Tratar resposta
  async handleResponse(response) {
    const data = await response.json();
    
    if (!response.ok) {
      const error = new Error(data.message || 'Erro na requisição');
      error.status = response.status;
      error.data = data;
      throw error;
    }
    
    return data;
  }
  
  // ========== AUTH ==========
  
  async login(email, password) {
    const data = await this.post('/api/auth/login', { email, password }, false);
    if (data.token) {
      this.setToken(data.token);
    }
    return data;
  }
  
  async register(name, email, password) {
    const data = await this.post('/api/auth/register', { name, email, password }, false);
    if (data.token) {
      this.setToken(data.token);
    }
    return data;
  }
  
  async getMe() {
    return this.get('/api/auth/me');
  }
  
  logout() {
    this.setToken(null);
  }
  
  // ========== IMAGES ==========
  
  async generateImage(file, prompt, strength, style, aspectRatio = '1:1') {
    const formData = new FormData();
    formData.append('image', file);
    formData.append('prompt', prompt);
    formData.append('strength', strength);
    formData.append('style', style);
    formData.append('aspectRatio', aspectRatio);
    
    return this.postFormData('/api/images/generate', formData);
  }
  
  async getGenerations() {
    return this.get('/api/images/generations');
  }
  
  async getGenerationStatus(generationId) {
    return this.get(`/api/images/generations/${generationId}`);
  }
  
  // ========== CREDITS ==========
  
  async getCredits() {
    return this.get('/api/credits/balance');
  }
  
  // ========== USER ==========
  
  async getProfile() {
    return this.get('/api/users/profile');
  }
  
  async updateProfile(data) {
    return this.post('/api/users/profile', data);
  }
  
  async getStats() {
    return this.get('/api/users/stats');
  }
}

// Instância global da API
const api = new MorphAPI();

// Exportar para uso global
window.MorphAPI = MorphAPI;
window.api = api;
window.API_CONFIG = API_CONFIG;
