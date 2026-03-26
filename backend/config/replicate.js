const Replicate = require('replicate');
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});
// Modelos oficiais do Replicate para edição/img2img
// flux-kontext-pro: modelo oficial BFL para edição de imagem com prompt
// Aceita input_image + prompt, sem precisar de version hash
const MODELS = {
  primary: "black-forest-labs/flux-kontext-pro",   // $0.04/img, img2img nativo
  secondary: "black-forest-labs/flux-kontext-max", // mais qualidade, fallback
  fallback: "black-forest-labs/flux-kontext-pro"   // reusa primary como fallback
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
