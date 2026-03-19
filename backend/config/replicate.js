const Replicate = require('replicate');

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// Modelos disponíveis com fallbacks
const MODELS = {
  primary: "black-forest-labs/flux-1-dev",      // Melhor qualidade img2img
  secondary: "black-forest-labs/flux-1-schnell", // Mais rápido
  fallback: "stability-ai/stable-diffusion-xl-base-1.0"
};

// Parâmetros otimizados para img2img
const DEFAULT_PARAMS = {
  strength: 0.75,           // 0.1 a 1.0 (quanto maior, mais liberdade o modelo tem)
  num_inference_steps: 28,  // 20-50 (mais passos = mais qualidade)
  guidance_scale: 3.5,      // 1.0 a 10.0 (quanto seguir o prompt)
  aspect_ratio: "1:1",      // 1:1, 16:9, 9:16, 4:3, etc.
  output_format: "png",
  output_quality: 100,
  go_fast: false            // true = mais rápido, false = melhor qualidade
};

module.exports = {
  replicate,
  MODELS,
  DEFAULT_PARAMS
};