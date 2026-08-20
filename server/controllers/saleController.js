const { Op } = require('sequelize');
const { sequelize, Sale, SaleDetail, Product, Client, User, Payment, Receipt } = require('../models');

exports.create = async (req, res) => {
  let t;
  try {
    t = await sequelize.transaction();
    const { client_id, items, discount = 0, payment_method = 'cash', amount_paid = 0, receipt_type = 'nota_venta', tax_rate } = req.body;
    const taxRate = tax_rate !== undefined ? parseFloat(tax_rate) : (parseFloat(process.env.TAX_RATE) || 0.12);

    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'Debe incluir al menos un producto.' });
    }

    let subtotal = 0;
    const saleItems = [];

    for (const item of items) {
      const product = await Product.findOne({
        where: { id: item.product_id, tenant_id: req.user.tenant_id },
        transaction: t
      });
      if (!product) {
        await t.rollback();
        return res.status(400).json({ message: `Producto ID ${item.product_id} no encontrado.` });
      }
      if (product.stock < item.quantity) {
        await t.rollback();
        return res.status(400).json({ message: `Stock insuficiente para "${product.name}". Disponible: ${product.stock}` });
      }

      const itemDiscount = item.discount || 0;
      const itemSubtotal = (product.price * item.quantity) - itemDiscount;
      subtotal += itemSubtotal;

      saleItems.push({
        product_id: product.id,
        quantity: item.quantity,
        unit_price: product.price,
        discount: itemDiscount,
        subtotal: itemSubtotal,
        product
      });
    }

    const tax = (subtotal - discount) * taxRate;
    const total = subtotal - discount + tax;

    const sale = await Sale.create({
      user_id: req.user.id,
      client_id: client_id || null,
      subtotal,
      tax,
      discount,
      total,
      status: 'completed',
      tenant_id: req.user.tenant_id
    }, { transaction: t });

    for (const item of saleItems) {
      await SaleDetail.create({
        sale_id: sale.id,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount: item.discount,
        subtotal: item.subtotal,
        tenant_id: req.user.tenant_id
      }, { transaction: t });

      await item.product.update(
        { stock: item.product.stock - item.quantity },
        { transaction: t }
      );
    }

    const changeAmount = payment_method === 'cash' ? Math.max(0, amount_paid - total) : 0;
    await Payment.create({
      sale_id: sale.id,
      method: payment_method,
      amount: amount_paid || total,
      change_amount: changeAmount,
      reference: req.body.payment_reference || null,
      tenant_id: req.user.tenant_id
    }, { transaction: t });

    const lastReceipt = await Receipt.findOne({
      where: { type: receipt_type, tenant_id: req.user.tenant_id },
      order: [['id', 'DESC']],
      transaction: t
    });

    const nextNumber = lastReceipt
      ? String(parseInt(lastReceipt.receipt_number.split('-')[1] || '0') + 1).padStart(8, '0')
      : '00000001';

    const prefix = receipt_type === 'factura' ? 'FAC' : 'NV';
    const receiptNumber = `${prefix}-${nextNumber}`;

    await Receipt.create({
      sale_id: sale.id,
      receipt_number: receiptNumber,
      type: receipt_type,
      subtotal,
      tax_amount: tax,
      total,
      tenant_id: req.user.tenant_id
    }, { transaction: t });

    await t.commit();

    const completeSale = await Sale.findOne({
      where: { id: sale.id, tenant_id: req.user.tenant_id },
      include: [
        { model: SaleDetail, as: 'details', include: [{ model: Product, as: 'product' }] },
        { model: Client, as: 'client' },
        { model: User, as: 'seller', attributes: ['id', 'name'] },
        { model: Payment, as: 'payments' },
        { model: Receipt, as: 'receipt' }
      ]
    });

    res.status(201).json({ message: 'Venta registrada exitosamente.', sale: completeSale });
  } catch (error) {
    if (t && !t.finished) {
      try {
        await t.rollback();
      } catch (rollbackError) {}
    }
    console.error('Create sale error:', error);
    res.status(500).json({ message: 'Error al registrar venta.' });
  }
};

exports.getAll = async (req, res) => {
  try {
    const { page = 1, limit = 20, start_date, end_date, status, user_id } = req.query;
    const offset = (page - 1) * limit;
    const where = { tenant_id: req.user.tenant_id };

    if (start_date && end_date) {
      where.created_at = { [Op.between]: [new Date(start_date), new Date(end_date + 'T23:59:59')] };
    }
    if (status) where.status = status;
    if (user_id) where.user_id = user_id;

    const { count, rows } = await Sale.findAndCountAll({
      where,
      include: [
        { model: Client, as: 'client', attributes: ['id', 'name', 'document_id'] },
        { model: User, as: 'seller', attributes: ['id', 'name'] },
        { model: Receipt, as: 'receipt', attributes: ['receipt_number', 'type'] },
        { model: Payment, as: 'payments' }
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      sales: rows,
      total: count,
      page: parseInt(page),
      totalPages: Math.ceil(count / limit)
    });
  } catch (error) {
    console.error('Get sales error:', error);
    res.status(500).json({ message: 'Error al obtener ventas.' });
  }
};

exports.getById = async (req, res) => {
  try {
    const sale = await Sale.findOne({
      where: { id: req.params.id, tenant_id: req.user.tenant_id },
      include: [
        { model: SaleDetail, as: 'details', include: [{ model: Product, as: 'product' }] },
        { model: Client, as: 'client' },
        { model: User, as: 'seller', attributes: ['id', 'name'] },
        { model: Payment, as: 'payments' },
        { model: Receipt, as: 'receipt' }
      ]
    });
    if (!sale) return res.status(404).json({ message: 'Venta no encontrada.' });
    res.json(sale);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener venta.' });
  }
};

exports.getBySeller = async (req, res) => {
  try {
    const { id } = req.params;
    const { start_date, end_date } = req.query;
    const where = { user_id: id, tenant_id: req.user.tenant_id };

    if (start_date && end_date) {
      where.created_at = { [Op.between]: [new Date(start_date), new Date(end_date + 'T23:59:59')] };
    }

    const sales = await Sale.findAll({
      where,
      include: [
        { model: Client, as: 'client', attributes: ['id', 'name'] },
        { model: User, as: 'seller', attributes: ['id', 'name'] },
        { model: Receipt, as: 'receipt' }
      ],
      order: [['created_at', 'DESC']]
    });

    const totalAmount = sales.reduce((sum, s) => sum + parseFloat(s.total), 0);
    res.json({ sales, totalAmount, count: sales.length });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener historial por vendedor.' });
  }
};

exports.returnSale = async (req, res) => {
  let t;
  try {
    t = await sequelize.transaction();
    const sale = await Sale.findOne({
      where: { id: req.params.id, tenant_id: req.user.tenant_id },
      include: [{ model: SaleDetail, as: 'details', include: [{ model: Product, as: 'product' }] }],
      transaction: t
    });

    if (!sale) {
      await t.rollback();
      return res.status(404).json({ message: 'Venta no encontrada.' });
    }

    if (sale.status === 'returned') {
      await t.rollback();
      return res.status(400).json({ message: 'La venta ya fue devuelta.' });
    }

    for (const detail of sale.details) {
      await detail.product.update(
        { stock: detail.product.stock + detail.quantity },
        { transaction: t }
      );
    }

    await sale.update({ status: 'returned' }, { transaction: t });
    await t.commit();

    res.json({ message: 'Devolución procesada exitosamente.', sale });
  } catch (error) {
    if (t && !t.finished) {
      try {
        await t.rollback();
      } catch (rollbackError) {}
    }
    console.error('Return sale error:', error);
    res.status(500).json({ message: 'Error al procesar devolución.' });
  }
};
