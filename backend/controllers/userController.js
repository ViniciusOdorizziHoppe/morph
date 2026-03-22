const User = require('../models/User');
const Generation = require('../models/Generation');
const logger = require('../utils/logger');

class UserController {
  // Obter perfil do usuário
  async getProfile(req, res, next) {
    try {
      const user = await User.findById(req.user._id).select('-password');
      if (!user) {
        return res.status(404).json({ success: false, message: 'Usuário não encontrado' });
      }
      
      res.json({
        success: true,
        data: {
          id: user._id,
          name: user.name,
          email: user.email,
          credits: user.credits,
          totalGenerations: user.totalGenerations,
          role: user.role,
          preferences: user.preferences,
          createdAt: user.createdAt
        }
      });
    } catch (error) {
      logger.error('Get profile error:', error);
      next(error);
    }
  }
  
  // Atualizar perfil do usuário
  async updateProfile(req, res, next) {
    try {
      const { name, preferences } = req.body;
      const updateData = {};
      
      if (name) updateData.name = name;
      if (preferences) {
        updateData.preferences = {
          ...req.user.preferences,
          ...preferences
        };
      }
      
      const user = await User.findByIdAndUpdate(
        req.user._id,
        updateData,
        { new: true, runValidators: true }
      ).select('-password');
      
      res.json({
        success: true,
        message: 'Perfil atualizado com sucesso',
        data: {
          id: user._id,
          name: user.name,
          email: user.email,
          preferences: user.preferences
        }
      });
    } catch (error) {
      logger.error('Update profile error:', error);
      next(error);
    }
  }
  
  // Obter estatísticas do usuário
  async getStats(req, res, next) {
    try {
      const userId = req.user._id;
      
      // Estatísticas de gerações
      const totalGenerations = await Generation.countDocuments({ user: userId });
      const completedGenerations = await Generation.countDocuments({ 
        user: userId, 
        status: 'completed' 
      });
      const failedGenerations = await Generation.countDocuments({ 
        user: userId, 
        status: 'failed' 
      });
      
      // Gerações recentes
      const recentGenerations = await Generation.find({ user: userId })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('status createdAt outputImage.url');
      
      res.json({
        success: true,
        data: {
          totalGenerations,
          completedGenerations,
          failedGenerations,
          successRate: totalGenerations > 0 
            ? Math.round((completedGenerations / totalGenerations) * 100) 
            : 0,
          recentGenerations
        }
      });
    } catch (error) {
      logger.error('Get stats error:', error);
      next(error);
    }
  }
}

module.exports = new UserController();
