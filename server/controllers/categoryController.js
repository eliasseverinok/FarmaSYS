const { Category } = require('../models');

exports.getAll = async (req, res) => {
  try {
    const categories = await Category.findAll({
      where: { active: true, tenant_id: req.user.tenant_id },
      order: [['name', 'ASC']]
    });
    res.json(categories);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener categorías.' });
  }
};

exports.getById = async (req, res) => {
  try {
    const category = await Category.findOne({
      where: { id: req.params.id, tenant_id: req.user.tenant_id }
    });
    if (!category) return res.status(404).json({ message: 'Categoría no encontrada.' });
    res.json(category);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener categoría.' });
  }
};

exports.create = async (req, res) => {
  try {
    const { name, description } = req.body;
    const existing = await Category.findOne({
      where: { name, tenant_id: req.user.tenant_id }
    });
    if (existing) return res.status(400).json({ message: 'La categoría ya existe.' });

    const category = await Category.create({
      name,
      description,
      tenant_id: req.user.tenant_id
    });
    res.status(201).json({ message: 'Categoría creada.', category });
  } catch (error) {
    res.status(500).json({ message: 'Error al crear categoría.' });
  }
};

exports.update = async (req, res) => {
  try {
    const category = await Category.findOne({
      where: { id: req.params.id, tenant_id: req.user.tenant_id }
    });
    if (!category) return res.status(404).json({ message: 'Categoría no encontrada.' });

    await category.update(req.body);
    res.json({ message: 'Categoría actualizada.', category });
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar categoría.' });
  }
};

exports.delete = async (req, res) => {
  try {
    const category = await Category.findOne({
      where: { id: req.params.id, tenant_id: req.user.tenant_id }
    });
    if (!category) return res.status(404).json({ message: 'Categoría no encontrada.' });

    await category.update({ active: false });
    res.json({ message: 'Categoría eliminada.' });
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar categoría.' });
  }
};
