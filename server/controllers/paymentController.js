const crypto = require('crypto');
const { Tenant } = require('../models');

// PayPhone API base URL
const PAYPHONE_API_URL = 'https://pay.payphonetodoesposible.com/api/v2';

// Plan prices in cents (USD). Configurable via env vars.
const PLAN_PRICES = {
  professional: parseInt(process.env.PAYPHONE_PRO_PRICE_CENTS) || 4999,   // $49.99
  enterprise:   parseInt(process.env.PAYPHONE_ENTERPRISE_PRICE_CENTS) || 9999  // $99.99
};

// Plan descriptions shown at the checkout
const PLAN_DESCRIPTIONS = {
  professional: 'FarmaSYS - Plan Professional (mensual)',
  enterprise:   'FarmaSYS - Plan Enterprise (mensual)'
};

/**
 * POST /api/payments/create-checkout
 * Creates a PayPhone payment session and returns the checkout URL.
 */
exports.createCheckoutSession = async (req, res) => {
  try {
    const { plan } = req.body;
    const token = process.env.PAYPHONE_TOKEN;

    if (!token) {
      return res.status(500).json({ message: 'PAYPHONE_TOKEN no configurado en variables de entorno.' });
    }

    const amountWithTax = PLAN_PRICES[plan];
    if (!amountWithTax) {
      return res.status(400).json({ message: 'Plan no válido. Use "professional" o "enterprise".' });
    }

    const tenant = await Tenant.findByPk(req.user.tenant_id);
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant no encontrado.' });
    }

    // Generate a unique client transaction ID
    const clientTransactionId = `FARMASYS-${tenant.id}-${plan.toUpperCase()}-${Date.now()}`;

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    const payload = {
      amount: amountWithTax,              // amount in cents
      amountWithTax: amountWithTax,       // same if no additional tax split needed
      amountWithoutTax: 0,
      tax: 0,
      currency: 'USD',
      clientTransactionId,
      responseUrl: `${frontendUrl}/settings?success=true&clientTransactionId=${clientTransactionId}&plan=${plan}`,
      cancellationUrl: `${frontendUrl}/settings?canceled=true`,
      reference: PLAN_DESCRIPTIONS[plan],
      lang: 'es',
      storeId: process.env.PAYPHONE_STORE_ID || null,
      email: req.user.email || null,
    };

    const response = await fetch(`${PAYPHONE_API_URL}/Payment/Prepare`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('PayPhone Prepare error:', data);
      return res.status(500).json({
        message: `Error al iniciar el pago con PayPhone: ${data.message || JSON.stringify(data)}`
      });
    }

    // PayPhone returns payWithCard (URL) and transactionId
    const checkoutUrl = data.payWithCard || data.paymentUrl || data.url;
    if (!checkoutUrl) {
      console.error('PayPhone no devolvió URL de pago:', data);
      return res.status(500).json({ message: 'PayPhone no devolvió una URL de pago válida.' });
    }

    // Store the clientTransactionId for verification later
    await Tenant.update(
      { payphone_client_id: clientTransactionId },
      { where: { id: tenant.id } }
    );

    res.json({ url: checkoutUrl, clientTransactionId });
  } catch (error) {
    console.error('Checkout error:', error);
    res.status(500).json({ message: 'Error interno al procesar el pago.' });
  }
};

/**
 * POST /api/payments/confirm
 * Verifies a PayPhone payment after returning from the checkout.
 * Called by the frontend with { id, clientTransactionId, plan }.
 */
exports.confirmPayment = async (req, res) => {
  try {
    const { id, clientTransactionId, plan } = req.body;
    const token = process.env.PAYPHONE_TOKEN;

    if (!token) {
      return res.status(500).json({ message: 'PAYPHONE_TOKEN no configurado.' });
    }
    if (!id || !clientTransactionId) {
      return res.status(400).json({ message: 'id y clientTransactionId son requeridos.' });
    }

    const response = await fetch(`${PAYPHONE_API_URL}/Payment/Confirm`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ id, clientTransactionId })
    });

    const data = await response.json();
    console.log('PayPhone Confirm response:', data);

    // statusCode 3 = Approved in PayPhone
    const isApproved =
      data.statusCode === 3 ||
      data.transactionStatus === 'Approved' ||
      data.status === 'APPROVED';

    if (!isApproved) {
      return res.status(402).json({
        message: `Pago no aprobado. Estado: ${data.transactionStatus || data.status || data.statusCode}`
      });
    }

    // Find the tenant by their stored clientTransactionId
    const tenant = await Tenant.findOne({
      where: { payphone_client_id: clientTransactionId }
    });

    if (!tenant) {
      return res.status(404).json({ message: 'Tenant no encontrado para esta transacción.' });
    }

    const resolvedPlan = ['professional', 'enterprise'].includes(plan) ? plan : 'professional';

    await Tenant.update({
      plan: resolvedPlan,
      status: 'active',
      payphone_transaction_id: String(id),
    }, { where: { id: tenant.id } });

    res.json({ success: true, plan: resolvedPlan });
  } catch (error) {
    console.error('Confirm payment error:', error);
    res.status(500).json({ message: 'Error interno al confirmar el pago.' });
  }
};

/**
 * POST /api/payments/webhook
 * Handles asynchronous payment notifications from PayPhone.
 */
exports.webhook = async (req, res) => {
  try {
    const token = process.env.PAYPHONE_TOKEN;
    const payload = req.body;

    console.log('PayPhone webhook received:', JSON.stringify(payload));

    // Validate the request using the PayPhone token as a basic check
    const authHeader = req.headers['authorization'] || '';
    if (token && authHeader !== `Bearer ${token}`) {
      return res.status(401).send('Unauthorized');
    }

    const { id, clientTransactionId, transactionStatus, statusCode } = payload;

    const isApproved =
      statusCode === 3 ||
      transactionStatus === 'Approved' ||
      transactionStatus === 'APPROVED';

    if (!isApproved) {
      // Non-approved: cancel/downgrade tenant if needed
      const tenant = await Tenant.findOne({ where: { payphone_client_id: clientTransactionId } });
      if (tenant) {
        await Tenant.update({ plan: 'free', status: 'active' }, { where: { id: tenant.id } });
      }
      return res.status(200).send('OK');
    }

    // Extract plan from clientTransactionId (format: FARMASYS-{tenantId}-{PLAN}-{timestamp})
    let resolvedPlan = 'professional';
    if (clientTransactionId && clientTransactionId.includes('-ENTERPRISE-')) {
      resolvedPlan = 'enterprise';
    }

    const tenant = await Tenant.findOne({ where: { payphone_client_id: clientTransactionId } });
    if (tenant) {
      await Tenant.update({
        plan: resolvedPlan,
        status: 'active',
        payphone_transaction_id: String(id),
      }, { where: { id: tenant.id } });
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(400).send('Webhook Error');
  }
};
