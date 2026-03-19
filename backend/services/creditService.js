const User = require('../models/User');
const CreditTransaction = require('../models/CreditTransaction');
const logger = require('../utils/logger');

class CreditService {
  /**
   * Usar crédito para geração
   */
  async useCreditForGeneration(userId, generationId) {
    const session = await User.startSession();
    session.startTransaction();

    try {
      const user = await User.findById(userId).session(session);
      
      if (!user) {
        throw new Error('Usuário não encontrado');
      }

      if (user.credits < 1) {
        throw new Error('Créditos insuficientes');
      }

      // Decrementar crédito
      user.credits -= 1;
      user.totalGenerations += 1;
      await user.save({ session });

      // Registrar transação
      const transaction = new CreditTransaction({
        user: userId,
        type: 'usage',
        amount: -1,
        balanceAfter: user.credits,
        description: 'Uso em geração de imagem',
        generation: generationId
      });
      await transaction.save({ session });

      await session.commitTransaction();
      
      logger.info(`Credit used for user ${userId}, remaining: ${user.credits}`);
      
      return {
        success: true,
        remainingCredits: user.credits
      };

    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Adicionar créditos (após pagamento)
   */
  async addCredits(userId, amount, paymentData = {}) {
    const session = await User.startSession();
    session.startTransaction();

    try {
      const user = await User.findById(userId).session(session);
      
      if (!user) {
        throw new Error('Usuário não encontrado');
      }

      const previousBalance = user.credits;
      user.credits += amount;
      await user.save({ session });

      const transaction = new CreditTransaction({
        user: userId,
        type: 'purchase',
        amount: amount,
        balanceAfter: user.credits,
        description: `Compra de ${amount} créditos`,
        paymentId: paymentData.paymentId,
        paymentProvider: paymentData.provider
      });
      await transaction.save({ session });

      await session.commitTransaction();

      logger.info(`Credits added for user ${userId}: +${amount}, new balance: ${user.credits}`);

      return {
        success: true,
        previousBalance,
        newBalance: user.credits,
        added: amount
      };

    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Verificar saldo
   */
  async getBalance(userId) {
    const user = await User.findById(userId).select('credits totalGenerations');
    if (!user) throw new Error('Usuário não encontrado');
    
    return {
      credits: user.credits,
      totalGenerations: user.totalGenerations
    };
  }

  /**
   * Histórico de transações
   */
  async getTransactionHistory(userId, limit = 20, skip = 0) {
    const transactions = await CreditTransaction.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .populate('generation', 'status outputImage.url');

    const total = await CreditTransaction.countDocuments({ user: userId });

    return {
      transactions,
      pagination: {
        total,
        limit,
        skip,
        hasMore: skip + limit < total
      }
    };
  }

  /**
   * Reembolsar crédito (para gerações falhas)
   */
  async refundCredit(userId, generationId, reason = 'Geração falhou') {
    const session = await User.startSession();
    session.startTransaction();

    try {
      const user = await User.findById(userId).session(session);
      
      user.credits += 1;
      await user.save({ session });

      const transaction = new CreditTransaction({
        user: userId,
        type: 'refund',
        amount: 1,
        balanceAfter: user.credits,
        description: `Reembolso: ${reason}`,
        generation: generationId
      });
      await transaction.save({ session });

      await session.commitTransaction();

      logger.info(`Credit refunded for user ${userId}, generation ${generationId}`);

      return {
        success: true,
        newBalance: user.credits
      };

    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }
}

module.exports = new CreditService();