const Replicate = require('replicate');

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// MODELOS CORRETOS para img2img no Replicate (aceitam input de imagem)
// flux-1-dev é text-to-image e não aceita 'image' como input → 404
const MODELS = {
  primary: "fofr/flux-dev-img-to-img",        // img2img nativo com Flux Dev
  secondary: "fofr/flux-schnell-img-to-img",  // img2img com Flux Schnell (mais rápido)
  fallback: "stability-ai/sdxl:39ed52f2319f9693e2f464b61baef00c87a37f97b06d7789c9af3ee4f35b37bd" // SDXL img2img clássico
};

const DEFAULT_PARAMS = {
  strength: 0.75,
  num_inference_steps: 28,
  guidance_scale: 3.5,
  aspect_ratio: "1:1",
  output_format: "png",
  output_quality: 100,
  go_fast: false
};

module.exports = { replicate, MODELS, DEFAULT_PARAMS };