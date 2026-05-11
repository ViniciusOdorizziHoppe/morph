const STYLE_TEMPLATES = {
  professional: {
    prefix: "professional photography, 8k resolution, highly detailed, sharp focus, cinematic composition, studio quality lighting",
    suffix: "masterpiece, best quality, ultra detailed",
    negative: "blurry, low quality, distorted, amateur, watermark, text, signature"
  },
  artistic: {
    prefix: "masterpiece, best quality, digital art, trending on artstation, intricate details",
    suffix: "beautiful composition, vibrant colors, stunning artwork",
    negative: "photorealistic, 3d render, ugly, deformed, noisy, blurry"
  },
  realistic: {
    prefix: "photorealistic, RAW photo, DSLR quality, natural lighting, 8k uhd, high detailed skin",
    suffix: "sharp focus on eyes, professional portrait photography",
    negative: "painting, drawing, illustration, 3d render, cartoon, anime"
  },
  cinematic: {
    prefix: "cinematic film still, depth of field, dramatic lighting, anamorphic lens, 35mm film",
    suffix: "epic composition, movie poster quality, atmospheric",
    negative: "amateur, home video, low budget, flat lighting"
  },
  anime: {
    prefix: "masterpiece, best quality, anime style, detailed background, vibrant colors, cel shaded",
    suffix: "beautiful detailed eyes, high quality illustration",
    negative: "photorealistic, 3d, western cartoon, live action"
  },
  automotive: {
    prefix: "professional car dealership photography, 8k resolution, studio lighting with soft reflections, neutral grey background, showroom quality, automotive magazine, sharp focus, clean reflections, commercial car listing",
    suffix: "pristine condition appearance, professional vehicle listing, commercial automotive photography",
    negative: "blurry, amateur, phone photo, driveway, street, messy, people, watermark, text, low quality, dark, underexposed, cluttered background, garage, home, reflection of photographer"
  },
  background_remove: {
    prefix: "remove background entirely, isolate the subject on pure white studio background, commercial product photography, clean white seamless background, no surroundings, no environment, no floor texture, pure white background",
    suffix: "isolated on white, product photography, catalog ready",
    negative: "shadow on background, grey background, outdoor, context, environment, room, garage, street, gradient background, floor visible"
  }
};

class PromptBuilder {
  static build(userPrompt, options = {}) {
    const { style = 'professional', strength = 0.75 } = options;
    const template = STYLE_TEMPLATES[style] || STYLE_TEMPLATES.professional;
    
    let finalPrompt = template.prefix;
    
    if (strength < 0.5) {
      finalPrompt += ", maintaining the original composition and subject";
    }
    
    finalPrompt += `. ${userPrompt}`;
    finalPrompt += `. ${template.suffix}`;
    
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
  
  static cleanPrompt(prompt) {
    return prompt
      .replace(/\s+/g, ' ')
      .replace(/,\s*,/g, ',')
      .replace(/\.\s*\./g, '.')
      .trim();
  }
  
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
    
    const blockedWords = ['nsfw', 'nude', 'naked', 'porn', 'sex'];
    const hasBlocked = blockedWords.some(word =>
      userPrompt.toLowerCase().includes(word)
    );
    
    if (hasBlocked) {
      errors.push('Prompt contém conteúdo não permitido');
    }
    
    return { isValid: errors.length === 0, errors };
  }
}

module.exports = PromptBuilder;
