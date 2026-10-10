import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import path from 'path';
import { readFile } from 'node:fs/promises';
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
  const site = (process.env.SITE_URL || process.env.VITE_SITE_URL || 'https://mizan-market.onrender.com').replace(/\/$/, '');
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

  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map(({ loc, lastmod }) =>
      '  <url><loc>' + xmlEscape(loc) + '</loc>' +
      (lastmod ? '<lastmod>' + xmlEscape(lastmod) + '</lastmod>' : '') +
      '</url>'
    ).join('\n') +
    '\n</urlset>\n';

  res.status(200)
    .set('Content-Type', 'application/xml; charset=utf-8')
    .set('X-Content-Type-Options', 'nosniff')
    .set('Cache-Control', 'no-cache')
    .send(xml);
});


/* Route-specific metadata in the initial HTML response helps search crawlers
   that inspect HTML before running the React application. */
const publicSeoRoutes = {
  '/': { title: 'MIZAN MARKET — ন্যায্য দামে, সবার জন্য।', description: 'মীযান মার্কেট থেকে বাংলাদেশের প্রয়োজনীয় পণ্য ন্যায্য দামে দেখুন ও অর্ডার করুন।' },
  '/products': { title: 'সব পণ্য — MIZAN MARKET', description: 'মীযান মার্কেটের পণ্যসমূহ দেখুন, দাম তুলনা করুন এবং অনলাইনে অর্ডার করুন।' },
  '/categories': { title: 'পণ্যের ক্যাটাগরি — MIZAN MARKET', description: 'মীযান মার্কেটের বিভিন্ন পণ্যের ক্যাটাগরি ব্রাউজ করুন।' },
  '/about': { title: 'আমাদের সম্পর্কে — MIZAN MARKET', description: 'মীযান মার্কেটের লক্ষ্য, ন্যায্য মূল্য এবং স্বচ্ছ ব্যবসার নীতি সম্পর্কে জানুন।' },
  '/principles': { title: 'আমাদের নীতি — MIZAN MARKET', description: 'সঠিক ওজন, সৎ পণ্যের বিবরণ এবং ন্যায্য লেনদেন নিয়ে মীযান মার্কেটের নীতি।' },
  '/pricing': { title: 'দাম কীভাবে নির্ধারণ করি — MIZAN MARKET', description: 'মীযান মার্কেটে পণ্যের মূল্য নির্ধারণে প্রয়োজনীয় খরচ ও যুক্তিসঙ্গত মার্জিন সম্পর্কে জানুন।' },
  '/delivery': { title: 'ডেলিভারি তথ্য — MIZAN MARKET', description: 'মীযান মার্কেটের ডেলিভারি তথ্য, চার্জ এবং অর্ডার সংক্রান্ত নির্দেশনা দেখুন।' },
  '/faq': { title: 'সাধারণ প্রশ্নোত্তর — MIZAN MARKET', description: 'মীযান মার্কেটে অর্ডার, পেমেন্ট, পণ্য ও ডেলিভারি সম্পর্কে সাধারণ প্রশ্নের উত্তর।' },
  '/contact': { title: 'যোগাযোগ — MIZAN MARKET', description: 'পণ্য বা অর্ডার বিষয়ে সাহায্যের জন্য মীযান মার্কেটের সঙ্গে যোগাযোগ করুন।' },
  '/blog': { title: 'ব্লগ ও কেনাকাটার পরামর্শ — MIZAN MARKET', description: 'অনলাইন কেনাকাটা, পণ্যের বিবরণ ও ন্যায্য মূল্য নিয়ে মীযান মার্কেটের লেখা পড়ুন।' },
  '/policies': { title: 'গোপনীয়তা ও শর্তাবলি — MIZAN MARKET', description: 'মীযান মার্কেটের গোপনীয়তা, ব্যবহারবিধি, রিটার্ন ও অর্ডার-সংক্রান্ত নীতি দেখুন।' }
};
const htmlEscape = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

app.use(async (req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api/') || req.path === '/sitemap.xml' || path.extname(req.path)) return next();
  const route = req.path.replace(/\/$/, '') || '/';
  let meta = publicSeoRoutes[route];
  if (!meta && /^\/product\/[^/]+$/.test(route)) {
    const slug = decodeURIComponent(route.slice('/product/'.length));
    meta = { title: 'পণ্য — MIZAN MARKET', description: 'মীযান মার্কেটের পণ্যের বিবরণ, মূল্য ও অর্ডারের তথ্য দেখুন।' };
    if (url && key) {
      try {
        const sb = clientFor();
        const { data } = await sb.from('products').select('name_bn,short_description,description,available').eq('slug', slug).maybeSingle();
        if (data && data.available !== false) {
          meta = {
            title: `${data.name_bn || 'পণ্য'} — MIZAN MARKET`,
            description: String(data.short_description || data.description || 'মীযান মার্কেটের ন্যায্য দামের পণ্য দেখুন ও অর্ডার করুন।').slice(0, 300)
          };
        }
      } catch (error) {
        console.error('Product SEO metadata lookup failed:', error.message);
      }
    }
  }
  if (!meta) return next();
  try {
    const file = await readFile(path.join(distPath, 'index.html'), 'utf8');
    const canonical = 'https://mizan-market.onrender.com' + route;
    let html = file
      .replace(/<title>[\s\S]*?<\/title>/i, '<title>' + htmlEscape(meta.title) + '</title>')
      .replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/>/i, '<meta name="description" content="' + htmlEscape(meta.description) + '" />')
      .replace(/<meta\s+property="og:title"\s+content="[^"]*"\s*\/>/i, '<meta property="og:title" content="' + htmlEscape(meta.title) + '" />')
      .replace(/<meta\s+property="og:description"\s+content="[^"]*"\s*\/>/i, '<meta property="og:description" content="' + htmlEscape(meta.description) + '" />')
      .replace(/<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/>/i, '<meta name="twitter:title" content="' + htmlEscape(meta.title) + '" />')
      .replace(/<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/>/i, '<meta name="twitter:description" content="' + htmlEscape(meta.description) + '" />')
      .replace(/<link\s+rel="canonical"[^>]*>\s*/i, '');
    const pageSchema = {
      '@context': 'https://schema.org',
      '@type': route === '/' ? 'WebSite' : 'WebPage',
      name: meta.title,
      description: meta.description,
      url: canonical,
      inLanguage: 'bn-BD',
      isPartOf: { '@type': 'WebSite', name: 'MIZAN MARKET', url: 'https://mizan-market.onrender.com/' }
    };
    const schemaTag = '<script type="application/ld+json">' + JSON.stringify(pageSchema).replace(/</g, '\\u003c') + '</script>';
    const fallbackLinks = [
      ['পণ্যসমূহ', '/products'],
      ['ক্যাটাগরি', '/categories'],
      ['আমাদের সম্পর্কে', '/about'],
      ['দাম নির্ধারণের নীতি', '/pricing'],
      ['ডেলিভারি', '/delivery'],
      ['সাধারণ প্রশ্নোত্তর', '/faq'],
      ['যোগাযোগ', '/contact']
    ].map(([label, href]) => '<a href="' + href + '">' + label + '</a>').join(' · ');
    const fallbackContent = '<noscript><main><h1>' + htmlEscape(meta.title) + '</h1><p>' + htmlEscape(meta.description) + '</p><nav aria-label="প্রধান পৃষ্ঠা">' + fallbackLinks + '</nav><p>MIZAN MARKET — ন্যায্য দামে, সবার জন্য।</p></main></noscript>';
    html = html.replace('</head>', schemaTag + '\n<link rel="canonical" href="' + htmlEscape(canonical) + '" />\n  </head>');
    html = html.replace('<div id="root"></div>', fallbackContent + '<div id="root"></div>');
    return res.status(200).type('html').send(html);
  } catch (error) {
    return next(error);
  }
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