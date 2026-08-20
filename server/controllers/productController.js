const { Op } = require('sequelize');
const { Product, Category } = require('../models');

exports.getAll = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, category_id, low_stock, expiring } = req.query;
    const offset = (page - 1) * limit;

    const where = { active: true, tenant_id: req.user.tenant_id };

    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { generic_name: { [Op.iLike]: `%${search}%` } },
        { laboratory: { [Op.iLike]: `%${search}%` } },
        { batch_number: { [Op.iLike]: `%${search}%` } }
      ];
    }

    if (category_id) where.category_id = category_id;

    if (low_stock === 'true') {
      where.stock = { [Op.lte]: sequelize.col('min_stock') };
    }

    if (expiring === 'true') {
      const thirtyDays = new Date();
      thirtyDays.setDate(thirtyDays.getDate() + 30);
      where.expiration_date = { [Op.lte]: thirtyDays, [Op.gte]: new Date() };
    }

    const { count, rows } = await Product.findAndCountAll({
      where,
      include: [{ model: Category, as: 'category', attributes: ['id', 'name'] }],
      order: [['name', 'ASC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      products: rows,
      total: count,
      page: parseInt(page),
      totalPages: Math.ceil(count / limit)
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ message: 'Error al obtener productos.' });
  }
};

exports.getById = async (req, res) => {
  try {
    const product = await Product.findOne({
      where: { id: req.params.id, tenant_id: req.user.tenant_id },
      include: [{ model: Category, as: 'category' }]
    });
    if (!product) return res.status(404).json({ message: 'Producto no encontrado.' });
    res.json(product);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener producto.' });
  }
};

exports.create = async (req, res) => {
  try {
    const {
      name, generic_name, sanitary_registration, category_id,
      price, cost, stock, min_stock, expiration_date,
      batch_number, presentation, laboratory
    } = req.body;

    let sanitary_verified = false;
    if (sanitary_registration && sanitary_registration.trim().length >= 5) {
      sanitary_verified = true;
    }

    const product = await Product.create({
      name, generic_name, sanitary_registration, sanitary_verified,
      category_id, price, cost, stock, min_stock,
      expiration_date, batch_number, presentation, laboratory,
      tenant_id: req.user.tenant_id
    });

    const created = await Product.findOne({
      where: { id: product.id, tenant_id: req.user.tenant_id },
      include: [{ model: Category, as: 'category' }]
    });

    res.status(201).json({ message: 'Medicamento registrado exitosamente.', product: created });
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ message: 'Error al registrar medicamento.' });
  }
};

exports.update = async (req, res) => {
  try {
    const product = await Product.findOne({
      where: { id: req.params.id, tenant_id: req.user.tenant_id }
    });
    if (!product) return res.status(404).json({ message: 'Producto no encontrado.' });

    const updates = req.body;
    if (updates.sanitary_registration) {
      updates.sanitary_verified = updates.sanitary_registration.trim().length >= 5;
    }

    await product.update(updates);

    const updated = await Product.findOne({
      where: { id: product.id, tenant_id: req.user.tenant_id },
      include: [{ model: Category, as: 'category' }]
    });

    res.json({ message: 'Producto actualizado.', product: updated });
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ message: 'Error al actualizar producto.' });
  }
};

exports.delete = async (req, res) => {
  try {
    const product = await Product.findOne({
      where: { id: req.params.id, tenant_id: req.user.tenant_id }
    });
    if (!product) return res.status(404).json({ message: 'Producto no encontrado.' });

    await product.update({ active: false });
    res.json({ message: 'Producto eliminado.' });
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar producto.' });
  }
};

exports.getLowStock = async (req, res) => {
  try {
    const products = await Product.findAll({
      where: {
        active: true,
        tenant_id: req.user.tenant_id,
        stock: { [Op.gt]: 0 }
      },
      include: [{ model: Category, as: 'category' }],
      order: [['stock', 'ASC']]
    });

    const lowStock = products.filter(p => p.stock <= p.min_stock);
    res.json(lowStock);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener alertas de stock.' });
  }
};

exports.getExpiring = async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + parseInt(days));

    const products = await Product.findAll({
      where: {
        active: true,
        tenant_id: req.user.tenant_id,
        expiration_date: {
          [Op.not]: null,
          [Op.lte]: futureDate
        }
      },
      include: [{ model: Category, as: 'category' }],
      order: [['expiration_date', 'ASC']]
    });

    res.json(products);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener productos por vencer.' });
  }
};

exports.search = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json([]);

    const products = await Product.findAll({
      where: {
        active: true,
        tenant_id: req.user.tenant_id,
        stock: { [Op.gt]: 0 },
        [Op.or]: [
          { name: { [Op.iLike]: `%${q}%` } },
          { generic_name: { [Op.iLike]: `%${q}%` } },
          { batch_number: { [Op.iLike]: `%${q}%` } }
        ]
      },
      include: [{ model: Category, as: 'category', attributes: ['id', 'name'] }],
      limit: 10,
      order: [['name', 'ASC']]
    });

    res.json(products);
  } catch (error) {
    res.status(500).json({ message: 'Error en la búsqueda.' });
  }
};
