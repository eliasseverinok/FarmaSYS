const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Tenant = sequelize.define('Tenant', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(150),
    allowNull: false
  },
  slug: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true
  },
  plan: {
    type: DataTypes.ENUM('free', 'starter', 'professional', 'enterprise'),
    defaultValue: 'free'
  },
  status: {
    type: DataTypes.ENUM('active', 'suspended', 'cancelled'),
    defaultValue: 'active'
  },
  settings: {
    type: DataTypes.JSON,
    defaultValue: {
      currency: 'USD',
      tax_rate: 0.12,
      timezone: 'America/Guayaquil'
    }
  },
  payphone_transaction_id: {
    type: DataTypes.STRING
  },
  payphone_client_id: {
    type: DataTypes.STRING
  }
}, {
  tableName: 'tenants',
  timestamps: true,
  underscored: true
});

module.exports = Tenant;
