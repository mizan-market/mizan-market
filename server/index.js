import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));

const port = process.env.PORT || 8787;

const url = process.env.SUPABASE_URL;
const key =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY;

function clientFor(token = '') {
  if (!url || !key) {
    throw new Error('server_supabase_env_missing');
  }

  return createClient(url, key, {
    global: {
      headers: token
        ? { Authorization: `Bearer ${token}` }
        : {}
    }
  });
}

function authToken(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : '';
}

/* =========================
   API ROUTES
========================= */

app.get('/api/health', async (_req, res) => {
  res.json({
    ok: true,
    service: 'MIZAN MARKET API',
    supabaseConfigured: Boolean(url && key),
    time: new Date().toISOString()
  });
});

app.post('/api/checkout/quote', async (req, res) => {
  try {
    const sb = clientFor(authToken(req));

    const { data, error } = await sb.rpc('quote_cart', {
      p_items: req.body.items || [],
      p_zone_id: req.body.zoneId
    });

    if (error) throw error;

    res.json(data);
  } catch (e) {
    res.status(400).json({
      error: e.message || 'quote_failed'
    });
  }
});

app.post('/api/orders/pending', async (req, res) => {
  try {
    const token = authToken(req);

    if (!token) {
      return res.status(401).json({
        error: 'login_required'
      });
    }

    const sb = clientFor(token);

    const { data, error } = await sb.rpc('create_pending_order', {
      p_items: req.body.items || [],
      p_zone_id: req.body.zoneId,
      p_address: req.body.address || {}
    });

    if (error) throw error;

    res.json({
      ok: true,
      order: data
    });
  } catch (e) {
    res.status(400).json({
      error: e.message || 'order_failed'
    });
  }
});

app.post('/api/payments/demo', async (req, res) => {
  try {
    if (process.env.DEMO_PAYMENT_MODE !== 'true') {
      return res.status(403).json({
        error: 'demo_payment_disabled_on_server'
      });
    }

    const token = authToken(req);

    if (!token) {
      return res.status(401).json({
        error: 'login_required'
      });
    }

    const sb = clientFor(token);

    const {
      data: pending,
      error: pe
    } = await sb.rpc('create_pending_order', {
      p_items: req.body.items || [],
      p_zone_id: req.body.zoneId,
      p_address: req.body.address || {}
    });

    if (pe) throw pe;

    const {
      data: confirmed,
      error: ce
    } = await sb.rpc('confirm_demo_payment', {
      p_order_id: pending.id
    });

    if (ce) throw ce;

    res.json({
      ok: true,
      order: {
        ...pending,
        ...confirmed
      }
    });
  } catch (e) {
    res.status(400).json({
      error: e.message || 'demo_payment_failed'
    });
  }
});

/* =========================
   SERVE REACT FRONTEND
========================= */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distPath = path.join(__dirname, '..', 'dist');

app.use(express.static(distPath));

app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

/* =========================
   START SERVER
========================= */

app.listen(port, () => {
  console.log(`MIZAN MARKET API listening on ${port}`);
});