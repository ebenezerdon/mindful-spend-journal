(function(){
  'use strict';
  window.App = window.App || {};

  // Storage helpers with namespaced keys
  const STORAGE_KEYS = {
    entries: 'msj:entries',
    categories: 'msj:categories',
    valuesTags: 'msj:values-tags',
    notes: 'msj:notes',
    lastMonth: 'msj:last-month'
  };

  function safeParse(json, fallback){
    try { return JSON.parse(json); } catch(e){ return fallback; }
  }

  const AppStorage = {
    load(key){ return safeParse(localStorage.getItem(key), null); },
    save(key, data){ localStorage.setItem(key, JSON.stringify(data)); },
    keys: STORAGE_KEYS
  };

  // Utilities
  const Util = {
    uid(){ return 'id_' + Math.random().toString(36).slice(2,10) + Date.now().toString(36); },
    toCents(amount){ if (!amount || isNaN(amount)) return 0; return Math.round(parseFloat(amount) * 100); },
    fromCents(cents){ return (cents||0) / 100; },
    fmtMoney(cents, currency){
      try {
        return new Intl.NumberFormat(navigator.language || 'en-US', { style:'currency', currency: currency||'USD', maximumFractionDigits: 2 }).format(Util.fromCents(cents));
      } catch(e){
        return '$' + Util.fromCents(cents).toFixed(2);
      }
    },
    todayISO(){ const d = new Date(); d.setHours(0,0,0,0); return d.toISOString().slice(0,10); },
    monthKeyFromISO(iso){ return (iso||Util.todayISO()).slice(0,7); },
    monthLabel(key){
      const [y,m] = (key||Util.monthKeyFromISO(Util.todayISO())).split('-');
      const d = new Date(parseInt(y,10), parseInt(m,10)-1, 1);
      return d.toLocaleDateString(undefined, { month:'long', year:'numeric' });
    },
    clamp(n,min,max){ return Math.max(min, Math.min(max, n)); },
    groupBy(arr, keyFn){ return arr.reduce((acc, item)=>{ const k = keyFn(item); acc[k] = acc[k]||[]; acc[k].push(item); return acc; },{}); },
    sum(arr, fn){ return arr.reduce((a, x)=> a + (fn?fn(x):x), 0); },
    // Generate a soft deterministic color from a string
    colorFromString(str){
      let h = 0; for (let i=0;i<str.length;i++){ h = (h*31 + str.charCodeAt(i)) % 360; }
      const s = 65, l = 55; // lively but readable
      return `hsl(${h} ${s}% ${l}%)`;
    },
    sanitizeTag(s){ return String(s||'').trim().slice(0,20).replace(/[\s\t\n]+/g,' '); }
  };

  // Alignment score: positive minus negative tags
  const POSITIVE_TAGS = ['Joy','Health','Growth','Connection','Simplicity','Purpose','Gratitude'];
  const NEGATIVE_TAGS = ['Regret','Impulse','Stress'];

  function computeAlignment(tags){
    tags = tags||[];
    let score = 0;
    tags.forEach(t=>{
      if (POSITIVE_TAGS.includes(t)) score += 1;
      if (NEGATIVE_TAGS.includes(t)) score -= 1;
    });
    let label = 'Neutral';
    if (score >= 2) label = 'Aligned';
    else if (score <= -1) label = 'Misaligned';
    return { score, label };
  }

  // Seed defaults if storage empty
  function ensureSeeds(){
    if (!AppStorage.load(AppStorage.keys.categories)){
      const cats = [
        { name:'Groceries', capCents: 40000 },
        { name:'Dining', capCents: 20000 },
        { name:'Transport', capCents: 12000 },
        { name:'Fun', capCents: 15000 },
        { name:'Health', capCents: 10000 },
        { name:'Home', capCents: 25000 },
        { name:'Misc', capCents: 10000 }
      ].map(c=>({ ...c, color: Util.colorFromString(c.name) }));
      AppStorage.save(AppStorage.keys.categories, cats);
    }
    if (!AppStorage.load(AppStorage.keys.valuesTags)){
      const tags = [...POSITIVE_TAGS, ...NEGATIVE_TAGS];
      AppStorage.save(AppStorage.keys.valuesTags, tags);
    }
    if (!AppStorage.load(AppStorage.keys.entries)){
      const mk = Util.monthKeyFromISO(Util.todayISO());
      const sample = [
        { id: Util.uid(), dateISO: Util.todayISO(), amountCents: 4218, category:'Groceries', merchant:'Trader Joes', tags:['Joy','Health'], reflection:'Stocked up on veggies and fruit. Felt good to cook at home.', createdAt: Date.now(), updatedAt: Date.now() },
        { id: Util.uid(), dateISO: Util.todayISO(), amountCents: 1580, category:'Dining', merchant:'Cafe Lumen', tags:['Connection'], reflection:'Coffee catch-up with a friend. Worth it.', createdAt: Date.now(), updatedAt: Date.now() }
      ];
      AppStorage.save(AppStorage.keys.entries, sample);
      AppStorage.save(AppStorage.keys.lastMonth, mk);
    }
    if (!AppStorage.load(AppStorage.keys.notes)){
      AppStorage.save(AppStorage.keys.notes, {});
    }
  }

  function getState(){
    const entries = AppStorage.load(AppStorage.keys.entries) || [];
    const categories = AppStorage.load(AppStorage.keys.categories) || [];
    const valuesTags = AppStorage.load(AppStorage.keys.valuesTags) || [];
    const notes = AppStorage.load(AppStorage.keys.notes) || {};
    const lastMonth = AppStorage.load(AppStorage.keys.lastMonth) || Util.monthKeyFromISO(Util.todayISO());
    return { entries, categories, valuesTags, notes, monthKey: lastMonth };
  }

  function saveStatePart(part, value){
    const key = AppStorage.keys[part];
    if (!key) return;
    AppStorage.save(key, value);
  }

  function monthEntries(entries, monthKey){
    return (entries||[]).filter(e => Util.monthKeyFromISO(e.dateISO) === monthKey);
  }

  function usageByCategory(entries, monthKey){
    const list = monthEntries(entries, monthKey);
    const grouped = Util.groupBy(list, e=>e.category||'Uncategorized');
    const map = {};
    Object.keys(grouped).forEach(k=>{ map[k] = Util.sum(grouped[k], e=>e.amountCents); });
    return map;
  }

  function totals(entries, monthKey){
    const list = monthEntries(entries, monthKey);
    const total = Util.sum(list, e=>e.amountCents);
    const byDay = Util.groupBy(list, e=>e.dateISO);
    const days = Object.keys(byDay).length || 1;
    return { total, avgPerDay: Math.round(total / days) };
  }

  function topN(arr, keyFn, n){
    const grouped = Util.groupBy(arr, keyFn);
    const pairs = Object.keys(grouped).map(k=>({ key:k, value: Util.sum(grouped[k], e=>e.amountCents) }));
    pairs.sort((a,b)=>b.value-a.value);
    return pairs.slice(0,n);
  }

  // Expose
  window.App.Util = Util;
  window.App.Storage = AppStorage;
  window.App.Seed = { ensureSeeds };
  window.App.State = { getState, saveStatePart };
  window.App.Metrics = { computeAlignment, monthEntries, usageByCategory, totals, topN };
})();