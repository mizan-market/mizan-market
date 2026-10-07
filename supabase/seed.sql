-- DEMO seed data. Existing rows are preserved where slug/code already exists.
insert into public.categories(name_bn,name_en,slug,active) values
('চাল','Rice','rice',true),('ডাল','Lentils','lentils',true),('তেল ও মসলা','Oil & Spices','oil-spices',true),('নিত্যপ্রয়োজনীয়','Daily Essentials','daily-essentials',true),('পানীয়','Beverages','beverages',true)
on conflict(slug) do update set name_bn=excluded.name_bn,name_en=excluded.name_en,active=true;

insert into public.delivery_zones(name,charge,estimated_delivery,districts,active)
select 'ঢাকার ভেতর',70,'১–২ দিন',array['ঢাকা'],true where not exists(select 1 from public.delivery_zones where name='ঢাকার ভেতর');
insert into public.delivery_zones(name,charge,estimated_delivery,districts,active)
select 'ঢাকার বাইরে',120,'২–৪ দিন',array['ঢাকা'],true where not exists(select 1 from public.delivery_zones where name='ঢাকার বাইরে');
insert into public.delivery_zones(name,charge,estimated_delivery,districts,active)
select 'অন্যান্য জেলা',140,'৩–৫ দিন',array[]::text[],true where not exists(select 1 from public.delivery_zones where name='অন্যান্য জেলা');

insert into public.products(sku,name_bn,name_en,slug,category_id,description,short_description,unit,size,stock_quantity,min_order_quantity,max_order_quantity,purchase_cost,transportation_cost,packaging_cost,other_cost,margin_type,margin_value,selling_price,delivery_charge,available,featured,popular,is_new,seo_title,seo_description)
select 'DEMO-MD-001','মাসকালাই ডাল','Mashkalai Dal','mashkalai-dal',c.id,'ডেমো পণ্য। প্রকাশের আগে প্রকৃত উৎস, মান ও মূল্য যাচাই করুন।','ডেমো মাসকালাই ডাল','কেজি','1 kg',50,1,10,100,5,2,0,'fixed',13,120,60,true,true,true,true,'মাসকালাই ডাল — MIZAN MARKET','ন্যায্য দামে মাসকালাই ডাল। DEMO seed product.' from public.categories c where c.slug='lentils' and not exists(select 1 from public.products where slug='mashkalai-dal');

insert into public.products(sku,name_bn,name_en,slug,category_id,description,short_description,unit,size,stock_quantity,min_order_quantity,max_order_quantity,purchase_cost,transportation_cost,packaging_cost,other_cost,margin_type,margin_value,selling_price,delivery_charge,available,featured,popular,is_new,seo_title,seo_description)
select 'DEMO-OIL-001','দেশি সরিষার তেল','Deshi Mustard Oil','deshi-mustard-oil',c.id,'ডেমো পণ্য। প্রকাশের আগে প্রকৃত উৎস, মান ও মূল্য যাচাই করুন।','ডেমো সরিষার তেল','লিটার','1 L',42,1,10,210,10,5,0,'percentage',9.52,245,60,true,true,true,false,'দেশি সরিষার তেল — MIZAN MARKET','ন্যায্য দামে দেশি সরিষার তেল। DEMO seed product.' from public.categories c where c.slug='oil-spices' and not exists(select 1 from public.products where slug='deshi-mustard-oil');

insert into public.faq(question_bn,answer_bn,sort_order,active) select * from (values
('ডেলিভারি চার্জ কখন দিতে হবে?','অর্ডার নিশ্চিত হওয়ার আগে ডেলিভারি চার্জ পরিশোধ ও যাচাই করতে হবে।',1,true),
('COD কি আছে?','V1-এ Cash on Delivery রাখা হয়নি।',2,true),
('দাম কীভাবে নির্ধারণ করা হয়?','ক্রয়মূল্য, প্রয়োজনীয় বাস্তব খরচ এবং যুক্তিসঙ্গত margin বিবেচনা করা হয়।',3,true)
) v(question_bn,answer_bn,sort_order,active) where not exists(select 1 from public.faq);
