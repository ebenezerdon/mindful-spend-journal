(function(){
  'use strict';
  window.App = window.App || {};

  const U = window.App.Util;
  const S = window.App.Storage;
  const M = window.App.Metrics;

  // Local state
  const state = {
    entries: [],
    categories: [],
    valuesTags: [],
    notes: {},
    monthKey: '',
    filters: { category:'all', search:'' },
    currency: 'USD'
  };

  // UI helpers
  function setMonthLabel(){
    $('#monthLabel').text(U.monthLabel(state.monthKey));
  }
  function toast(msg, variant){
    const cls = variant==='error' ? 'chip' : 'chip';
    const el = $(`<div class="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 ${cls}">${msg}</div>`);
    $('body').append(el);
    el.hide().fadeIn(150);
    setTimeout(()=>{ el.fadeOut(200, ()=>el.remove()); }, 2200);
  }

  // Render tag chips selector
  function renderTagSelector(selected){
    const wrap = $('#tagsContainer');
    wrap.empty();
    state.valuesTags.forEach(t=>{
      const active = selected && selected.includes(t);
      const aria = active ? 'aria-pressed="true"' : 'aria-pressed="false"';
      const el = $(`<button type="button" data-tag="${t}" class="chip ${active?'!bg-slate-900 !text-white':''}" ${aria}>${t}</button>`);
      wrap.append(el);
    });
  }

  function tagListPills(tags){
    tags = tags||[];
    return tags.map(t=>{
      const variant = (t==='Regret'||t==='Impulse'||t==='Stress') ? 'danger' : (t==='Joy'||t==='Health'||t==='Connection'||t==='Growth'||t==='Simplicity'||t==='Purpose'||t==='Gratitude') ? 'good' : '';
      return `<span class="chip" ${variant?`data-variant="${variant}"`:''}>${t}</span>`;
    }).join(' ');
  }

  function categorySelectOptions(){
    const sel = $('#categorySelect');
    sel.empty();
    state.categories.forEach(c=>{
      sel.append(`<option value="${c.name}">${c.name}</option>`);
    });
  }

  function filterSelectOptions(){
    const sel = $('#filterCategory');
    sel.empty();
    sel.append('<option value="all">All</option>');
    state.categories.forEach(c=> sel.append(`<option value="${c.name}">${c.name}</option>`));
  }

  function budgetPreview(){
    const cat = $('#categorySelect').val();
    const amountCents = U.toCents($('#amountInput').val());
    const usageMap = M.usageByCategory(state.entries, state.monthKey);
    const used = usageMap[cat]||0;
    const cap = (state.categories.find(c=>c.name===cat)||{}).capCents || 0;
    if (!cap){ $('#budgetHint').text('No cap set for this category.'); return; }
    const future = used + amountCents;
    const pct = Math.min(100, Math.round((future / cap) * 100));
    let txt = `${U.fmtMoney(used, state.currency)} used of ${U.fmtMoney(cap, state.currency)} • After this: ${U.fmtMoney(future, state.currency)} (${pct}%)`;
    if (future > cap){ txt += ' • Over cap'; }
    else if (future > cap * .8){ txt += ' • Nearing cap'; }
    $('#budgetHint').text(txt);
  }

  function kpiCard(label, value){
    return `<div class="p-4 rounded-xl border border-slate-200 bg-white/80">
      <div class="text-xs text-slate-500">${label}</div>
      <div class="kpi mt-1">${value}</div>
    </div>`;
  }

  function renderMonthSummary(){
    const t = M.totals(state.entries, state.monthKey);
    const list = M.monthEntries(state.entries, state.monthKey);
    const alignScores = list.map(e=>M.computeAlignment(e.tags).score);
    const aligned = alignScores.filter(s=>s>0).length;
    const alignedPct = list.length ? Math.round((aligned / list.length)*100) : 0;
    $('#monthSummary').html([
      kpiCard('Total spend', U.fmtMoney(t.total, state.currency)),
      kpiCard('Avg per day', U.fmtMoney(t.avgPerDay, state.currency)),
      kpiCard('Aligned entries', alignedPct + '%')
    ].join('\n'));
  }

  function entryCard(e){
    const align = M.computeAlignment(e.tags||[]);
    const cat = state.categories.find(c=>c.name===e.category);
    const catColor = cat ? cat.color : '#64748b';
    const date = new Date(e.dateISO).toLocaleDateString();
    return $(`
      <div class="entry-card card p-4" data-id="${e.id}">
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1">
            <div class="flex items-center gap-2">
              <span class="text-base sm:text-lg font-semibold">${U.fmtMoney(e.amountCents, state.currency)}</span>
              <span class="text-slate-500 text-sm">${date}</span>
            </div>
            <div class="mt-1 text-sm text-slate-700">${e.merchant ? e.merchant : ''}</div>
            <div class="mt-2 flex flex-wrap items-center gap-2">
              <span class="chip" style="border-color:${catColor}; color:${catColor}">${e.category||'Uncategorized'}</span>
              ${tagListPills(e.tags||[])}
              <span class="chip" ${align.label==='Aligned'?'data-variant="good"':''} ${align.label==='Misaligned'?'data-variant="danger"':''}>${align.label}</span>
            </div>
            ${e.reflection ? `<p class="mt-3 text-slate-700 text-sm">${e.reflection}</p>` : ''}
          </div>
          <div class="flex flex-col items-end gap-2">
            <button class="btn-ghost editEntry">Edit</button>
            <button class="btn-ghost delEntry">Delete</button>
            <div class="h-0.5 w-12 bg-slate-100 my-2"></div>
            <button class="btn-secondary quickTag" data-tag="Joy">+Joy</button>
            <button class="btn-secondary quickTag" data-tag="Regret">+Regret</button>
          </div>
        </div>
      </div>
    `);
  }

  function renderEntries(){
    const listEl = $('#entriesList');
    listEl.empty();
    const list = M.monthEntries(state.entries, state.monthKey)
      .filter(e => state.filters.category==='all' || e.category===state.filters.category)
      .filter(e => {
        const q = state.filters.search.trim().toLowerCase();
        if (!q) return true;
        return (e.merchant||'').toLowerCase().includes(q) || (e.reflection||'').toLowerCase().includes(q) || (e.tags||[]).join(' ').toLowerCase().includes(q);
      })
      .sort((a,b)=> new Date(b.dateISO) - new Date(a.dateISO));

    if (!list.length){
      listEl.html('<div class="text-sm text-slate-500">No entries this month yet.</div>');
      return;
    }

    list.forEach(e => listEl.append(entryCard(e)));
  }

  function renderBudgets(){
    const usage = M.usageByCategory(state.entries, state.monthKey);
    const root = $('#budgetsList');
    root.empty();
    state.categories.forEach(c=>{
      const used = usage[c.name]||0;
      const cap = c.capCents||0;
      const pct = cap ? Math.min(100, Math.round(used/cap*100)) : 0;
      const warn = cap && used > cap ? 'danger' : (cap && used > cap*0.8 ? 'warning' : '');
      const chip = warn ? `<span class="chip" data-variant="${warn}">${warn==='danger'?'Over cap':'Nearing cap'}</span>` : '';
      const capLabel = cap ? U.fmtMoney(cap, state.currency) : 'Uncapped';
      const usedLabel = U.fmtMoney(used, state.currency);
      const barColor = warn==='danger' ? '#ef4444' : warn==='warning' ? '#f59e0b' : c.color;
      const row = $(`
        <div class="p-4 rounded-xl border border-slate-200 bg-white/80">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <span class="inline-block h-3 w-3 rounded-full" style="background:${c.color}"></span>
              <div class="font-medium">${c.name}</div>
              ${chip}
            </div>
            <div class="text-sm text-slate-600">${usedLabel} / ${capLabel}</div>
          </div>
          <div class="progress mt-3" aria-label="${c.name} budget progress">
            <div class="bar" style="width:${pct}%; background:${barColor}"></div>
          </div>
          <div class="mt-3 flex items-center gap-2">
            <label class="text-xs text-slate-600">Cap</label>
            <input type="number" step="0.01" min="0" value="${U.fromCents(c.capCents||0)}" class="input w-28" data-cat="${c.name}" data-role="capInput">
            <button class="btn-secondary" data-cat="${c.name}" data-role="saveCap">Save</button>
            <button class="btn-ghost" data-cat="${c.name}" data-role="delCat">Remove</button>
          </div>
        </div>
      `);
      root.append(row);
    });
  }

  function renderRetro(){
    const list = M.monthEntries(state.entries, state.monthKey);
    const t = M.totals(state.entries, state.monthKey);
    const alignScores = list.map(e=>M.computeAlignment(e.tags).score);
    const aligned = alignScores.filter(s=>s>0).length;
    const misaligned = alignScores.filter(s=>s<0).length;
    const alignedPct = list.length ? Math.round((aligned / list.length)*100) : 0;
    $('#retroKPIs').html([
      kpiCard('Total spend', U.fmtMoney(t.total, state.currency)),
      kpiCard('Entries', String(list.length)),
      kpiCard('Aligned', alignedPct + '%')
    ].join('\n'));

    // Top merchants
    const top = M.topN(list, e=>e.merchant||'Unknown', 5);
    const tm = $('#topMerchants'); tm.empty();
    top.forEach(p => tm.append(`<span class="chip">${p.key} • ${U.fmtMoney(p.value, state.currency)}</span>`));

    // Tag pulse
    const tagsCount = {};
    list.forEach(e => (e.tags||[]).forEach(tg => { tagsCount[tg] = (tagsCount[tg]||0) + 1; }));
    const tagSorted = Object.keys(tagsCount).sort((a,b)=>tagsCount[b]-tagsCount[a]).slice(0,8);
    const tp = $('#tagPulse'); tp.empty();
    tagSorted.forEach(tg => tp.append(`<span class="chip">${tg} • ${tagsCount[tg]}</span>`));

    // Highlights
    const hi = $('#retroHighlights'); hi.empty();
    const best = list.filter(e => M.computeAlignment(e.tags).score>0).slice(0,3);
    const worst = list.filter(e => M.computeAlignment(e.tags).score<0).slice(0,3);
    if (!list.length){ hi.append('<div class="text-sm text-slate-500">No entries yet this month.</div>'); }
    if (best.length){
      hi.append('<div class="text-sm font-semibold text-slate-700">Aligned moments</div>');
      best.forEach(e=> hi.append(`<div class="text-sm text-slate-700">${U.fmtMoney(e.amountCents)} at ${e.merchant||'Unknown'} • ${e.reflection||''}</div>`));
    }
    if (worst.length){
      hi.append('<div class="text-sm font-semibold text-slate-700 mt-3">Needs attention</div>');
      worst.forEach(e=> hi.append(`<div class="text-sm text-slate-700">${U.fmtMoney(e.amountCents)} at ${e.merchant||'Unknown'} • ${e.reflection||''}</div>`));
    }

    // Notes
    $('#monthlyNotes').val(state.notes[state.monthKey]||'');
  }

  function setActiveTab(tab){
    $('[data-tab]').attr('aria-selected','false').removeClass('nav-tab-active');
    $(`[data-tab="${tab}"]`).attr('aria-selected','true').addClass('nav-tab-active');
    $('#tab-journal, #tab-budgets, #tab-retro').addClass('hidden');
    $(`#tab-${tab}`).removeClass('hidden');
  }

  // Modal for editing entry
  function openEditModal(entryId){
    const e = state.entries.find(x=>x.id===entryId);
    if (!e) return;
    const html = $(`
      <div class="modal-backdrop" role="dialog" aria-modal="true">
        <div class="modal-card">
          <div class="modal-header">
            <div class="font-semibold">Edit entry</div>
            <button class="btn-ghost" data-modal-close>Close</button>
          </div>
          <div class="modal-body">
            <form id="editForm" class="space-y-3" autocomplete="off">
              <div class="grid gap-3 sm:grid-cols-2">
                <div>
                  <label class="text-sm text-slate-600">Amount</label>
                  <input type="number" step="0.01" min="0" class="input" id="editAmount" value="${U.fromCents(e.amountCents)}">
                </div>
                <div>
                  <label class="text-sm text-slate-600">Date</label>
                  <input type="date" class="input" id="editDate" value="${e.dateISO}">
                </div>
              </div>
              <div class="grid gap-3 sm:grid-cols-2">
                <div>
                  <label class="text-sm text-slate-600">Merchant</label>
                  <input class="input" id="editMerchant" value="${e.merchant||''}">
                </div>
                <div>
                  <label class="text-sm text-slate-600">Category</label>
                  <select class="input" id="editCategory">${state.categories.map(c=>`<option ${e.category===c.name?'selected':''}>${c.name}</option>`).join('')}</select>
                </div>
              </div>
              <div>
                <label class="text-sm text-slate-600">Tags</label>
                <div id="editTags" class="mt-2 flex flex-wrap gap-2">${state.valuesTags.map(t=>`<button type="button" data-tag="${t}" class="chip ${e.tags.includes(t)?'!bg-slate-900 !text-white':''}">${t}</button>`).join('')}</div>
              </div>
              <div>
                <label class="text-sm text-slate-600">Reflection</label>
                <textarea id="editReflection" rows="3" class="input">${e.reflection||''}</textarea>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" data-modal-close>Cancel</button>
            <button class="btn-primary" id="saveEdit" data-id="${e.id}">Save changes</button>
          </div>
        </div>
      </div>
    `);
    $('#modalRoot').html(html);
  }

  function closeModal(){ $('#modalRoot').empty(); }

  // Export/Import
  function exportData(){
    const data = {
      entries: state.entries,
      categories: state.categories,
      valuesTags: state.valuesTags,
      notes: state.notes
    };
    const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `mindful-spending-${state.monthKey}.json`; a.click();
    setTimeout(()=> URL.revokeObjectURL(url), 500);
  }

  function importData(file){
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(reader.result);
        if (!obj) throw new Error('Invalid data');
        if (Array.isArray(obj.entries)) { state.entries = obj.entries; S.save(S.keys.entries, state.entries); }
        if (Array.isArray(obj.categories)) { state.categories = obj.categories; S.save(S.keys.categories, state.categories); }
        if (Array.isArray(obj.valuesTags)) { state.valuesTags = obj.valuesTags; S.save(S.keys.valuesTags, state.valuesTags); }
        if (obj.notes && typeof obj.notes==='object') { state.notes = obj.notes; S.save(S.keys.notes, state.notes); }
        toast('Import successful');
        renderAll();
      } catch(e){ toast('Import failed', 'error'); }
    };
    reader.readAsText(file);
  }

  // Public API
  window.App.init = function(){
    // Seeds
    window.App.Seed.ensureSeeds();
    // Load state
    const st = window.App.State.getState();
    Object.assign(state, st);

    // Populate UI pieces
    setMonthLabel();
    categorySelectOptions();
    filterSelectOptions();
    renderTagSelector([]);

    // Default form values
    $('#dateInput').val(U.todayISO());
    $('#amountInput').val('');

    // Events
    $(document)
      .on('click','[data-tab]',function(){ setActiveTab($(this).data('tab')); })
      .on('click','#prevMonth', function(){
        const [y,m] = state.monthKey.split('-').map(x=>parseInt(x,10));
        const d = new Date(y, m-2, 1); // prev month
        state.monthKey = d.toISOString().slice(0,7);
        window.App.State.saveStatePart('lastMonth', state.monthKey);
        setMonthLabel();
        renderAll();
      })
      .on('click','#nextMonth', function(){
        const [y,m] = state.monthKey.split('-').map(x=>parseInt(x,10));
        const d = new Date(y, m, 1); // next month
        state.monthKey = d.toISOString().slice(0,7);
        window.App.State.saveStatePart('lastMonth', state.monthKey);
        setMonthLabel();
        renderAll();
      })
      .on('input change', '#amountInput, #categorySelect', budgetPreview)
      .on('click', '#tagsContainer .chip', function(){ $(this).toggleClass('!bg-slate-900 !text-white'); })
      .on('click', '#addTagBtn', function(){
        const t = U.sanitizeTag($('#customTagInput').val());
        if (!t) return;
        if (!state.valuesTags.includes(t)){
          state.valuesTags.push(t);
          S.save(S.keys.valuesTags, state.valuesTags);
        }
        $('#customTagInput').val('');
        renderTagSelector([]);
      })
      .on('submit', '#entryForm', function(e){
        e.preventDefault();
        const amountCents = U.toCents($('#amountInput').val());
        if (!amountCents){ toast('Enter a valid amount','error'); return; }
        const dateISO = $('#dateInput').val() || U.todayISO();
        const merchant = ($('#merchantInput').val()||'').trim();
        const category = $('#categorySelect').val();
        const tags = $('#tagsContainer .chip.!bg-slate-900').toArray().map(el=>$(el).data('tag'));
        const reflection = ($('#reflectionInput').val()||'').trim();
        const entry = { id: U.uid(), dateISO, amountCents, category, merchant, tags, reflection, createdAt: Date.now(), updatedAt: Date.now() };
        state.entries.push(entry);
        S.save(S.keys.entries, state.entries);
        $('#entryForm')[0].reset();
        $('#dateInput').val(U.todayISO());
        renderAll();
        toast('Saved');
      })
      .on('click', '.delEntry', function(){
        const id = $(this).closest('[data-id]').data('id');
        if (!confirm('Delete this entry?')) return;
        state.entries = state.entries.filter(e=>e.id!==id);
        S.save(S.keys.entries, state.entries);
        renderAll();
        toast('Deleted');
      })
      .on('click', '.editEntry', function(){
        const id = $(this).closest('[data-id]').data('id');
        openEditModal(id);
      })
      .on('click','[data-modal-close]', function(){ closeModal(); })
      .on('click','#saveEdit', function(){
        const id = $(this).data('id');
        const idx = state.entries.findIndex(e=>e.id===id);
        if (idx<0) { closeModal(); return; }
        const e0 = state.entries[idx];
        const amountCents = U.toCents($('#editAmount').val());
        const dateISO = $('#editDate').val();
        const merchant = $('#editMerchant').val();
        const category = $('#editCategory').val();
        const tags = $('#editTags .chip.!bg-slate-900').toArray().map(el=>$(el).data('tag'));
        const reflection = $('#editReflection').val();
        state.entries[idx] = { ...e0, amountCents, dateISO, merchant, category, tags, reflection, updatedAt: Date.now() };
        S.save(S.keys.entries, state.entries);
        closeModal();
        renderAll();
        toast('Updated');
      })
      .on('click','#editTags .chip', function(){ $(this).toggleClass('!bg-slate-900 !text-white'); })
      .on('click','.quickTag', function(){
        const id = $(this).closest('[data-id]').data('id');
        const tag = $(this).data('tag');
        const idx = state.entries.findIndex(e=>e.id===id);
        if (idx<0) return;
        const e = state.entries[idx];
        const tags = new Set(e.tags||[]);
        if (tags.has(tag)) tags.delete(tag); else tags.add(tag);
        e.tags = Array.from(tags);
        e.updatedAt = Date.now();
        S.save(S.keys.entries, state.entries);
        renderEntries();
      })
      // Filters
      .on('change','#filterCategory', function(){ state.filters.category = $(this).val(); renderEntries(); })
      .on('input','#searchInput', function(){ state.filters.search = $(this).val(); renderEntries(); })
      // Budgets
      .on('submit','#categoryForm', function(e){
        e.preventDefault();
        const name = ($('#catNameInput').val()||'').trim();
        const cap = U.toCents($('#catCapInput').val());
        if (!name) { toast('Category needs a name','error'); return; }
        if (state.categories.some(c=>c.name.toLowerCase()===name.toLowerCase())){ toast('Category exists','error'); return; }
        state.categories.push({ name, capCents: cap, color: U.colorFromString(name) });
        S.save(S.keys.categories, state.categories);
        $('#catNameInput').val(''); $('#catCapInput').val('');
        categorySelectOptions(); filterSelectOptions(); renderBudgets();
        toast('Category added');
      })
      .on('click','[data-role="saveCap"]', function(){
        const cat = $(this).data('cat');
        const val = $(`input[data-role="capInput"][data-cat="${cat}"]`).val();
        const cap = U.toCents(val);
        const idx = state.categories.findIndex(c=>c.name===cat);
        if (idx<0) return;
        state.categories[idx].capCents = cap;
        S.save(S.keys.categories, state.categories);
        renderBudgets(); renderMonthSummary();
        toast('Cap saved');
      })
      .on('click','[data-role="delCat"]', function(){
        const cat = $(this).data('cat');
        if (!confirm(`Remove category ${cat}?`)) return;
        state.categories = state.categories.filter(c=>c.name!==cat);
        S.save(S.keys.categories, state.categories);
        categorySelectOptions(); filterSelectOptions(); renderBudgets(); renderEntries();
        toast('Category removed');
      })
      // Retro notes
      .on('input','#monthlyNotes', function(){
        state.notes[state.monthKey] = $(this).val();
        S.save(S.keys.notes, state.notes);
        $('#notesFeedback').text('Saved');
        setTimeout(()=> $('#notesFeedback').text(''), 1200);
      })
      // Export/Import
      .on('click','#exportBtn', function(){ exportData(); })
      .on('change','#importInput', function(){ const f=this.files[0]; if (f) importData(f); $(this).val(''); });
  };

  function renderAll(){
    // Refresh state from storage in case other tabs modified
    state.entries = S.load(S.keys.entries) || state.entries;
    state.categories = S.load(S.keys.categories) || state.categories;
    state.valuesTags = S.load(S.keys.valuesTags) || state.valuesTags;
    state.notes = S.load(S.keys.notes) || state.notes;

    setMonthLabel();
    renderMonthSummary();
    renderEntries();
    renderBudgets();
    renderRetro();
  }

  window.App.render = function(){
    renderAll();
  };
})();