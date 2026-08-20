const router = require('express').Router();
const { Supplier } = require('../models');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');
const { Op } = require('sequelize');

router.get('/', auth, async (req, res) => {
  try {
    const { search } = req.query;
    const where = { active: true, tenant_id: req.user.tenant_id };
    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { ruc: { [Op.iLike]: `%${search}%` } }
      ];
    }
    const suppliers = await Supplier.findAll({ where, order: [['name', 'ASC']] });
    res.json(suppliers);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener proveedores.' });
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const supplier = await Supplier.findOne({
      where: { id: req.params.id, tenant_id: req.user.tenant_id }
    });
    if (!supplier) return res.status(404).json({ message: 'Proveedor no encontrado.' });
    res.json(supplier);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener proveedor.' });
  }
});

router.post('/', auth, roleCheck('admin'), async (req, res) => {
  try {
    const supplier = await Supplier.create({
      ...req.body,
      tenant_id: req.user.tenant_id
    });
    res.status(201).json({ message: 'Proveedor creado.', supplier });
  } catch (error) {
    res.status(500).json({ message: 'Error al crear proveedor.' });
  }
});

router.put('/:id', auth, roleCheck('admin'), async (req, res) => {
  try {
    const supplier = await Supplier.findOne({
      where: { id: req.params.id, tenant_id: req.user.tenant_id }
    });
    if (!supplier) return res.status(404).json({ message: 'Proveedor no encontrado.' });
    await supplier.update(req.body);
    res.json({ message: 'Proveedor actualizado.', supplier });
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar proveedor.' });
  }
});

router.delete('/:id', auth, roleCheck('admin'), async (req, res) => {
  try {
    const supplier = await Supplier.findOne({
      where: { id: req.params.id, tenant_id: req.user.tenant_id }
    });
    if (!supplier) return res.status(404).json({ message: 'Proveedor no encontrado.' });
    await supplier.update({ active: false });
    res.json({ message: 'Proveedor eliminado.' });
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar proveedor.' });
  }
});

module.exports = router;
