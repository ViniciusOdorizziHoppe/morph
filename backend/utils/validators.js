const { body, validationResult } = require('express-validator');

const validateGenerationRequest = [
  body('prompt')
    .trim()
    .isLength({ min: 3, max: 1000 })
    .withMessage('Prompt deve ter entre 3 e 1000 caracteres'),
  body('strength')
    .optional()
    .isFloat({ min: 0.1, max: 1.0 })
    .withMessage('Strength deve estar entre 0.1 e 1.0'),
  body('style')
    .optional()
    .isIn(['professional', 'artistic', 'realistic', 'cinematic', 'anime'])
    .withMessage('Estilo inválido')
];

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array().map(e => ({
        field: e.param,
        message: e.msg
      }))
    });
  }
  next();
};

module.exports = { validateGenerationRequest, handleValidationErrors };
