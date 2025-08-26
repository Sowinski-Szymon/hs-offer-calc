(() => {
  // ====== Globals ======
  let $app = null;
  let ep = {};
  let lastError = '';

  // ====== Pricing ======
  const PRICING_MATRIX = {
    "ePublink Budżet": { "Tier1": 6990, "Tier2": 9590, "Tier3": 11390, "Tier4": 33790 },
    "ePublink SWB":    { "Tier1": 2590, "Tier2": 2790, "Tier3": 3290, "Tier4": 3290 },
    "ePublink Umowy":  { "Tier1": 3490, "Tier2": 4490, "Tier3": 7990, "Tier4": 22990 },
    "ePublink WPF":    { "Tier1": 3390, "Tier2": 5390, "Tier3": 7490, "Tier4": 21990 },
    "Kompleksowa obsługa WPF": { "Tier1": 10010, "Tier2": 8010, "Tier3": 5910, "Tier4": 1 },
    "Wsparcie w zakresie obsługi długu": { "Tier1": 12610, "Tier2": 12610, "Tier3": 12610, "Tier4": 12610 },
    "Kompleksowa obsługa WPF wraz z rocznym wsparciem pozyskania finansowania": { "Tier1": 26010, "Tier2": 24010, "Tier3": 21910, "Tier4": 1 }
  };
  const EXTRA_USER_PRODUCT_ID = '163198115623';
  const EXTRA_USER_PRICES = { Tier1: 590, Tier2: 690, Tier3: 890, Tier4: 990 };

  // ====== Labels ======
  const LABELS = {
    WPF: 'ePublink WPF',
    BUDZET: 'ePublink Budżet',
    UMOWY: 'ePublink Umowy',
    SWB: 'ePublink SWB'
  };
  const TIER_LABEL = { Tier1: 'Solo', Tier2: 'Plus', Tier3: 'Pro', Tier4: 'Max' };

  // ====== State ======
  const state = {
    company: null,
    catalog: { mainProducts: [], services: [] },
    overview: null,               // { company, owned:{main,services}, companyDates? }
    billing: { isPackageOnCompany:false, lastNet:{} }, // z /company-billing (opcjonalny)
    ownedMain: new Set(),         // klucze: WPF/BUDZET/UMOWY/SWB
    selection: { main: new Set(), services: new Set() },
    global: { packageMode: false, tier: 'Tier1', extraUsers: 0, startDate: null },
    router: { page: 'builder' }
  };

  // ====== Utils ======
  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k,v] of Object.entries(attrs)) {
      if (k === 'class') el.className = v;
      else if (k === 'onclick' || k === 'onchange' || k === 'oninput') el[k] = v; // tylko małe litery
      else if (v !== null && v !== undefined) el.setAttribute(k, v);
    }
    children.flat().forEach(c => el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return el;
  }

  async function api(url, opts) {
    const r = await fetch(url, opts);
    if (!r.ok) {
      const t = await r.text().catch(()=>String(r.status));
      throw new Error(`${r.status} ${t}`);
    }
    return r.json();
  }

  function fmtDate(val) {
    if (val === null || val === undefined || val === '') return '—';
    const n = Number(val);
    const d = isNaN(n) ? new Date(String(val)) : new Date(n); // HubSpot date/datetime → ms string
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pl-PL');
  }

  function money(v){ return `${Number(v||0).toFixed(2)} PLN`; }
  function bundleDiscount(c){ if(c>=4) return 900; if(c===3) return 600; if(c===2) return 300; return 0; }
  function getPrice(label, tier){ const m=PRICING_MATRIX[label]; return m ? Number(m[tier]||0) : 0; }

  function go(page){
    state.router.page = page;
    if (page === 'builder') viewCompanyPicker();
    if (page === 'products') viewProductPicker();
    if (page === 'summary') viewSummary();
  }

  // ====== Dates helpers (twarde internale) ======
  // Szuka w kolejności: owned.main[].nextBillingDate → overview.companyDates → surowe company.*
  function getOwnedEndDate(key){
    const fromList = (state.overview?.owned?.main || []).find(x => x.key === key)?.nextBillingDate;
    if (fromList) return fromList;

    const cd = state.overview?.companyDates;
    if (cd && cd[key]) return cd[key];

    const c = state.overview?.company || {};
    if (key === 'WPF')    return c.wpf_next_billing_date || null;
    if (key === 'BUDZET') return c.best_next_billing_date || null; // exact internal
    if (key === 'UMOWY')  return c.umowy_next_billing_date || null;
    if (key === 'SWB')    return c.swb_next_billing_date || null;
    return null;
  }
  function getPackEndDate(){
    const c = state.overview?.company || {};
    return c.pack_next_billing_date || null; // exact internal
  }

  // ====== Compensation ======
  function daysBetweenISO(startISO, endVal){
    if(!startISO || !endVal) return 0;
    const s = new Date(startISO+'T00:00:00');
    const n = Number(endVal);
    const e = isNaN(n) ? new Date(String(endVal)) : new Date(n);
    const diff = Math.ceil((e - s) / (1000*60*60*24));
    return Math.max(0, diff);
  }

  // kompensata liczona TYLKO gdy Pakiet=ON
  function computeCompensation(){
    if (!state.global.packageMode) return 0;
    const startISO = state.global.startDate;
    if (!startISO) return 0;

    const lastNet = state.billing?.lastNet || {};
    const isPkgOnCompany = !!state.billing?.isPackageOnCompany;
    const D = 364;

    if (isPkgOnCompany) {
      const net = Number(lastNet.package || 0);
      const packEnd = getPackEndDate();
      if (!net || !packEnd) return 0;
      const days = daysBetweenISO(startISO, packEnd);
      return (net / D) * days;
    }

    let sum = 0;
    for (const key of state.ownedMain) {
      const net = Number(lastNet[key] || 0);
      const end = getOwnedEndDate(key);
      if (!net || !end) continue;
      const days = daysBetweenISO(startISO, end);
      sum += (net / D) * days;
    }
    return sum;
  }

  // ====== View: Company picker ======
  function viewCompanyPicker(){
    const input = h('input',{
      class:'inp',
      placeholder:'Szukaj firmy (min 2 litery)',
      style:'display:block;width:100%;max-width:640px;padding:12px;border:2px solid #2b6cb0;border-radius:8px;margin:12px 0;'
    });
    const list = h('div',{class:'list', style:'margin-top:8px;'});
    const info = h('div',{class:'muted', style:'color:#475569;'}, 'Zacznij pisać – minimum 2 znaki.');

    let t;
    input.oninput = ()=> {
      const q = input.value.trim();
      clearTimeout(t);
      t = setTimeout(async () => {
        if (q.length<2){ list.innerHTML=''; info.textContent='Wpisz minimum 2 znaki.'; return; }
        try{
          const results = await api(`${ep.search}?query=${encodeURIComponent(q)}`);
          list.innerHTML = '';
          info.textContent = results.length ? '' : 'Brak wyników.';
          results.forEach(r=>{
            const row = h('div',{class:'row', style:'padding:10px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:8px;cursor:pointer;display:flex;justify-content:space-between;'},
              h('span',{}, r.properties.name||'Bez nazwy'),
              h('span',{style:'color:#64748b;'}, r.properties.domain||'')
            );
            row.onclick = ()=>pickCompany(r);
            list.appendChild(row);
          });
        }catch(e){
          info.textContent = 'Błąd wyszukiwania firm.';
        }
      },300);
    };

    $app.innerHTML='';
    $app.append(
      h('div',{class:'view'},
        h('h2',{},'Wybierz firmę'),
        input,
        info,
        list
      )
    );
  }

  // ====== After company picked ======
  async function pickCompany(c){
    state.company = c;
    try{
      const reqs = [
        api(`${ep.overview}?companyId=${encodeURIComponent(c.id)}`).then(r=>state.overview=r),
        api(ep.catalog).then(r=>state.catalog=r)
      ];
      if (ep.companyBilling) {
        reqs.push(api(`${ep.companyBilling}?companyId=${encodeURIComponent(c.id)}`).then(r=>state.billing=r).catch(()=>{ state.billing={isPackageOnCompany:false,lastNet:{}}; }));
      }
      await Promise.all(reqs);

      state.ownedMain = new Set((state.overview?.owned?.main||[]).map(x=>x.key));
      state.global.packageMode = state.ownedMain.size > 0; // domyślnie ON jeśli coś mają
      state.global.startDate = new Date().toISOString().slice(0,10);

      go('products');
    }catch(e){
      alert('Nie udało się pobrać danych firmy/katalogu.');
      go('builder');
    }
  }

  // ====== View: Product picker ======
  function viewProductPicker(){
    const wrap = h('div',{class:'view'});

    // Tytuł
    wrap.appendChild(h('h2',{}, `Firma: ${state.company.properties.name}`));

    // Posiadane (ładne etykiety + daty)
    const sec = h('div',{class:'owned'});
    sec.appendChild(h('h3',{},'Obecnie posiadane'));
    const list = h('div',{class:'owned-list'});
    (state.overview?.owned?.main||[]).forEach(item=>{
      const label = LABELS[item.key] || item.key;
      list.appendChild(h('div',{class:'owned-row'},
        h('span',{}, label),
        h('span',{style:'color:#64748b;'}, fmtDate(getOwnedEndDate(item.key)))
      ));
    });
    if (!list.children.length) list.appendChild(h('div',{class:'muted'},'Brak posiadanych produktów w CRM.'));
    sec.appendChild(list);
    wrap.appendChild(sec);

    // Ustawienia globalne
    const settings = h('div',{class:'settings'});
    settings.appendChild(h('h3',{},'Ustawienia globalne'));

    // Pakiet
    const pkgLbl = h('label',{style:'display:flex;gap:8px;align-items:center;'},
      h('input',{type:'checkbox', onchange:(e)=>{ state.global.packageMode = e.target.checked; renderSummaryBox(); }}),
      ' Pakiet (rabat liczony od posiadanych + nowych)'
    );
    pkgLbl.querySelector('input').checked = state.global.packageMode;
    settings.appendChild(pkgLbl);

    // Data startu
    const dateRow = h('div',{style:'margin:6px 0;display:flex;gap:8px;align-items:center;'},
      h('span',{},'Data startu:'),
      h('input',{type:'date', value: state.global.startDate, onchange:(e)=>{ state.global.startDate = e.target.value; renderSummaryBox(); }})
    );
    settings.appendChild(dateRow);

    // Tier
    const tierSel = h('select',{onchange:(e)=>{ state.global.tier = e.target.value; renderSummaryBox(); }});
    ['Tier1','Tier2','Tier3','Tier4'].forEach(code=>{
      const opt=h('option',{value:code}, TIER_LABEL[code]);
      if (code===state.global.tier) opt.selected=true;
      tierSel.appendChild(opt);
    });
    settings.appendChild(h('div',{}, 'Tier: ', tierSel));

    // Dodatkowi użytkownicy
    const extraInp = h('input',{type:'number',min:'0',value:String(state.global.extraUsers||0),oninput:(e)=>{ state.global.extraUsers=Number(e.target.value||0); renderSummaryBox(); } });
    settings.appendChild(h('div',{}, 'Liczba dodatkowych użytkowników: ', extraInp));

    wrap.appendChild(settings);

    // Produkty główne — kafelki
    const mainBar = h('div',{class:'tiles'});
    (state.catalog?.mainProducts||[]).forEach(mp=>{
      const isOwned = state.ownedMain.has(mp.key);
      const isSelected = state.selection.main.has(mp.key);
      const tile = tileBtn({
        label: LABELS[mp.key] || mp.key,
        selected: isOwned || isSelected,
        owned: isOwned,
        onclick: () => {
          if (isOwned) return;
          if (state.selection.main.has(mp.key)) state.selection.main.delete(mp.key);
          else state.selection.main.add(mp.key);
          renderTilesAndSummary();
        }
      });
      mainBar.appendChild(tile);
    });
    wrap.append(h('h3',{},'Produkty główne'), mainBar);

    // Usługi — kafelki
    const svcBar = h('div',{class:'tiles'});
    (state.catalog?.services||[]).forEach(svc=>{
      const selected = state.selection.services.has(svc.key);
      const tile = tileBtn({
        label: svc.label,
        selected,
        owned: false,
        onclick: () => {
          if (selected) state.selection.services.delete(svc.key);
          else state.selection.services.add(svc.key);
          renderTilesAndSummary();
        }
      });
      svcBar.appendChild(tile);
    });
    wrap.append(h('h3',{},'Usługi'), svcBar);

    // Podsumowanie (estymacja)
    const summaryBox = h('div',{class:'summary'});
    wrap.append(h('h3',{},'Podsumowanie (estymacja)'), summaryBox);

    // CTA: przejście dalej
    wrap.appendChild(h('button',{class:'btn', type:'button', onclick:()=>go('summary')},'Przejdź do podsumowania'));

    $app.innerHTML='';
    $app.appendChild(wrap);
    renderSummaryBox();

    // helpers for this view
    function tileBtn({label, selected, owned, onclick}){
      const b = h('button',{class:`tile ${selected?'tile--selected':''} ${owned?'tile--owned':''}`, type:'button', onclick}, label);
      if (owned) b.appendChild(h('span',{class:'pill pill--owned'},'Posiadany'));
      else if (selected) b.appendChild(h('span',{class:'pill pill--selected'},'Wybrany'));
      return b;
    }

    function renderTilesAndSummary(){
      // przerysuj kafelki i podsumowanie
      mainBar.innerHTML = '';
      (state.catalog?.mainProducts||[]).forEach(mp=>{
        const isOwned = state.ownedMain.has(mp.key);
        const isSelected = state.selection.main.has(mp.key);
        const tile = tileBtn({
          label: LABELS[mp.key] || mp.key,
          selected: isOwned || isSelected,
          owned: isOwned,
          onclick: () => {
            if (isOwned) return;
            if (state.selection.main.has(mp.key)) state.selection.main.delete(mp.key);
            else state.selection.main.add(mp.key);
            renderTilesAndSummary();
          }
        });
        mainBar.appendChild(tile);
      });

      svcBar.innerHTML = '';
      (state.catalog?.services||[]).forEach(svc=>{
        const selected = state.selection.services.has(svc.key);
        const tile = tileBtn({
          label: svc.label,
          selected,
          owned: false,
          onclick: () => {
            if (selected) state.selection.services.delete(svc.key);
            else state.selection.services.add(svc.key);
            renderTilesAndSummary();
          }
        });
        svcBar.appendChild(tile);
      });

      renderSummaryBox();
    }

    function renderSummaryBox(){
      summaryBox.innerHTML = '';
      const tier = state.global.tier;

      const selectedMainLabels = [...state.selection.main.values()].map(k => LABELS[k] || k);
      const selectedMainTotal = selectedMainLabels.reduce((s,lab)=> s + getPrice(lab, tier), 0);

      const selectedServicesLabels = [...state.selection.services.values()];
      const selectedServicesTotal = selectedServicesLabels.reduce((s,lab)=> s + getPrice(lab, tier), 0);

      const extraQty  = Number(state.global.extraUsers||0);
      const extraUnit = Number(EXTRA_USER_PRICES[tier] || 0);
      const extraTotal= extraQty * extraUnit;

      if (state.global.packageMode) {
        const unionCount = new Set([...state.ownedMain, ...state.selection.main]).size;
        const discount = bundleDiscount(unionCount);
        const compensation = computeCompensation(); // liczy wg dat z getOwnedEndDate / getPackEndDate
        const payable = Math.max(0, selectedMainTotal + selectedServicesTotal + extraTotal - discount + compensation);

        summaryBox.append(
          h('div',{class:'totals'},
            h('div',{}, `Nowe moduły (łącznie): ${money(selectedMainTotal)}`),
            h('div',{}, `Usługi (łącznie): ${money(selectedServicesTotal)}`),
            h('div',{}, `Dodatkowi użytkownicy: ${extraQty} × ${money(extraUnit)} = ${money(extraTotal)}`),
            h('div',{}, `Rabat pakietowy: -${money(discount)}`),
            h('div',{}, `Rekompensata: +${money(compensation)}`),
            h('div',{class:'totals-grand'}, `Razem (est.): ${money(payable)}`)
          )
        );
        return;
      }

      // Pakiet OFF → rozbicie linii (bez kompensaty)
      const list = h('div',{class:'li-table'});
      list.append(rowLi('Pozycja','Qty','Cena jedn.','Rabat','Suma', true));
      selectedMainLabels.forEach(lab=>{
        const price = getPrice(lab, tier);
        list.append(rowLi(lab,'1',money(price),'—',money(price)));
      });
      selectedServicesLabels.forEach(lab=>{
        const price = getPrice(lab, tier);
        list.append(rowLi(lab,'1',money(price),'—',money(price)));
      });
      if (extraQty>0){
        list.append(rowLi('Dodatkowi użytkownicy', String(extraQty), money(extraUnit), '—', money(extraTotal)));
      }
      summaryBox.append(list);

      const discount = bundleDiscount(state.selection.main.size);
      const payable = Math.max(0, selectedMainTotal + selectedServicesTotal + extraTotal - discount);
      summaryBox.append(
        h('div',{class:'totals'},
          h('div',{}, `Rabat pakietowy (tylko nowe): -${money(discount)}`),
          h('div',{class:'totals-grand'}, `Razem (est.): ${money(payable)}`)
        )
      );

      function rowLi(a,b,c,d,e,head=false){
        const r = h('div',{class:'li-row'+(head?' li-head':'')});
        r.append(h('div',{},a),h('div',{},b),h('div',{},c),h('div',{},d),h('div',{},e));
        return r;
      }
    }
  }

  // ====== View: Summary (placeholder do czasu podpięcia deal/quotes) ======
  function viewSummary(){
    const w = h('div',{class:'view'});
    w.appendChild(h('h2',{},'Podsumowanie'));
    w.appendChild(h('div',{class:'muted'}, 'Widok deal/quotes dołączymy po potwierdzeniu, że CRM zwraca daty i kalkulacje są ok.'));
    w.appendChild(h('button',{class:'btn', type:'button', onclick:()=>go('products')},'← Wróć do kreatora'));
    $app.innerHTML='';
    $app.appendChild(w);
  }

  // ====== Init ======
  function init(){
    $app = document.getElementById('app');
    if (!$app) return;

    let cfg = {};
    try { cfg = JSON.parse($app.getAttribute('data-endpoints') || '{}'); }
    catch(e){ cfg = {}; }

    const base = cfg.base || cfg.api || '';
    ep = {
      base,
      search: base ? `${base}/companies-search` : '',
      overview: base ? `${base}/company-overview` : '',
      catalog: base ? `${base}/catalog` : '',
      companyBilling: base ? `${base}/company-billing` : '' // opcjonalny; jeśli brak, kompensata wyjdzie 0
    };

    go('builder');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
