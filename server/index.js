import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();

app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json({
  limit: '1mb'
}));

const port = process.env.PORT || 8787;

const url = process.env.SUPABASE_URL;

const key =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY;


/* =========================================
   SUPABASE CLIENT
========================================= */

function clientFor(token = '') {
  if (!url || !key) {
    throw new Error('server_supabase_env_missing');
  }

  return createClient(url, key, {
    global: {
      headers: token
        ? {
            Authorization: `Bearer ${token}`
          }
        : {}
    }
  });
}


/* =========================================
   AUTH TOKEN
========================================= */

function authToken(req) {
  const h = req.headers.authorization || '';

  return h.startsWith('Bearer ')
    ? h.slice(7)
    : '';
}


/* =========================================
   API HEALTH
========================================= */

app.get('/api/health', async (_req, res) => {
  res.json({
    ok: true,
    service: 'MIZAN MARKET API',
    supabaseConfigured: Boolean(url && key),
    time: new Date().toISOString()
  });
});


/* =========================================
   CONTACT FORM
========================================= */

const contactAttempts = new Map();
app.post('/api/contact', async (req, res) => {
  const now = Date.now();
  const forwarded = String(req.headers['x-forwarded-for'] || '');
  const ip = (forwarded.split(',')[0] || req.socket.remoteAddress || 'unknown').trim();
  const previous = contactAttempts.get(ip);
  if (previous && now - previous.startedAt < 15 * 60 * 1000 && previous.count >= 3) {
    return res.status(429).json({ error: 'contact_rate_limited' });
  }
  if (!previous || now - previous.startedAt >= 15 * 60 * 1000) {
    contactAttempts.set(ip, { startedAt: now, count: 1 });
  } else {
    previous.count += 1;
    contactAttempts.set(ip, previous);
  }

  const name = String(req.body?.name || '').trim();
  const phone = String(req.body?.phone || '').trim();
  const email = String(req.body?.email || '').trim();
  const message = String(req.body?.message || '').trim();
  if (name.length < 1 || name.length > 100 || phone.length < 5 || phone.length > 30 ||
      message.length < 10 || message.length > 4000 || email.length > 254) {
    return res.status(400).json({ error: 'invalid_contact_details' });
  }
  try {
    const sb = clientFor();
    const { error } = await sb.from('contact_messages').insert({
      name, phone, email: email || null, message, status: 'new'
    });
    if (error) throw error;
    return res.status(201).json({ ok: true });
  } catch (e) {
    console.error('Contact message save failed:', e.message);
    return res.status(500).json({ error: 'contact_message_save_failed' });
  }
});


/* =========================================
   CHECKOUT QUOTE
========================================= */

app.post('/api/checkout/quote', async (req, res) => {
  try {
    const sb = clientFor(authToken(req));

    const {
      data,
      error
    } = await sb.rpc('quote_cart', {
      p_items: req.body.items || [],
      p_zone_id: req.body.zoneId
    });

    if (error) {
      throw error;
    }

    res.json(data);

  } catch (e) {

    res.status(400).json({
      error: e.message || 'quote_failed'
    });

  }
});


/* =========================================
   CREATE PENDING ORDER
========================================= */

app.post('/api/orders/pending', async (req, res) => {
  try {

    const token = authToken(req);

    if (!token) {
      return res.status(401).json({
        error: 'login_required'
      });
    }

    const sb = clientFor(token);

    const {
      data,
      error
    } = await sb.rpc('create_pending_order', {
      p_items: req.body.items || [],
      p_zone_id: req.body.zoneId,
      p_address: req.body.address || {}
    });

    if (error) {
      throw error;
    }

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


/* =========================================
   REACT FRONTEND
========================================= */

const __filename = fileURLToPath(import.meta.url);

const __dirname = path.dirname(__filename);

const distPath = path.join(
  __dirname,
  '..',
  'dist'
);


/* Dynamic XML sitemap: public pages plus currently available products. */
app.get('/sitemap.xml', async (_req, res) => {
  const site = (process.env.SITE_URL || process.env.VITE_SITE_URL || 'https://mizan-market.onrender.com').replace(/\\/$/, '');
  const pages = ['/', '/products', '/categories', '/about', '/principles', '/pricing', '/delivery', '/faq', '/contact', '/blog', '/policies'];
  const urls = pages.map((route) => ({ loc: site + route }));

  try {
    if (url && key) {
      const sb = clientFor();
      const { data: products, error } = await sb
        .from('products')
        .select('slug,updated_at,created_at')
        .eq('available', true)
        .not('slug', 'is', null)
        .limit(5000);

      if (error) {
        console.error('Sitemap product lookup failed:', error.message);
      } else {
        for (const product of products || []) {
          if (!product.slug) continue;
          const lastmodValue = product.updated_at || product.created_at || null;
          const parsedDate = lastmodValue ? new Date(lastmodValue) : null;
          const lastmod = parsedDate && !Number.isNaN(parsedDate.getTime())
            ? parsedDate.toISOString().slice(0, 10)
            : null;
          urls.push({
            loc: site + '/product/' + encodeURIComponent(product.slug),
            lastmod
          });
        }
      }
    }
  } catch (error) {
    console.error('Sitemap product lookup failed:', error.message);
  }

  const xmlEscape = (value) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

  const xml = '<?xml version="1.0" encoding="UTF-8"?>\\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\\n' +
    urls.map(({ loc, lastmod }) =>
      '  <url><loc>' + xmlEscape(loc) + '</loc>' +
      (lastmod ? '<lastmod>' + xmlEscape(lastmod) + '</lastmod>' : '') +
      '</url>'
    ).join('\\n') +
    '\\n</urlset>\\n';

  res.status(200)
    .set('Content-Type', 'application/xml; charset=utf-8')
    .set('X-Content-Type-Options', 'nosniff')
    .set('Cache-Control', 'no-cache')
    .send(xml);
});

/* Serve React static files */

app.use(express.static(distPath));


/* React SPA fallback */

app.use((req, res, next) => {

  if (req.path.startsWith('/api/')) {
    return next();
  }

  res.sendFile(
    path.join(distPath, 'index.html')
  );

});


/* =========================================
   START SERVER
========================================= */

app.listen(port, () => {

  console.log(
    `MIZAN MARKET API listening on ${port}`
  );

});