/**
 * Sistema de construção de prompts híbrido
 * Combina contexto técnico + input do usuário
 */

const STYLE_TEMPLATES = {
  professional: {
    prefix: "professional photography, 8k resolution, highly detailed, sharp focus, cinematic composition, studio quality lighting",
    suffix: "masterpiece, best quality, ultra detailed",
    negative: "blurry, low quality, distorted, amateur, watermark, text, signature"
  },
  artistic: {
    prefix: "masterpiece, best quality, digital art, trending on artstation, intricate details, art by greg rutkowski and alphonse mucha",
    suffix: "beautiful composition, vibrant colors, stunning artwork",
    negative: "photorealistic, 3d render, ugly, deformed, noisy, blurry"
  },
  realistic: {
    prefix: "photorealistic, RAW photo, DSLR quality, natural lighting, 8k uhd, high detailed skin, film grain",
    suffix: "sharp focus on eyes, professional portrait photography",
    negative: "painting, drawing, illustration, 3d render, cartoon, anime, sketch"
  },
  cinematic: {
    prefix: "cinematic film still, depth of field, dramatic lighting, anamorphic lens, 35mm film, color graded, blockbuster movie style",
    suffix: "epic composition, movie poster quality, atmospheric",
    negative: "amateur, home video, low budget, flat lighting"
  },
  anime: {
    prefix: "masterpiece, best quality, anime style, detailed background, vibrant colors, cel shaded, art by studio ghibli and makoto shinkai",
    suffix: "beautiful detailed eyes, high quality illustration",
    negative: "photorealistic, 3d, western cartoon, live action"
  }
};

const SCENE_ENHANCEMENTS = {
  portrait: "detailed facial features, expressive eyes, natural skin texture",
  landscape: "breathtaking vista, atmospheric perspective, dramatic sky",
  product: "clean background, professional product photography, sharp details",
  architecture: "architectural visualization, clean lines, ambient occlusion",
  food: "appetizing presentation, steam rising, depth of field, professional food photography"
};

class PromptBuilder {
  /**
   * Constrói o prompt final combinando técnica + intenção do usuário
   */
  static build(userPrompt, options = {}) {
    const {
      style = 'professional',
      scene = null,
      strength = 0.75,
      preserveOriginal = true
    } = options;

    const template = STYLE_TEMPLATES[style] || STYLE_TEMPLATES.professional;
    
    // Estrutura: [Contexto Técnico] + [Intenção do Usuário] + [Modificadores de Cena] + [Garantia de Qualidade]
    let finalPrompt = template.prefix;
    
    // Adiciona instrução de preservação se strength for baixo
    if (preserveOriginal && strength < 0.5) {
      finalPrompt += ", maintaining the original composition and subject";
    }
    
    // Prompt do usuário (o mais importante - vem no meio)
    finalPrompt += `. ${userPrompt}`;
    
    // Modificador de cena específico
    if (scene && SCENE_ENHANCEMENTS[scene]) {
      finalPrompt += `, ${SCENE_ENHANCEMENTS[scene]}`;
    }
    
    // Sufixo de qualidade
    finalPrompt += `. ${template.suffix}`;
    
    // Para img2img com strength alto, adicionar instrução de coerência
    if (strength > 0.8) {
      finalPrompt += ", inspired by the reference image composition";
    }

    return {
      prompt: this.cleanPrompt(finalPrompt),
      negativePrompt: template.negative,
      style,
      strength,
      originalPrompt: userPrompt
    };
  }

  /**
   * Limpa e normaliza o prompt
   */
  static cleanPrompt(prompt) {
    return prompt
      .replace(/\s+/g, ' ')           // Remove espaços múltiplos
      .replace(/,\s*,/g, ',')          // Remove vírgulas duplicadas
      .replace(/\.\s*\./g, '.')        // Remove pontos duplicados
      .trim();
  }

  /**
   * Valida se o prompt tem conteúdo suficiente
   */
  static validate(userPrompt) {
    const errors = [];
    
    if (!userPrompt || userPrompt.trim().length === 0) {
      errors.push('Prompt não pode estar vazio');
    }
    
    if (userPrompt.length > 1000) {
      errors.push('Prompt muito longo (máximo 1000 caracteres)');
    }
    
    if (userPrompt.length < 3) {
      errors.push('Prompt muito curto (mínimo 3 caracteres)');
    }
    
    // Verifica conteúdo inapropriado básico
    const blockedWords = ['nsfw', 'nude', 'naked', 'porn', 'sex']; // Adapte conforme necessário
    const hasBlocked = blockedWords.some(word => 
      userPrompt.toLowerCase().includes(word)
    );
    
    if (hasBlocked) {
      errors.push('Prompt contém conteúdo não permitido');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Sugere melhorias para o prompt do usuário
   */
  static suggestImprovements(userPrompt) {
    const suggestions = [];
    
    if (!userPrompt.includes('quality') && !userPrompt.includes('detailed')) {
      suggestions.push('Adicione termos como "highly detailed" ou "8k" para mais qualidade');
    }
    
    if (!userPrompt.includes('lighting')) {
      suggestions.push('Especifique a iluminação (e.g., "natural lighting", "dramatic lighting")');
    }
    
    if (userPrompt.length < 20) {
      suggestions.push('Prompts mais descritivos geram melhores resultados');
    }
    
    return suggestions;
  }
}

module.exports = PromptBuilder;