const { Client } = require('../models');
const { Op } = require('sequelize');

exports.getAll = async (req, res) => {
  try {
    const { search } = req.query;
    const where = { tenant_id: req.user.tenant_id };

    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { document_id: { [Op.iLike]: `%${search}%` } },
        { phone: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const clients = await Client.findAll({ where, order: [['name', 'ASC']] });
    res.json(clients);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener clientes.' });
  }
};

exports.getById = async (req, res) => {
  try {
    const client = await Client.findOne({
      where: { id: req.params.id, tenant_id: req.user.tenant_id }
    });
    if (!client) return res.status(404).json({ message: 'Cliente no encontrado.' });
    res.json(client);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener cliente.' });
  }
};

exports.create = async (req, res) => {
  try {
    const { name, document_id, phone, email, address } = req.body;
    if (document_id) {
      const existing = await Client.findOne({
        where: { document_id, tenant_id: req.user.tenant_id }
      });
      if (existing) return res.status(400).json({ message: 'Ya existe un cliente con ese documento en tu organización.' });
    }

    const client = await Client.create({
      name, document_id, phone, email, address,
      tenant_id: req.user.tenant_id
    });
    res.status(201).json({ message: 'Cliente creado.', client });
  } catch (error) {
    res.status(500).json({ message: 'Error al crear cliente.' });
  }
};

exports.update = async (req, res) => {
  try {
    const client = await Client.findOne({
      where: { id: req.params.id, tenant_id: req.user.tenant_id }
    });
    if (!client) return res.status(404).json({ message: 'Cliente no encontrado.' });

    await client.update(req.body);
    res.json({ message: 'Cliente actualizado.', client });
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar cliente.' });
  }
};

exports.delete = async (req, res) => {
  try {
    const client = await Client.findOne({
      where: { id: req.params.id, tenant_id: req.user.tenant_id }
    });
    if (!client) return res.status(404).json({ message: 'Cliente no encontrado.' });

    await client.destroy();
    res.json({ message: 'Cliente eliminado.' });
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar cliente.' });
  }
};
