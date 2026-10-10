const API=(import.meta.env.VITE_API_URL||(import.meta.env.DEV?'http://localhost:8787':location.origin)).replace(/\/$/,'');

async function request(path, options={}) {
  const r=await fetch(`${API}${path}`,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
  const data=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(data.error||'request_failed');
  return data;
}
export const apiHealth=()=>request('/api/health');
export const calculateOrder=(payload)=>request('/api/checkout/quote',{method:'POST',body:JSON.stringify(payload)});
export const createPendingOrder=(payload)=>request('/api/orders/pending',{method:'POST',headers:{Authorization:`Bearer ${payload.accessToken}`},body:JSON.stringify(payload)});
export const sendContactMessage=(payload)=>request('/api/contact',{method:'POST',body:JSON.stringify(payload)});
export const setSEO=({title,description,path='',noindex=false,image='',type='website'})=>{
  const site=import.meta.env.VITE_SITE_URL||location.origin;
  const full=`${site}${path}`;
  document.title=title||'MIZAN MARKET — ন্যায্য দামে, সবার জন্য।';
  const set=(selector,attrs)=>{let el=document.head.querySelector(selector);if(!el){el=document.createElement('meta');document.head.appendChild(el)}Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,v))};
  set('meta[name="description"]',{name:'description',content:description||'মীযান মার্কেট — ন্যায্য দামে, সবার জন্য।'});
  set('meta[name="robots"]',{name:'robots',content:noindex?'noindex,nofollow':'index,follow'});
  set('meta[property="og:title"]',{property:'og:title',content:document.title});
  set('meta[property="og:description"]',{property:'og:description',content:description||''});
  set('meta[property="og:url"]',{property:'og:url',content:full});
  set('meta[property="og:type"]',{property:'og:type',content:type});
  set('meta[property="og:site_name"]',{property:'og:site_name',content:'MIZAN MARKET'});
  if(image) set('meta[property="og:image"]',{property:'og:image',content:image});
  set('meta[name="twitter:card"]',{name:'twitter:card',content:image?'summary_large_image':'summary'});
  set('meta[name="twitter:title"]',{name:'twitter:title',content:document.title});
  set('meta[name="twitter:description"]',{name:'twitter:description',content:description||'মীযান মার্কেট — ন্যায্য দামে, সবার জন্য।'});
  if(image) set('meta[name="twitter:image"]',{name:'twitter:image',content:image});
  let c=document.head.querySelector('link[rel="canonical"]');if(!c){c=document.createElement('link');c.rel='canonical';document.head.appendChild(c)}c.href=full;
};
