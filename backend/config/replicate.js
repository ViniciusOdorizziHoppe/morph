const Replicate = require('replicate');

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

const MODELS = {
  primary: "black-forest-labs/flux-1-dev",
  secondary: "black-forest-labs/flux-1-schnell",
  fallback: "stability-ai/stable-diffusion-xl-base-1.0"
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