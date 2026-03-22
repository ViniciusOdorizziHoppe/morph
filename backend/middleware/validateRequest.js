const { validationResult } = require('express-validator');

/**
 * Middleware para validar requisições usando express-validator
 */
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Erro de validação',
      errors: errors.array().map(error => ({
        field: error.path || error.param,
        message: error.msg,
        value: error.value
      }))
    });
  }
  
  next();
};

/**
 * Middleware para verificar se o usuário tem créditos suficientes
 */
const checkCredits = async (req, res, next) => {
  try {
    const user = req.user;
    
    if (user.credits < 1) {
      return res.status(403).json({
        success: false,
        message: 'Créditos insuficientes',
        code: 'INSUFFICIENT_CREDITS',
        currentCredits: user.credits
      });
    }
    
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware para verificar se o usuário é admin
 */
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Acesso restrito a administradores'
    });
  }
  next();
};

module.exports = {
  validateRequest,
  checkCredits,
  requireAdmin
};
