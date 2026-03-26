const Replicate = require('replicate');

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

const MODELS = {
  primary:   "black-forest-labs/flux-kontext-pro",
  secondary: "black-forest-labs/flux-kontext-max",
};

const DEFAULT_PARAMS = {
  num_inference_steps: 28,
  guidance_scale: 3.5,
  aspect_ratio: "1:1",
  output_format: "webp",   // menor tamanho, carrega mais rápido
  output_quality: 100,      
  go_fast: true,
};

const DEFAULT_STRENGTH = 0.75; // exporta separado pra ser usado no service

module.exports = { replicate, MODELS, DEFAULT_PARAMS, DEFAULT_STRENGTH };
