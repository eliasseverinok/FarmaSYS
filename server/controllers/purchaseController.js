const { Op } = require('sequelize');
const { sequelize, Purchase, PurchaseDetail, Product, Supplier, User } = require('../models');

exports.create = async (req, res) => {
  let t;
  try {
    t = await sequelize.transaction();
    const tenantId = req.user.tenant_id;
    const { supplier_id, invoice_number, purchase_date, items } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'Debe incluir al menos un producto.' });
    }

    let total = 0;
    const purchaseItems = [];

    for (const item of items) {
      const product = await Product.findOne({
        where: { id: item.product_id, tenant_id: tenantId },
        transaction: t
      });
      if (!product) {
        await t.rollback();
        return res.status(400).json({ message: `Producto ID ${item.product_id} no encontrado.` });
      }

      const subtotal = item.unit_cost * item.quantity;
      total += subtotal;
      purchaseItems.push({ ...item, subtotal, product });
    }

    const purchase = await Purchase.create({
      supplier_id,
      user_id: req.user.id,
      total,
      invoice_number,
      purchase_date: purchase_date || new Date(),
      tenant_id: tenantId
    }, { transaction: t });

    for (const item of purchaseItems) {
      await PurchaseDetail.create({
        purchase_id: purchase.id,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_cost: item.unit_cost,
        subtotal: item.subtotal,
        tenant_id: tenantId
      }, { transaction: t });

      await item.product.update({
        stock: item.product.stock + item.quantity,
        cost: item.unit_cost
      }, { transaction: t });
    }

    await t.commit();

    const completePurchase = await Purchase.findOne({
      where: { id: purchase.id, tenant_id: tenantId },
      include: [
        { model: PurchaseDetail, as: 'details', include: [{ model: Product, as: 'product' }] },
        { model: Supplier, as: 'supplier' },
        { model: User, as: 'registeredBy', attributes: ['id', 'name'] }
      ]
    });

    res.status(201).json({ message: 'Compra registrada.', purchase: completePurchase });
  } catch (error) {
    if (t && !t.finished) {
      try {
        await t.rollback();
      } catch (rollbackError) {}
    }
    console.error('Create purchase error:', error);
    res.status(500).json({ message: 'Error al registrar compra.' });
  }
};

exports.getAll = async (req, res) => {
  try {
    const { page = 1, limit = 20, start_date, end_date, supplier_id } = req.query;
    const offset = (page - 1) * limit;
    const where = { tenant_id: req.user.tenant_id };

    if (start_date && end_date) {
      where.purchase_date = { [Op.between]: [start_date, end_date] };
    }
    if (supplier_id) where.supplier_id = supplier_id;

    const { count, rows } = await Purchase.findAndCountAll({
      where,
      include: [
        { model: Supplier, as: 'supplier', attributes: ['id', 'name'] },
        { model: User, as: 'registeredBy', attributes: ['id', 'name'] }
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({ purchases: rows, total: count, page: parseInt(page), totalPages: Math.ceil(count / limit) });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener compras.' });
  }
};

exports.getById = async (req, res) => {
  try {
    const purchase = await Purchase.findOne({
      where: { id: req.params.id, tenant_id: req.user.tenant_id },
      include: [
        { model: PurchaseDetail, as: 'details', include: [{ model: Product, as: 'product' }] },
        { model: Supplier, as: 'supplier' },
        { model: User, as: 'registeredBy', attributes: ['id', 'name'] }
      ]
    });
    if (!purchase) return res.status(404).json({ message: 'Compra no encontrada.' });
    res.json(purchase);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener compra.' });
  }
};
