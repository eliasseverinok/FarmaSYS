const { Op, fn, col } = require('sequelize');
const { Sale, SaleDetail, Product, Category, Purchase, PurchaseDetail, Supplier, User, Client } = require('../models');

exports.salesReport = async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const { start_date, end_date } = req.query;
    const where = { status: 'completed', tenant_id: tenantId };

    if (start_date && end_date) {
      where.created_at = { [Op.between]: [new Date(start_date), new Date(end_date + 'T23:59:59')] };
    }

    const sales = await Sale.findAll({
      where,
      include: [
        { model: User, as: 'seller', attributes: ['id', 'name'] },
        { model: Client, as: 'client', attributes: ['id', 'name'] },
        { model: SaleDetail, as: 'details', include: [{ model: Product, as: 'product', attributes: ['name'] }] }
      ],
      order: [['created_at', 'DESC']]
    });

    const totalRevenue = sales.reduce((sum, s) => sum + parseFloat(s.total), 0);
    const totalTax = sales.reduce((sum, s) => sum + parseFloat(s.tax), 0);
    const totalDiscount = sales.reduce((sum, s) => sum + parseFloat(s.discount), 0);

    res.json({
      sales,
      summary: {
        totalSales: sales.length,
        totalRevenue,
        totalTax,
        totalDiscount,
        averageTicket: sales.length > 0 ? totalRevenue / sales.length : 0
      }
    });
  } catch (error) {
    console.error('Sales report error:', error);
    res.status(500).json({ message: 'Error al generar reporte de ventas.' });
  }
};

exports.inventoryReport = async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const products = await Product.findAll({
      where: { active: true, tenant_id: tenantId },
      include: [{ model: Category, as: 'category', attributes: ['name'] }],
      order: [['name', 'ASC']]
    });

    const totalProducts = products.length;
    const totalValue = products.reduce((sum, p) => sum + (parseFloat(p.cost) * p.stock), 0);
    const totalSaleValue = products.reduce((sum, p) => sum + (parseFloat(p.price) * p.stock), 0);
    const lowStock = products.filter(p => p.stock <= p.min_stock);
    const outOfStock = products.filter(p => p.stock === 0);

    res.json({
      products,
      summary: {
        totalProducts,
        totalValue,
        totalSaleValue,
        potentialProfit: totalSaleValue - totalValue,
        lowStockCount: lowStock.length,
        outOfStockCount: outOfStock.length
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Error al generar reporte de inventario.' });
  }
};

exports.expiringReport = async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const { days = 90 } = req.query;
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + parseInt(days));

    const products = await Product.findAll({
      where: {
        active: true,
        tenant_id: tenantId,
        expiration_date: { [Op.not]: null, [Op.lte]: futureDate }
      },
      include: [{ model: Category, as: 'category', attributes: ['name'] }],
      order: [['expiration_date', 'ASC']]
    });

    const today = new Date();
    const expired = products.filter(p => new Date(p.expiration_date) < today);
    const expiringSoon = products.filter(p => {
      const exp = new Date(p.expiration_date);
      return exp >= today && exp <= futureDate;
    });

    res.json({
      products,
      summary: {
        totalExpiring: products.length,
        expiredCount: expired.length,
        expiringSoonCount: expiringSoon.length,
        totalValueAtRisk: products.reduce((sum, p) => sum + (parseFloat(p.cost) * p.stock), 0)
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Error al generar reporte de vencimientos.' });
  }
};

exports.topProductsReport = async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const { start_date, end_date, limit = 20 } = req.query;
    const where = { tenant_id: tenantId };

    if (start_date && end_date) {
      where.created_at = { [Op.between]: [new Date(start_date), new Date(end_date + 'T23:59:59')] };
    }

    const topProducts = await SaleDetail.findAll({
      where: { tenant_id: tenantId },
      attributes: [
        'product_id',
        [fn('SUM', col('quantity')), 'total_sold'],
        [fn('SUM', col('SaleDetail.subtotal')), 'total_revenue']
      ],
      include: [
        { model: Product, as: 'product', attributes: ['name', 'price', 'stock'] },
        {
          model: Sale, as: 'sale',
          attributes: [],
          where: { status: 'completed', ...where }
        }
      ],
      group: ['product_id', 'product.id'],
      order: [[fn('SUM', col('quantity')), 'DESC']],
      limit: parseInt(limit),
      raw: true,
      nest: true
    });

    res.json({ topProducts });
  } catch (error) {
    console.error('Top products report error:', error);
    res.status(500).json({ message: 'Error al generar reporte de productos más vendidos.' });
  }
};

exports.purchasesReport = async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const { start_date, end_date } = req.query;
    const where = { tenant_id: tenantId };

    if (start_date && end_date) {
      where.purchase_date = { [Op.between]: [start_date, end_date] };
    }

    const purchases = await Purchase.findAll({
      where,
      include: [
        { model: Supplier, as: 'supplier', attributes: ['id', 'name'] },
        { model: User, as: 'registeredBy', attributes: ['id', 'name'] },
        { model: PurchaseDetail, as: 'details', include: [{ model: Product, as: 'product', attributes: ['name'] }] }
      ],
      order: [['purchase_date', 'DESC']]
    });

    const totalSpent = purchases.reduce((sum, p) => sum + parseFloat(p.total), 0);

    res.json({
      purchases,
      summary: {
        totalPurchases: purchases.length,
        totalSpent,
        averagePurchase: purchases.length > 0 ? totalSpent / purchases.length : 0
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Error al generar reporte de compras.' });
  }
};
