const jwt = require('jsonwebtoken');
const { User, Tenant, sequelize } = require('../models');

const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, tenant_id: user.tenant_id },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email y contraseña son requeridos.' });
    }

    const user = await User.findOne({ where: { email } });
    if (!user || !user.active) {
      return res.status(401).json({ message: 'Credenciales inválidas.' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Credenciales inválidas.' });
    }

    const token = generateToken(user);
    res.json({ token, user: user.toJSON() });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Error del servidor.' });
  }
};

exports.register = async (req, res) => {
  let t;
  try {
    t = await sequelize.transaction();
    const { name, email, password, role, tenant_name, tenant_slug } = req.body;

    const existing = await User.findOne({ where: { email } });
    if (existing) {
      await t.rollback();
      return res.status(400).json({ message: 'El email ya está registrado.' });
    }

    let tenantId = req.user ? req.user.tenant_id : null;

    if (tenant_name && tenant_slug) {
      const existingTenant = await Tenant.findOne({ where: { slug: tenant_slug } });
      if (existingTenant) {
        await t.rollback();
        return res.status(400).json({ message: 'El slug de la organización ya está en uso.' });
      }
      const newTenant = await Tenant.create({
        name: tenant_name,
        slug: tenant_slug,
        plan: 'free'
      }, { transaction: t });
      tenantId = newTenant.id;
    }

    if (!tenantId) {
      await t.rollback();
      return res.status(400).json({ message: 'Debe especificar la organización o ser administrador.' });
    }

    const user = await User.create({ 
      name, 
      email, 
      password, 
      role: role || (tenant_name ? 'admin' : 'cajero'),
      tenant_id: tenantId
    }, { transaction: t });
    
    await t.commit();
    res.status(201).json({ message: 'Usuario/Organización creado exitosamente.', user: user.toJSON() });
  } catch (error) {
    if (t && !t.finished) {
      try {
        await t.rollback();
      } catch (rollbackError) {}
    }
    console.error('Register error:', error);
    res.status(500).json({ message: 'Error al crear usuario.' });
  }
};

exports.getProfile = async (req, res) => {
  res.json({ user: req.user.toJSON() });
};

exports.updateProfile = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const user = req.user;

    if (name) user.name = name;
    if (email) user.email = email;
    if (password) user.password = password;

    await user.save();
    res.json({ message: 'Perfil actualizado.', user: user.toJSON() });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Error al actualizar perfil.' });
  }
};

exports.getUsers = async (req, res) => {
  try {
    const users = await User.findAll({ 
      where: { tenant_id: req.user.tenant_id },
      order: [['created_at', 'DESC']] 
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener usuarios.' });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const user = await User.findOne({ where: { id: req.params.id, tenant_id: req.user.tenant_id } });
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado.' });

    const { name, role, password, active } = req.body;
    if (name !== undefined)     user.name   = name;
    if (role !== undefined)     user.role   = role;
    if (active !== undefined)   user.active = active;
    if (password)               user.password = password;

    await user.save();
    res.json({ message: 'Usuario actualizado.', user: user.toJSON() });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ message: 'Error al actualizar usuario.' });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findOne({ where: { id: req.params.id, tenant_id: req.user.tenant_id } });
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado.' });
    if (user.id === req.user.id) return res.status(400).json({ message: 'No puedes eliminarte a ti mismo.' });

    await user.destroy();
    res.json({ message: 'Usuario eliminado.' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: 'Error al eliminar usuario.' });
  }
};
