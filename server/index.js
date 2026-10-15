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

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;

const key =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY;


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
  const pages = ['/', '/products', '/categories', '/about', '/principles', '/pricing', '/delivery', '/faq', '/contact', '/blog', '/blog/online-bazar-price-check', '/blog/mashkalai-dal-kumro-bori-storage', '/blog/mustard-oil-buying-guide', '/policies'];
  const urls = pages.map((route) => ({ loc: site + route }));

  try {
    if (url && key) {
      const sb = clientFor();
      const { data: products, error } = await sb
        .from('products')
        .select('slug,updated_at,created_at')
        .eq('available', true)
        .eq('is_active', true)
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
  '/': { title: 'MIZAN MARKET — বাংলাদেশের ন্যায্য দামের অনলাইন বাজার', description: 'চালের গুঁড়া, মাসকালাই ডাল, কুমড়ো বড়ি, সরিষার তেল, হলুদ ও মরিচের গুঁড়া—পণ্যের দাম ও বিবরণ দেখে অনলাইনে অর্ডার করুন।' },
  '/products': { title: 'সব পণ্য — চাল, ডাল, তেল ও মসলা | MIZAN MARKET', description: 'চালের গুঁড়া, মাসকালাই ডাল, কুমড়ো বড়ি, সরিষার তেল, হলুদ, মরিচের গুঁড়া ও অন্যান্য পণ্যের বর্তমান দাম, বিবরণ ও স্টক দেখে অর্ডার করুন।' },
  '/categories': { title: 'পণ্যের ক্যাটাগরি — চাল, ডাল, তেল ও মসলা | MIZAN MARKET', description: 'চাল ও ডাল, মসলা, তেল এবং দেশি খাবারের পণ্য ক্যাটাগরি ধরে দেখুন। প্রতিটি পণ্যের দাম, পরিমাণ, বিবরণ ও স্টক যাচাই করে অনলাইনে অর্ডার করুন।' },
  '/about': { title: 'আমাদের সম্পর্কে — MIZAN MARKET', description: 'মীযান মার্কেটের লক্ষ্য, ন্যায্য মূল্য এবং স্বচ্ছ ব্যবসার নীতি সম্পর্কে জানুন।' },
  '/principles': { title: 'আমাদের নীতি — MIZAN MARKET', description: 'সঠিক ওজন, সৎ পণ্যের বিবরণ এবং ন্যায্য লেনদেন নিয়ে মীযান মার্কেটের নীতি।' },
  '/pricing': { title: 'দাম কীভাবে নির্ধারণ করি — MIZAN MARKET', description: 'মীযান মার্কেটে পণ্যের মূল্য নির্ধারণে প্রয়োজনীয় খরচ ও যুক্তিসঙ্গত মার্জিন সম্পর্কে জানুন।' },
  '/delivery': { title: 'ডেলিভারি তথ্য — MIZAN MARKET', description: 'মীযান মার্কেটের ডেলিভারি তথ্য, চার্জ এবং অর্ডার সংক্রান্ত নির্দেশনা দেখুন।' },
  '/faq': { title: 'সাধারণ প্রশ্নোত্তর — MIZAN MARKET', description: 'মীযান মার্কেটে অর্ডার, পেমেন্ট, পণ্য ও ডেলিভারি সম্পর্কে সাধারণ প্রশ্নের উত্তর।' },
  '/contact': { title: 'যোগাযোগ — MIZAN MARKET', description: 'পণ্য বা অর্ডার বিষয়ে সাহায্যের জন্য মীযান মার্কেটের সঙ্গে যোগাযোগ করুন।' },
  '/blog': { title: 'ব্লগ ও কেনাকাটার পরামর্শ — MIZAN MARKET', description: 'অনলাইন কেনাকাটা, পণ্যের বিবরণ ও ন্যায্য মূল্য নিয়ে মীযান মার্কেটের লেখা পড়ুন।' },
  '/blog/online-bazar-price-check': { title: 'অনলাইনে বাজার করার আগে দাম, ওজন ও ডেলিভারি যাচাই — MIZAN MARKET', description: 'পণ্যের একক মূল্য, প্যাকেটের পরিমাণ, স্টক ও ডেলিভারি চার্জ মিলিয়ে অনলাইনে কেনাকাটার সহজ চেকলিস্ট।' },
  '/blog/mashkalai-dal-kumro-bori-storage': { title: 'মাসকালাই ডাল ও কুমড়ো বড়ি সংরক্ষণের নিয়ম — MIZAN MARKET', description: 'শুকনো খাবার আর্দ্রতা থেকে দূরে রাখা, পাত্র বাছাই এবং প্যাকেট খোলার পর কী খেয়াল করবেন।' },
  '/blog/mustard-oil-buying-guide': { title: 'সরিষার তেল কেনার আগে যা দেখবেন — MIZAN MARKET', description: 'বোতলের পরিমাণ, সিল, লেবেল, সংরক্ষণ ও অনলাইনে অর্ডারের সময় তথ্য যাচাইয়ের পরামর্শ।' },
  '/policies': { title: 'গোপনীয়তা ও শর্তাবলি — MIZAN MARKET', description: 'মীযান মার্কেটের গোপনীয়তা, ব্যবহারবিধি, রিটার্ন ও অর্ডার-সংক্রান্ত নীতি দেখুন।' }
};
const htmlEscape = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

app.use(async (req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api/') || req.path === '/sitemap.xml' || path.extname(req.path)) return next();
  const route = req.path.replace(/\/$/, '') || '/';
  let meta = publicSeoRoutes[route];
  let productForSeo = null;
  let productsForSeo = [];
  if (!meta && /^\/product\/[^/]+$/.test(route)) {
    const slug = decodeURIComponent(route.slice('/product/'.length));
    meta = { title: 'পণ্য — MIZAN MARKET', description: 'মীযান মার্কেটের পণ্যের বিবরণ, মূল্য ও অর্ডারের তথ্য দেখুন।' };
    if (url && key) {
      try {
        const sb = clientFor();
        const { data, error } = await sb
          .from('products')
          .select('id,name_bn,name_en,sku,brand,short_description,description,available,selling_price,discount_price,stock_quantity,unit,size')
          .eq('slug', slug)
          .maybeSingle();
        if (error) throw error;
        if (data && data.available !== false) {
          productForSeo = data;
          try {
            const { data: images } = await sb
              .from('product_images')
              .select('image_url')
              .eq('product_id', data.id)
              .order('sort_order', { ascending: true })
              .limit(1);
            const firstImage = images?.[0];
            productForSeo.image = firstImage?.image_url || '';
          } catch (imageError) {
            console.error('Product SEO image lookup failed:', imageError.message);
          }
          const shortDescription = String(data.short_description || '').trim();
          const fullDescription = String(data.description || data.short_description || 'মীযান মার্কেটের ন্যায্য দামের পণ্য দেখুন ও অর্ডার করুন।').replace(/\s+/g, ' ').trim();
          const seoDescription = shortDescription.length >= 90 ? shortDescription : fullDescription;
          meta = {
            title: `${data.name_bn || 'পণ্য'} — MIZAN MARKET`,
            description: seoDescription.slice(0, 160)
          };
        } else {
          return res.status(404).type('html').send('পণ্যটি পাওয়া যায়নি — MIZAN MARKET');
        }
      } catch (error) {
        console.error('Product SEO metadata lookup failed:', error.message);
      }
    }
  }
  if (url && key && ['/', '/products', '/categories'].includes(route)) {
    try {
      const sb = clientFor();
      const { data: products, error } = await sb
        .from('products')
        .select('slug,name_bn,name_en,selling_price,discount_price,short_description,stock_quantity,unit,size,available')
        .eq('available', true)
        .eq('is_active', true)
        .not('slug', 'is', null)
        .limit(24);
      if (error) throw error;
      productsForSeo = products || [];
    } catch (error) {
      console.error('Listing SEO product lookup failed:', error.message);
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
    const pageSchema = productForSeo ? {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: productForSeo.name_bn || meta.title,
      description: meta.description,
      sku: productForSeo.sku || undefined,
      image: productForSeo.image ? [productForSeo.image] : undefined,
      url: canonical,
      inLanguage: 'bn-BD',
      offers: {
        '@type': 'Offer',
        url: canonical,
        priceCurrency: 'BDT',
        price: Number(productForSeo.discount_price ?? productForSeo.selling_price),
        availability: Number(productForSeo.stock_quantity || 0) > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        itemCondition: 'https://schema.org/NewCondition'
      },
      isPartOf: { '@type': 'WebSite', name: 'MIZAN MARKET', url: 'https://mizan-market.onrender.com/' }
    } : {
      '@context': 'https://schema.org',
      '@type': route === '/' ? 'WebSite' : 'WebPage',
      name: meta.title,
      description: meta.description,
      url: canonical,
      inLanguage: 'bn-BD',
      isPartOf: { '@type': 'WebSite', name: 'MIZAN MARKET', url: 'https://mizan-market.onrender.com/' }
    };
    const breadcrumbSchema = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'হোম', item: 'https://mizan-market.onrender.com/' },
        ...(productForSeo ? [{ '@type': 'ListItem', position: 2, name: 'পণ্যসমূহ', item: 'https://mizan-market.onrender.com/products' }] : []),
        { '@type': 'ListItem', position: productForSeo ? 3 : 2, name: productForSeo ? (productForSeo.name_bn || 'পণ্য') : meta.title, item: canonical }
      ]
    };
    const schemaTag = '<script type="application/ld+json">' + JSON.stringify(pageSchema).replace(/</g, '\\u003c') + '</script>' +
      '<script type="application/ld+json">' + JSON.stringify(breadcrumbSchema).replace(/</g, '\\u003c') + '</script>';
    const fallbackLinks = [
      ['পণ্যসমূহ', '/products'],
      ['ক্যাটাগরি', '/categories'],
      ['আমাদের সম্পর্কে', '/about'],
      ['আমাদের নীতি', '/principles'],
      ['দাম নির্ধারণের নীতি', '/pricing'],
      ['ডেলিভারি', '/delivery'],
      ['সাধারণ প্রশ্নোত্তর', '/faq'],
      ['ব্লগ ও পরামর্শ', '/blog'],
      ['গোপনীয়তা ও শর্তাবলি', '/policies'],
      ['যোগাযোগ', '/contact']
    ].map(([label, href]) => '<a href="' + href + '">' + label + '</a>').join(' · ');
    const routeCopy = {
      '/': ['বাংলাদেশে ন্যায্য দামে অনলাইন কেনাকাটা', 'চালের গুঁড়া, মাসকালাই ডাল, কুমড়ো বড়ি, সরিষার তেল, হলুদ ও মরিচের গুঁড়ার বর্তমান মূল্য ও পণ্যের বিবরণ দেখুন। অর্ডারের আগে একক, স্টক এবং প্রযোজ্য ডেলিভারি চার্জ যাচাই করুন।'],
      '/products': ['মীযান মার্কেটের সব পণ্য', 'চালের গুঁড়া, মাসকালাই ডাল, কুমড়ো বড়ি, সরিষার তেল, হলুদ ও মরিচের গুঁড়ার বর্তমান দাম, পরিমাণ, বিবরণ এবং স্টক দেখুন। অর্ডারের আগে পণ্যের তথ্য ও প্রযোজ্য ডেলিভারি চার্জ মিলিয়ে নিন।'],
      '/categories': ['পণ্যের ক্যাটাগরি ব্রাউজ করুন', 'চাল ও ডাল, মসলা, তেল এবং দেশি খাবারের পণ্য ক্যাটাগরি ধরে দেখুন। প্রতিটি পণ্যের দাম, পরিমাণ, বিবরণ ও স্টক যাচাই করে অনলাইনে অর্ডার করুন।'],
      '/about': ['MIZAN MARKET সম্পর্কে', 'MIZAN MARKET একটি single-seller online store। আমাদের লক্ষ্য প্রয়োজনীয় পণ্য ন্যায্য ও যুক্তিসঙ্গত দামে পৌঁছে দেওয়া এবং ব্যবসায় সততা ও স্বচ্ছতার চর্চা করা।'],
      '/principles': ['সততা, সঠিক ওজন ও ন্যায্য লেনদেন', 'পণ্যের সঠিক বিবরণ, সঠিক পরিমাপ, ত্রুটি থাকলে তা জানানো এবং ভুয়া scarcity বা fake review এড়িয়ে চলা আমাদের ঘোষিত ব্যবসায়িক নীতির অংশ।'],
      '/pricing': ['পণ্যের দাম কীভাবে নির্ধারণ করা হয়', 'মূল্য নির্ধারণে ক্রয়মূল্য, পরিবহন, প্যাকেজিং ও অন্যান্য প্রয়োজনীয় খরচের সঙ্গে যুক্তিসঙ্গত মার্জিন বিবেচনা করা হয়। সরবরাহকারীর গোপনীয় খরচ প্রকাশ না করেও মূল্যনীতি ব্যাখ্যা করা যায়।'],
      '/delivery': ['ডেলিভারি চার্জ ও অর্ডারের তথ্য', 'চেকআউটে আপনার নির্বাচিত ডেলিভারি জোন অনুযায়ী প্রযোজ্য চার্জ যাচাই করুন। অর্ডার নিশ্চিত করার আগে ঠিকানা, ফোন নম্বর এবং অর্ডার সারাংশ ভালোভাবে মিলিয়ে নিন।'],
      '/faq': ['কেনাকাটা নিয়ে সাধারণ প্রশ্নোত্তর', 'অর্ডার, পণ্য, মূল্য ও ডেলিভারি সম্পর্কে সাধারণ প্রশ্নের উত্তর দেখুন। কোনো তথ্য পরিষ্কার না হলে যোগাযোগ পৃষ্ঠার ফর্ম দিয়ে আমাদের বার্তা পাঠাতে পারেন।'],
      '/contact': ['MIZAN MARKET-এর সঙ্গে যোগাযোগ', 'পণ্য বা অর্ডার সম্পর্কে প্রশ্ন থাকলে নাম, ফোন নম্বর এবং বার্তা দিয়ে যোগাযোগ ফর্ম পাঠান। বার্তায় অর্ডার-সংক্রান্ত প্রয়োজনীয় তথ্য দিন, তবে পাসওয়ার্ড বা গোপন পেমেন্ট তথ্য দেবেন না।'],
      '/blog': ['অনলাইন কেনাকাটা ও ন্যায্য মূল্য নিয়ে পরামর্শ', 'কেনাকাটার আগে পণ্যের বিবরণ, একক, মোট মূল্য, ডেলিভারি চার্জ এবং প্রযোজ্য নীতিমালা দেখে নেওয়া ভালো। পণ্য সম্পর্কে সন্দেহ থাকলে অর্ডারের আগে যোগাযোগ করুন।'],
      '/blog/online-bazar-price-check': ['অনলাইনে বাজার করার আগে দাম, ওজন ও ডেলিভারি যাচাই', 'অনলাইনে বাজার করার সময় শুধু পণ্যের মোট দাম দেখে সিদ্ধান্ত নেবেন না। একই ধরনের পণ্যের প্যাকেটের ওজন বা পরিমাণ আলাদা হতে পারে, তাই প্রতি কেজি, প্রতি ৫০০ গ্রাম বা প্রতি লিটারের আনুমানিক মূল্য তুলনা করুন। পণ্যের নাম, উপাদান বা বিবরণ, প্যাকেটের পরিমাণ এবং বর্তমান মূল্য একসঙ্গে মিলিয়ে নিন। ছাড় দেখানো হলে ছাড়ের শর্ত ও চূড়ান্ত মূল্য যাচাই করুন।\n\nঅর্ডারের আগে পণ্যটি স্টকে আছে কি না এবং প্যাকেটের পরিমাণ আপনার প্রয়োজনের সঙ্গে মেলে কি না দেখুন। ডেলিভারি চার্জ এলাকা অনুযায়ী আলাদা হতে পারে, তাই চেকআউটে পণ্যের মূল্য, ডেলিভারি চার্জ এবং মোট পরিশোধযোগ্য অঙ্ক যাচাই করুন। ঠিকানা ও ফোন নম্বর ভুল হলে অর্ডার পৌঁছাতে সমস্যা হতে পারে।\n\nঅর্ডার নিশ্চিত হলে অর্ডার নম্বর, পণ্যের তালিকা, মোট মূল্য এবং পেমেন্টের রসিদ বা প্রমাণ সংরক্ষণ করুন। পণ্যের কোনো তথ্য পরিষ্কার না হলে অর্ডারের আগে বিক্রেতার সঙ্গে যোগাযোগ করুন। এই সহজ ধাপগুলো অপ্রত্যাশিত খরচ কমাতে এবং নিজের প্রয়োজন অনুযায়ী সঠিক পণ্য বেছে নিতে সাহায্য করে।'],
      '/blog/mashkalai-dal-kumro-bori-storage': ['মাসকালাই ডাল ও কুমড়ো বড়ি সংরক্ষণের সহজ নিয়ম', 'মাসকালাই ডাল ও শুকনো কুমড়ো বড়ি ভালো রাখতে প্রথমে পরিষ্কার, সম্পূর্ণ শুকনো এবং ঢাকনাযুক্ত পাত্র ব্যবহার করুন। পাত্রে আগের খাবারের আর্দ্রতা, তেল বা গন্ধ থাকলে শুকনো খাবারের মান নষ্ট হতে পারে। প্যাকেট খোলার পর খাবার দীর্ঘ সময় খোলা অবস্থায় না রেখে পাত্র বন্ধ করে রাখুন।\n\nশুকনো খাবার রান্নাঘরের সিঙ্ক, ভেজা দেয়াল, চুলার অতিরিক্ত তাপ বা সরাসরি রোদের পাশে রাখবেন না। আর্দ্রতা খাবারে দলা, নরমভাব বা ছত্রাকের ঝুঁকি তৈরি করতে পারে। জায়গাটি যেন পরিষ্কার, শুষ্ক এবং বাতাস চলাচল উপযোগী হয়। সম্ভব হলে পাত্রে কেনার তারিখ লিখে রাখুন এবং পুরোনো খাবার আগে ব্যবহার করুন।\n\nব্যবহারের আগে গন্ধ, রং, আর্দ্রতা এবং পোকামাকড়ের লক্ষণ পরীক্ষা করুন। খাবারে অস্বাভাবিক গন্ধ, ছত্রাক বা সন্দেহজনক পরিবর্তন দেখা গেলে তা খাবেন না। কেনার সময় প্যাকেটের ওজন, মূল্য, উপাদান এবং মেয়াদ বা সংরক্ষণ নির্দেশনা থাকলে তা পড়ে নিন। প্যাকেটের তথ্য না বুঝলে বিক্রেতাকে জিজ্ঞেস করুন। সঠিক সংরক্ষণ খাবারের গুণমান বজায় রাখতে সাহায্য করে, তবে এটি প্যাকেটের নির্দেশনার বিকল্প নয়।'],
      '/blog/mustard-oil-buying-guide': ['সরিষার তেল কেনার আগে যে বিষয়গুলো দেখবেন', 'সরিষার তেল কেনার আগে বোতল বা পাত্রের সিল অক্ষত আছে কি না, লেবেলে কী তথ্য দেওয়া আছে এবং মোট পরিমাণ কত—এসব দেখুন। প্যাকেটজাত পণ্যে প্রস্তুতকারক বা বিক্রেতার পরিচয়, উপাদান, উৎপাদন বা মেয়াদ-সংক্রান্ত তথ্য থাকলে সেগুলো পড়ুন। পাত্র ফুটো, ঢাকনা ঢিলা বা লেবেল অস্পষ্ট হলে কেনার আগে বিক্রেতার কাছে ব্যাখ্যা চান।\n\nদাম তুলনা করার সময় শুধু বোতলের মোট দাম নয়, প্রতি লিটারের মূল্য হিসাব করুন। যেমন, ছোট ও বড় প্যাকের দাম সরাসরি তুলনা করলে ভুল সিদ্ধান্ত হতে পারে। অনলাইনে অর্ডারের সময় পণ্যের বিবরণ, প্যাকেটের পরিমাণ, বর্তমান মূল্য, স্টক এবং ডেলিভারি চার্জসহ মোট খরচ মিলিয়ে নিন। কোনো দাবি—যেমন উৎপত্তি বা বিশেষ মান—প্যাকেটে বা বিক্রেতার তথ্যে স্পষ্টভাবে উল্লেখ না থাকলে সেটিকে নিশ্চিত ধরে নেবেন না।\n\nব্যবহারের পর ঢাকনা ভালোভাবে বন্ধ করে পাত্রকে সরাসরি রোদ, অতিরিক্ত তাপ এবং পানির সংস্পর্শ থেকে দূরে রাখুন। প্যাকেটে সংরক্ষণের নির্দেশনা থাকলে সেটি অনুসরণ করুন। অর্ডারের আগে প্রশ্ন থাকলে বিক্রেতার সঙ্গে যোগাযোগ করুন এবং অর্ডার নম্বর ও পেমেন্টের তথ্য সংরক্ষণ করুন। এসব ধাপ পণ্য সম্পর্কে সচেতন সিদ্ধান্ত নিতে সাহায্য করে।'],
      '/policies': ['গোপনীয়তা, ব্যবহারবিধি ও অর্ডার নীতি', 'অর্ডার দেওয়ার আগে পণ্যের মূল্য, স্টক, ডেলিভারি তথ্য এবং প্রযোজ্য বাতিল বা ফেরত নীতি পড়ে নিন। ব্যক্তিগত তথ্য কেবল অর্ডার ও গ্রাহকসেবার প্রয়োজন অনুযায়ী ব্যবহার করা উচিত।']
    };
    const copy = productForSeo
      ? [
          productForSeo.name_bn || 'পণ্যের বিবরণ',
          productForSeo.description || productForSeo.short_description || meta.description
        ]
      : (routeCopy[route] || ['পণ্যের তথ্য ও অর্ডার', meta.description]);
    const productDetails = productForSeo
      ? (productForSeo.image ? '<img src="' + htmlEscape(productForSeo.image) + '" alt="' + htmlEscape(productForSeo.name_bn || 'MIZAN MARKET পণ্য') + '" loading="eager" />' : '') +
        '<p><strong>বর্তমান মূল্য: ৳' + htmlEscape(Number(productForSeo.discount_price ?? productForSeo.selling_price).toLocaleString('en-US')) + '</strong> · ' +
        htmlEscape(Number(productForSeo.stock_quantity || 0) > 0 ? 'স্টকে আছে' : 'স্টক শেষ') + '</p><p>পণ্যের নাম: ' +
        htmlEscape(productForSeo.name_bn || '') + (productForSeo.name_en ? ' (' + htmlEscape(productForSeo.name_en) + ')' : '') +
        (productForSeo.size || productForSeo.unit ? ' · পরিমাণ: ' + htmlEscape(productForSeo.size || productForSeo.unit) : '') + '</p>'
      : '';
    const productList = productsForSeo.length
      ? '<section aria-label="পণ্যের তালিকা"><h2>জনপ্রিয় ও উপলভ্য পণ্য</h2><ul>' + productsForSeo.map((product) => {
          const name = product.name_bn || product.name_en || 'পণ্য';
          const price = Number(product.discount_price ?? product.selling_price);
          const description = String(product.short_description || '').replace(/\s+/g, ' ').trim().slice(0, 180);
          return '<li><a href="/product/' + encodeURIComponent(product.slug) + '">' + htmlEscape(name) + '</a>' +
            (product.size || product.unit ? ' — পরিমাণ: ' + htmlEscape(product.size || product.unit) : '') +
            (Number.isFinite(price) ? ' — মূল্য: ৳' + htmlEscape(price.toLocaleString('en-US')) : '') +
            (description ? '<p>' + htmlEscape(description) + '</p>' : '') +
            (Number(product.stock_quantity || 0) > 0 ? '<span>স্টকে আছে</span>' : '<span>স্টক যাচাই করুন</span>') +
            '</li>';
        }).join('') + '</ul></section>'
      : '';
    const productAdvice = productForSeo?.name_bn?.includes('কুমড়ো বড়ি') || productForSeo?.name_bn?.includes('কুমড়ো বড়ি')
      ? '<h2>কুমড়ো বড়ি কীভাবে ব্যবহার করবেন</h2><p>কুমড়ো বড়ি সাধারণত তরকারি বা মাছের ঝোলে ব্যবহার করা হয়। রান্নার ধরন অনুযায়ী বড়িগুলো আগে হালকা ভেজে নিয়ে ঝোলে দিলে স্বাদ ও গঠন ভালো থাকে। প্যাকেট খোলার পর আর্দ্রতা থেকে দূরে, পরিষ্কার ও শুকনো বায়ুরোধী পাত্রে রাখুন।</p>'
      : productForSeo?.name_bn?.includes('সরিষার তেল')
        ? '<h2>সরিষার তেল সংরক্ষণ ও ব্যবহার</h2><p>রান্নার প্রয়োজন অনুযায়ী তেল ব্যবহার করুন। বোতলের ঢাকনা ব্যবহারের পর ভালোভাবে বন্ধ করে সরাসরি রোদ, অতিরিক্ত তাপ ও পানি থেকে দূরে রাখুন। কেনার আগে বোতলের পরিমাণ, সিল, লেবেল এবং বর্তমান মূল্য যাচাই করুন।</p>'
        : '';
    const productHelpfulContent = productForSeo
      ? '<section aria-label="পণ্যের ব্যবহার ও কেনার তথ্য">' + productAdvice +
        '<h2>পণ্যের তথ্য ভালোভাবে মিলিয়ে নিন</h2><p>অর্ডারের আগে পণ্যের সঠিক নাম, প্যাকেটের পরিমাণ বা একক, উপাদান বা বিবরণ, বর্তমান মূল্য এবং স্টকের অবস্থা যাচাই করুন। পণ্যের ছবি ও বিবরণে কোনো অমিল দেখলে কেনার আগে যোগাযোগ করুন। প্যাকেটজাত খাবারের ক্ষেত্রে সিল, লেবেল এবং প্যাকেটে দেওয়া সংরক্ষণ বা মেয়াদ-সংক্রান্ত নির্দেশনাও পড়ুন।</p>' +
        '<h2>দাম ও পরিমাণ তুলনা</h2><p>একই ধরনের পণ্যের প্যাকেটের পরিমাণ ভিন্ন হতে পারে। তাই শুধু মোট দাম নয়, প্রতি কেজি, প্রতি ৫০০ গ্রাম বা প্রতি লিটারের আনুমানিক মূল্য তুলনা করুন। ছাড় থাকলে বর্তমান মূল্য এবং প্রযোজ্য শর্ত দেখুন। চূড়ান্ত হিসাবের জন্য কার্ট ও চেকআউটে দেখানো মূল্য যাচাই করুন।</p>' +
        '<h2>স্টক, ডেলিভারি ও অর্ডার</h2><p>স্টক এবং মূল্য পরিবর্তিত হতে পারে; অর্ডারের সময় প্রদর্শিত তথ্য দেখে নিশ্চিত হোন। ডেলিভারি চার্জ আপনার নির্বাচিত এলাকার ওপর নির্ভর করতে পারে। অর্ডার দেওয়ার আগে ঠিকানা, ফোন নম্বর, পণ্যের পরিমাণ এবং মোট মূল্য যাচাই করুন। অর্ডার নিশ্চিত হলে অর্ডার নম্বর ও পেমেন্টের প্রমাণ সংরক্ষণ করুন।</p>' +
        '<h2>সচেতন কেনাকাটার পরামর্শ</h2><p>যে তথ্য স্পষ্ট নয়, তা অনুমান না করে বিক্রেতার কাছে প্রশ্ন করুন। পণ্যের গুণমান বা উৎপত্তি সম্পর্কে কোনো বিশেষ দাবি থাকলে সেটির নির্ভরযোগ্য তথ্য যাচাই করুন। ব্যক্তিগত পাসওয়ার্ড বা OTP কাউকে দেবেন না।</p>' +
        '<p><a href="/products">আরও পণ্য দেখুন</a> · <a href="/delivery">ডেলিভারি তথ্য</a> · <a href="/faq">সাধারণ প্রশ্নোত্তর</a> · <a href="/contact">যোগাযোগ করুন</a></p></section>'
      : '';
    const fallbackContent = '<main class="seo-fallback"><h1>' + htmlEscape(meta.title) + '</h1><h2>' + htmlEscape(copy[0]) + '</h2><p>' + htmlEscape(copy[1]) + '</p>' + productDetails + productHelpfulContent + productList + '<nav aria-label="প্রধান পৃষ্ঠা">' + fallbackLinks + '</nav><p><a href="/">MIZAN MARKET-এর হোমপেজ</a> — ন্যায্য দামে, সবার জন্য।</p></main>';
    html = html.replace('</head>', schemaTag + '\n<link rel="canonical" href="' + htmlEscape(canonical) + '" />\n  </head>');
    html = html.replace('<div id="root"></div>', '<div id="root">' + fallbackContent + '</div>');
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