# MIZAN MARKET — Feature matrix

| Feature | Status in this build | Production note |
|---|---|---|
| Bangla default / English switch | Included | Expand translations as content grows |
| Responsive storefront | Included | Test final devices before launch |
| Products/categories/search | Included | Uses Supabase catalog |
| Product details / SEO | Included | Dynamic title/description/canonical/OG |
| Cart / wishlist | Included | Wishlist DB sync can be expanded; cart is local until checkout |
| Customer Auth | Included | Supabase Auth |
| Profile / addresses / orders | Included | Supabase RLS |
| Admin role protection | Included | `profiles.role='admin'` |
| Product pricing calculator | Included | Purchase + transport + packaging + other + margin |
| Product CRUD | Included | Admin-only RLS |
| Product image bucket | Included | Supabase Storage `product-images` |
| Delivery zones | Included | Admin CRUD |
| Order status | Included | Admin update + customer view |
| Inventory | Included | Demo payment confirmation decrements stock atomically in DB |
| Reviews moderation | Included | Verified-purchase enforcement should be added to the review insert RPC before public launch |
| Blog/FAQ | Read/admin list foundation | Add rich editor CRUD before large content program |
| Legal pages | Included as editable-safe placeholders | Replace with verified business policy text |
| Invoice | Print view | Browser print is used; PDF download can be added later |
| Payment | Architecture + local TEST PAYMENT | Real bKash/Nagad/SSLCommerz integration remains pending |
| SEO | Core metadata/robots/sitemap/JSON-LD-ready structure | Generate product/category URLs into production sitemap |
| PWA | Manifest + safe service worker | Test cache strategy before relying on offline mode |
| Email/SMS/WhatsApp | Not included | Optional later |
