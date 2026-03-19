const creditService = require('../services/creditService');
const CreditTransaction = require('../models/CreditTransaction');

class CreditController {
  /**
   * Obter saldo atual
   */
  async getBalance(req, res, next) {
    try {
      const balance = await creditService.getBalance(req.user._id);
      
      res.json({
        success: true,
        data: {
          credits: balance.credits,
          totalGenerations: balance.totalGenerations,
          nextTier: this.getNextTier(balance.totalGenerations)
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Histórico de transações
   */
  async getHistory(req, res, next) {
    try {
      const { limit = 20, page = 1 } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);

      const history = await creditService.getTransactionHistory(
        req.user._id,
        parseInt(limit),
        skip
      );

      res.json({
        success: true,
        data: history
      });
    } catch (error) {
      next(error);
    }
    }
    
    getNextTier(generations) {
    const tiers = [
      { name: 'Iniciante', min: 0 },
      { name: 'Entusiasta', min: 10 },
      { name: 'Criador', min: 50 },
      { name: 'Artista', min: 200 },
      { name: 'Mestre', min: 500 }
    ];
    
    const current = tiers.slice().reverse().find(t => generations >= t.min);
    const next = tiers.find(t => t.min > generations);
    
    return {
      current: current?.name || 'Iniciante',
      next: next?.name || 'Mestre',
      progress: next ? generations / next.min : 1
    };
  }
}

module.exports = new CreditController();