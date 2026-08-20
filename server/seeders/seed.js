const path = require('path');
try { require('dns').setServers(['8.8.8.8', '1.1.1.1']); } catch (e) {}
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config();
const { sequelize, User, Category, Product, Client, Supplier } = require('../models');

async function seed() {
  try {
    await sequelize.sync({ force: true });
    console.log('✅ Base de datos sincronizada');

    // Create default tenant for seed data
    const { Tenant } = require('../models');
    const defaultTenant = await Tenant.create({
      name: 'Farmacia Semilla',
      slug: 'semilla',
      plan: 'free',
      status: 'active'
    });

    console.log('✅ Organización semilla creada');

    // Create categories
    const categories = await Category.bulkCreate([
      { name: 'Analgésicos', description: 'Medicamentos para el dolor' },
      { name: 'Antibióticos', description: 'Medicamentos contra infecciones bacterianas' },
      { name: 'Antiinflamatorios', description: 'Reducen inflamación y dolor' },
      { name: 'Vitaminas y Suplementos', description: 'Complementos nutricionales' },
      { name: 'Dermatológicos', description: 'Tratamientos para la piel' },
      { name: 'Gastrointestinales', description: 'Medicamentos para problemas digestivos' },
      { name: 'Cardiovasculares', description: 'Medicamentos para el corazón' },
      { name: 'Respiratorios', description: 'Medicamentos para vías respiratorias' },
      { name: 'Oftalmológicos', description: 'Tratamientos para los ojos' },
      { name: 'Material Médico', description: 'Insumos y materiales médicos' }
    ]);

    console.log('✅ Categorías creadas');

    // Create suppliers
    const suppliers = await Supplier.bulkCreate([
      { name: 'Laboratorios Bayer', ruc: '1790001001001', phone: '022567890', email: 'ventas@bayer.com', address: 'Av. Principal 123' },
      { name: 'Pfizer Ecuador', ruc: '1790002002001', phone: '022678901', email: 'ventas@pfizer.com', address: 'Calle Industrial 456' },
      { name: 'GlaxoSmithKline', ruc: '1790003003001', phone: '022789012', email: 'ventas@gsk.com', address: 'Av. Comercial 789' },
      { name: 'Distribuidora Pharma', ruc: '1790004004001', phone: '022890123', email: 'contacto@pharma.com', address: 'Zona Industrial Norte' }
    ]);

    console.log('✅ Proveedores creados');

    // Create products
    const today = new Date();
    const futureDate = (months) => {
      const d = new Date(today);
      d.setMonth(d.getMonth() + months);
      return d;
    };

    await Product.bulkCreate([
      { name: 'Paracetamol 500mg', generic_name: 'Acetaminofén', sanitary_registration: 'RS-2024-001', sanitary_verified: true, category_id: categories[0].id, price: 2.50, cost: 1.20, stock: 150, min_stock: 20, expiration_date: futureDate(12), batch_number: 'LT-001', presentation: 'Caja x 20 tabletas', laboratory: 'Bayer' },
      { name: 'Ibuprofeno 400mg', generic_name: 'Ibuprofeno', sanitary_registration: 'RS-2024-002', sanitary_verified: true, category_id: categories[2].id, price: 3.80, cost: 1.80, stock: 100, min_stock: 15, expiration_date: futureDate(18), batch_number: 'LT-002', presentation: 'Caja x 30 tabletas', laboratory: 'Pfizer' },
      { name: 'Amoxicilina 500mg', generic_name: 'Amoxicilina', sanitary_registration: 'RS-2024-003', sanitary_verified: true, category_id: categories[1].id, price: 8.50, cost: 4.50, stock: 80, min_stock: 10, expiration_date: futureDate(6), batch_number: 'LT-003', presentation: 'Caja x 21 cápsulas', laboratory: 'GlaxoSmithKline' },
      { name: 'Vitamina C 1000mg', generic_name: 'Ácido ascórbico', sanitary_registration: 'RS-2024-004', sanitary_verified: true, category_id: categories[3].id, price: 5.00, cost: 2.50, stock: 200, min_stock: 30, expiration_date: futureDate(24), batch_number: 'LT-004', presentation: 'Frasco x 60 tabletas', laboratory: 'Bayer' },
      { name: 'Omeprazol 20mg', generic_name: 'Omeprazol', sanitary_registration: 'RS-2024-005', sanitary_verified: true, category_id: categories[5].id, price: 6.00, cost: 3.00, stock: 90, min_stock: 15, expiration_date: futureDate(10), batch_number: 'LT-005', presentation: 'Caja x 14 cápsulas', laboratory: 'Pfizer' },
      { name: 'Loratadina 10mg', generic_name: 'Loratadina', sanitary_registration: 'RS-2024-006', sanitary_verified: true, category_id: categories[7].id, price: 4.20, cost: 2.00, stock: 120, min_stock: 20, expiration_date: futureDate(15), batch_number: 'LT-006', presentation: 'Caja x 10 tabletas', laboratory: 'Bayer' },
      { name: 'Metformina 850mg', generic_name: 'Metformina', sanitary_registration: 'RS-2024-007', sanitary_verified: true, category_id: categories[6].id, price: 7.50, cost: 3.80, stock: 8, min_stock: 10, expiration_date: futureDate(8), batch_number: 'LT-007', presentation: 'Caja x 30 tabletas', laboratory: 'GlaxoSmithKline' },
      { name: 'Crema Betametasona', generic_name: 'Betametasona', sanitary_registration: 'RS-2024-008', sanitary_verified: true, category_id: categories[4].id, price: 9.00, cost: 4.50, stock: 45, min_stock: 10, expiration_date: futureDate(20), batch_number: 'LT-008', presentation: 'Tubo x 30g', laboratory: 'Pfizer' },
      { name: 'Gotas Oftálmicas Refresh', generic_name: 'Carboximetilcelulosa', sanitary_registration: 'RS-2024-009', sanitary_verified: true, category_id: categories[8].id, price: 12.00, cost: 6.50, stock: 5, min_stock: 8, expiration_date: futureDate(3), batch_number: 'LT-009', presentation: 'Frasco x 15ml', laboratory: 'Bayer' },
      { name: 'Alcohol Antiséptico 500ml', generic_name: 'Alcohol etílico', sanitary_registration: 'RS-2024-010', sanitary_verified: true, category_id: categories[9].id, price: 3.50, cost: 1.50, stock: 60, min_stock: 15, expiration_date: futureDate(36), batch_number: 'LT-010', presentation: 'Frasco x 500ml', laboratory: 'Distribuidora Pharma' },
      { name: 'Complejo B Inyectable', generic_name: 'Complejo B', sanitary_registration: 'RS-2024-011', sanitary_verified: true, category_id: categories[3].id, price: 4.50, cost: 2.20, stock: 3, min_stock: 10, expiration_date: futureDate(1), batch_number: 'LT-011', presentation: 'Ampolla x 3ml', laboratory: 'GlaxoSmithKline' },
      { name: 'Diclofenaco 75mg', generic_name: 'Diclofenaco sódico', sanitary_registration: 'RS-2024-012', sanitary_verified: true, category_id: categories[2].id, price: 5.50, cost: 2.80, stock: 70, min_stock: 15, expiration_date: futureDate(14), batch_number: 'LT-012', presentation: 'Caja x 10 ampollas', laboratory: 'Pfizer' }
    ]);

    console.log('✅ Productos creados');

    // Create some clients
    await Client.bulkCreate([
      { name: 'Juan Pérez', document_id: '1712345678', phone: '0991234567', email: 'juan@email.com', address: 'Av. Amazonas 123' },
      { name: 'María García', document_id: '1723456789', phone: '0992345678', email: 'maria@email.com', address: 'Calle Sucre 456' },
      { name: 'Consumidor Final', document_id: '9999999999', phone: '', email: '', address: '' }
    ]);

    console.log('✅ Clientes creados');
    console.log('\n🎉 Seed completado exitosamente!');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error en seed:', error);
    process.exit(1);
  }
}

seed();
