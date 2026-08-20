const { Op } = require('sequelize');
const { Receipt, Sale, SaleDetail, Product, Client, User, Tenant } = require('../models');
const PDFDocument = require('pdfkit');

exports.getAll = async (req, res) => {
  try {
    const { page = 1, limit = 20, type, start_date, end_date, search } = req.query;
    const offset = (page - 1) * limit;
    const where = { tenant_id: req.user.tenant_id };

    if (type) where.type = type;
    if (search) where.receipt_number = { [Op.iLike]: `%${search}%` };
    if (start_date && end_date) {
      where.created_at = { [Op.between]: [new Date(start_date), new Date(end_date + 'T23:59:59')] };
    }

    const { count, rows } = await Receipt.findAndCountAll({
      where,
      include: [{
        model: Sale, as: 'sale',
        include: [
          { model: Client, as: 'client', attributes: ['id', 'name', 'document_id'] },
          { model: User, as: 'seller', attributes: ['id', 'name'] }
        ]
      }],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({ receipts: rows, total: count, page: parseInt(page), totalPages: Math.ceil(count / limit) });
  } catch (error) {
    console.error('Get receipts error:', error);
    res.status(500).json({ message: 'Error al obtener comprobantes.' });
  }
};

exports.getById = async (req, res) => {
  try {
    const receipt = await Receipt.findOne({
      where: { id: req.params.id, tenant_id: req.user.tenant_id },
      include: [{
        model: Sale, as: 'sale',
        include: [
          { model: SaleDetail, as: 'details', include: [{ model: Product, as: 'product' }] },
          { model: Client, as: 'client' },
          { model: User, as: 'seller', attributes: ['id', 'name'] }
        ]
      }]
    });

    if (!receipt) return res.status(404).json({ message: 'Comprobante no encontrado.' });
    res.json(receipt);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener comprobante.' });
  }
};

exports.exportPDF = async (req, res) => {
  try {
    const [receipt, tenant] = await Promise.all([
      Receipt.findOne({
        where: { id: req.params.id, tenant_id: req.user.tenant_id },
        include: [{
          model: Sale, as: 'sale',
          include: [
            { model: SaleDetail, as: 'details', include: [{ model: Product, as: 'product' }] },
            { model: Client, as: 'client' },
            { model: User, as: 'seller', attributes: ['id', 'name'] }
          ]
        }]
      }),
      Tenant.findByPk(req.user.tenant_id)
    ]);

    if (!receipt) return res.status(404).json({ message: 'Comprobante no encontrado.' });

    const doc = new PDFDocument({ size: 'A4', margin: 50 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=comprobante_${receipt.receipt_number}.pdf`);
    doc.pipe(res);

    // Header
    const pharmacyName = tenant ? tenant.name : 'Farmasys';
    doc.fontSize(20).font('Helvetica-Bold').text(pharmacyName, { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(14).text(receipt.type === 'factura' ? 'FACTURA' : 'NOTA DE VENTA', { align: 'center' });
    doc.fontSize(12).font('Helvetica').text(`N°: ${receipt.receipt_number}`, { align: 'center' });
    doc.moveDown();

    // Date and client info
    doc.fontSize(10);
    doc.text(`Fecha: ${new Date(receipt.created_at).toLocaleDateString('es-ES')}`);
    doc.text(`Vendedor: ${receipt.sale.seller?.name || 'N/A'}`);
    if (receipt.sale.client) {
      doc.text(`Cliente: ${receipt.sale.client.name}`);
      doc.text(`Documento: ${receipt.sale.client.document_id || 'N/A'}`);
    }
    doc.moveDown();

    // Table header
    doc.font('Helvetica-Bold');
    const tableTop = doc.y;
    doc.text('Producto', 50, tableTop, { width: 200 });
    doc.text('Cant.', 260, tableTop, { width: 50 });
    doc.text('P. Unit.', 320, tableTop, { width: 80 });
    doc.text('Desc.', 400, tableTop, { width: 60 });
    doc.text('Subtotal', 460, tableTop, { width: 80 });
    doc.moveDown();

    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);

    // Items
    doc.font('Helvetica');
    for (const detail of receipt.sale.details) {
      const y = doc.y;
      doc.text(detail.product?.name || 'N/A', 50, y, { width: 200 });
      doc.text(String(detail.quantity), 260, y, { width: 50 });
      doc.text(`$${parseFloat(detail.unit_price).toFixed(2)}`, 320, y, { width: 80 });
      doc.text(`$${parseFloat(detail.discount).toFixed(2)}`, 400, y, { width: 60 });
      doc.text(`$${parseFloat(detail.subtotal).toFixed(2)}`, 460, y, { width: 80 });
      doc.moveDown();
    }

    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown();

    // Totals
    doc.font('Helvetica-Bold');
    doc.text(`Subtotal: $${parseFloat(receipt.subtotal).toFixed(2)}`, { align: 'right' });
    doc.text(`IVA: $${parseFloat(receipt.tax_amount).toFixed(2)}`, { align: 'right' });
    if (parseFloat(receipt.sale.discount) > 0) {
      doc.text(`Descuento: -$${parseFloat(receipt.sale.discount).toFixed(2)}`, { align: 'right' });
    }
    doc.fontSize(14).text(`TOTAL: $${parseFloat(receipt.total).toFixed(2)}`, { align: 'right' });

    doc.end();
  } catch (error) {
    console.error('Export PDF error:', error);
    res.status(500).json({ message: 'Error al exportar PDF.' });
  }
};
