const { CashRegister, Sale, Payment, User } = require('../models');
const { Op } = require('sequelize');

exports.open = async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const existing = await CashRegister.findOne({
      where: { user_id: req.user.id, status: 'open', tenant_id: tenantId }
    });

    if (existing) {
      return res.status(400).json({ message: 'Ya tiene una caja abierta.' });
    }

    const { opening_amount = 0 } = req.body;
    const register = await CashRegister.create({
      user_id: req.user.id,
      opening_amount,
      opened_at: new Date(),
      tenant_id: tenantId
    });

    res.status(201).json({ message: 'Caja abierta exitosamente.', register });
  } catch (error) {
    console.error('Open register error:', error);
    res.status(500).json({ message: 'Error al abrir caja.' });
  }
};

exports.close = async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const register = await CashRegister.findOne({
      where: { user_id: req.user.id, status: 'open', tenant_id: tenantId }
    });

    if (!register) {
      return res.status(400).json({ message: 'No tiene una caja abierta.' });
    }

    const sales = await Sale.findAll({
      where: {
        user_id: req.user.id,
        status: 'completed',
        created_at: { [Op.gte]: register.opened_at },
        tenant_id: tenantId
      },
      include: [{ model: Payment, as: 'payments' }]
    });

    let totalSales = 0, totalCash = 0, totalCard = 0, totalTransfer = 0;

    for (const sale of sales) {
      totalSales += parseFloat(sale.total);
      for (const payment of sale.payments) {
        const amount = parseFloat(payment.amount) - parseFloat(payment.change_amount);
        switch (payment.method) {
          case 'cash': totalCash += amount; break;
          case 'card': totalCard += amount; break;
          case 'transfer': totalTransfer += amount; break;
          case 'mixed': totalCash += amount * 0.5; totalCard += amount * 0.5; break;
        }
      }
    }

    const closingAmount = parseFloat(register.opening_amount) + totalCash;

    await register.update({
      status: 'closed',
      closing_amount: closingAmount,
      total_sales: totalSales,
      total_cash: totalCash,
      total_card: totalCard,
      total_transfer: totalTransfer,
      closed_at: new Date()
    });

    res.json({ message: 'Caja cerrada exitosamente.', register });
  } catch (error) {
    console.error('Close register error:', error);
    res.status(500).json({ message: 'Error al cerrar caja.' });
  }
};

exports.getCurrent = async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const register = await CashRegister.findOne({
      where: { user_id: req.user.id, status: 'open', tenant_id: tenantId },
      include: [{ model: User, as: 'user', attributes: ['id', 'name'] }]
    });

    res.json(register);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener estado de caja.' });
  }
};

exports.getHistory = async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const where = { tenant_id: tenantId };
    if (req.user.role === 'cajero') {
      where.user_id = req.user.id;
    }

    const registers = await CashRegister.findAll({
      where,
      include: [{ model: User, as: 'user', attributes: ['id', 'name'] }],
      order: [['opened_at', 'DESC']],
      limit: 50
    });
    res.json(registers);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener historial de caja.' });
  }
};
