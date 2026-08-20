const { Op, fn, col } = require('sequelize');
const { Sale, SaleDetail, Product, Client } = require('../models');

exports.dashboard = async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Today's sales
    const todaySales = await Sale.findAll({
      where: {
        tenant_id: tenantId,
        created_at: { [Op.gte]: today, [Op.lt]: tomorrow },
        status: 'completed'
      }
    });
    const todayTotal = todaySales.reduce((sum, s) => sum + parseFloat(s.total), 0);

    // Total products
    const totalProducts = await Product.count({
      where: { tenant_id: tenantId, active: true }
    });

    // Low stock count
    const allProducts = await Product.findAll({
      where: { tenant_id: tenantId, active: true }
    });
    const lowStockCount = allProducts.filter(p => p.stock <= p.min_stock).length;

    // Expiring in 30 days
    const thirtyDays = new Date();
    thirtyDays.setDate(thirtyDays.getDate() + 30);
    const expiringCount = await Product.count({
      where: {
        tenant_id: tenantId,
        active: true,
        expiration_date: { [Op.not]: null, [Op.lte]: thirtyDays }
      }
    });

    // Total clients
    const totalClients = await Client.count({
      where: { tenant_id: tenantId }
    });

    // Sales last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const salesLast7 = await Sale.findAll({
      where: {
        tenant_id: tenantId,
        created_at: { [Op.gte]: sevenDaysAgo },
        status: 'completed'
      },
      attributes: [
        [fn('DATE', col('created_at')), 'date'],
        [fn('SUM', col('total')), 'total'],
        [fn('COUNT', col('id')), 'count']
      ],
      group: [fn('DATE', col('created_at'))],
      order: [[fn('DATE', col('created_at')), 'ASC']],
      raw: true
    });

    // Top 5 products
    const topProducts = await SaleDetail.findAll({
      where: { tenant_id: tenantId },
      attributes: [
        'product_id',
        [fn('SUM', col('quantity')), 'total_sold'],
        [fn('SUM', col('subtotal')), 'total_revenue']
      ],
      include: [{ model: Product, as: 'product', attributes: ['name', 'price'] }],
      group: ['product_id', 'product.id'],
      order: [[fn('SUM', col('quantity')), 'DESC']],
      limit: 5,
      raw: true,
      nest: true
    });

    // Monthly sales
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthSales = await Sale.findAll({
      where: {
        tenant_id: tenantId,
        created_at: { [Op.gte]: firstOfMonth },
        status: 'completed'
      }
    });
    const monthTotal = monthSales.reduce((sum, s) => sum + parseFloat(s.total), 0);

    res.json({
      todaySalesCount: todaySales.length,
      todaySalesTotal: todayTotal,
      monthSalesTotal: monthTotal,
      totalProducts,
      lowStockCount,
      expiringCount,
      totalClients,
      salesLast7Days: salesLast7,
      topProducts
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ message: 'Error al obtener datos del dashboard.' });
  }
};

exports.notifications = async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const allProducts = await Product.findAll({
      where: { tenant_id: tenantId, active: true }
    });
    const lowStock = allProducts.filter(p => p.stock <= p.min_stock);

    const thirtyDays = new Date();
    thirtyDays.setDate(thirtyDays.getDate() + 30);
    const expiring = await Product.findAll({
      where: {
        tenant_id: tenantId,
        active: true,
        expiration_date: { [Op.not]: null, [Op.lte]: thirtyDays }
      }
    });

    const notifications = [];

    lowStock.forEach(p => {
      notifications.push({
        id: `stock-${p.id}`,
        type: 'warning',
        message: `Stock bajo: ${p.name} (Quedan ${p.stock})`,
        date: new Date()
      });
    });

    expiring.forEach(p => {
      notifications.push({
        id: `exp-${p.id}`,
        type: 'danger',
        message: `Por vencer: ${p.name} (${new Date(p.expiration_date).toLocaleDateString('es-ES')})`,
        date: new Date()
      });
    });

    res.json(notifications);
  } catch (error) {
    console.error('Notifications error:', error);
    res.status(500).json({ message: 'Error al obtener notificaciones.' });
  }
};
