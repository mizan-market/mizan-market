const r=await fetch('http://localhost:8787/api/health');if(!r.ok)throw new Error('API unavailable');console.log(await r.json());
