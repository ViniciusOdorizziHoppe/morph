const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const CreditTransaction = require('../models/CreditTransaction');

// Registro com créditos grátis
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    // Verificar se usuário existe
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email já cadastrado' });
    }
    
    // Créditos grátis para novos usuários
    const freeCredits = parseInt(process.env.FREE_CREDITS_ON_REGISTER) || 3;
    
    // Criar usuário com créditos grátis
    const user = new User({ 
      name, 
      email, 
      password,
      credits: freeCredits
    });
    await user.save();
    
    // Registrar transação de bônus
    if (freeCredits > 0) {
      const transaction = new CreditTransaction({
        user: user._id,
        type: 'bonus',
        amount: freeCredits,
        balanceAfter: freeCredits,
        description: 'Créditos grátis de boas-vindas'
      });
      await transaction.save();
    }
    
    // Gerar token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.status(201).json({
      success: true,
      message: 'Usuário criado com sucesso',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        credits: user.credits
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Buscar usuário
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Email ou senha inválidos' });
    }
    
    // Verificar senha
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Email ou senha inválidos' });
    }
    
    // Gerar token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.json({
      success: true,
      message: 'Login realizado com sucesso',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        credits: user.credits
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Verificar token (para validação no frontend)
router.get('/me', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: 'Token não fornecido' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Usuário não encontrado' });
    }
    
    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        credits: user.credits
      }
    });
  } catch (error) {
    res.status(401).json({ success: false, message: 'Token inválido' });
  }
});

module.exports = router;
