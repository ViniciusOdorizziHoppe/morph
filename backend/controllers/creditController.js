const creditService = require('../services/creditService');

class CreditController {
  async getBalance(req, res, next) {
    try {
      const balance = await creditService.getBalance(req.user._id);
      res.json({ success: true, data: balance });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new CreditController();