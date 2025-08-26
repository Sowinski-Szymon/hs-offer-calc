(() => {
  // ===== Endpoints =====
  const base = JSON.parse(document.getElementById('app').dataset.endpoints).base;
  const ep = {
    search: `${base}/companies-search`,
    owned: `${base}/company-products`,
    overview: `${base}/company-overview`,
    companyBilling: `${base}/company-billing`,
    catalog: `${base}/catalog`,
    createQuote: `${base}/create-quote`,
    getQuote: `${base}/get-quote`,
    dealByCompany: `${base}/deal-by-company`,
    quotesForDeal: `${base}/deal-quotes`,
    quoteDetails: `${base}/quote-details`,
    owners: `${base}/owners`
  };

  // ===== Pricing =====
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

  // ===== Etykiety =====
  const LABELS = {
    WPF: 'ePublink WPF',
    BUDZET: 'ePublink Budżet',
    UMOWY: 'ePublink Umowy',
    SWB: 'ePublink SWB'
  };
  const TIER_LABEL = { Tier1: 'Solo', Tier2: 'Plus', Tier3: 'Pro', Tier4: 'Max' };
  const TIER_CODE = { Solo: 'Tier1', Plus: 'Tier2', Pro: 'Tier3', Max: 'Tier4' };

  // ===== State =====
  const state = {
    company: null,
    catalog: null,
    overview: null,
    ownedMain: new Set(),
    selection: { main: new Set(), services: new Set() },
    global: { packageMode: false, tier: 'Tier1', extraUsers: 0, startDate: null },
    billing: { isPackageOnCompany: false, lastNet: {} },
    router: { page: 'builder' },
    context: { deal: null, owners: [] }
  };

  const $app = document.querySelector('#app');

  // ===== Utils =====
  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k,v] of Object.entries(attrs)) {
      if (k === 'class') el.className = v;
      else if (k === 'onclick' || k === 'onchange' || k === 'oninput' || k === 'onsubmit') el.addEventListener(k.slice(2), v);
      else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v); // fallback
      else if (v !== null && v !== undefined) el.setAttribute(k, v);
    }
    children.flat().forEach(c => el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return el;
  }
  async function api(url, opts) {
    const r = await fetch(url, opts);
    if (!r.ok) throw new Error(await r.text().catch(()=>String(r.status)));
    return r.json();
  }
  function fmtDate(val) { if (val===null||val===undefined||val==='') return '—'; const n=Number(val); const d=isNaN(n)?new Date(String(val)):new Date(n); return isNaN(d.getTime())?'—':d.toLocaleDateString('pl-PL'); }
  function money(v){ return `${Number(v||0).toFixed(2)} PLN`; }
  function bundleDiscount(c){ if(c>=4) return 900; if(c===3) return 600; if(c===2) return 300; return 0; }
  function tierNice(code){ return TIER_LABEL[code] || code; }
  function getPrice(label, tierCodeStr){ const m=PRICING_MATRIX[label]; return m ? Number(m[tierCodeStr]||0) : 0; }

  function go(page){
    state.router.page = page;
    if (page === 'builder') viewCompanyPicker();
    if (page === 'summary') viewSummary();
  }

  // ===== View 1: wybór firmy =====
  function viewCompanyPicker(){
    const input = h('input',{class:'inp',placeholder:'Szukaj firmy (min 2 litery)'});
    const list = h('div',{class:'list'});
    let t;
    input.addEventListener('input',()=> {
      const q = input.value.trim();
      clearTimeout(t);
      t = setTimeout(async () => {
        if (q.length<2){ list.innerHTML=''; return; }
        try{
          const results = await api(`${ep.search}?query=${encodeURIComponent(q)}`);
          list.innerHTML = '';
          results.forEach(r=>{
            const row = h('div',{class:'row'}, `${r.properties.name||'Bez nazwy'}${r.properties.domain?' · '+r.properties.domain:''}`);
            row.addEventListener('click',()=>pickCompany(r));
            list.appendChild(row);
          });
        }catch(e){ console.error('companies-search', e); }
      },300);
    });
    $app.innerHTML='';
    $app.append(h('div',{class:'view'}, h('h2',{},'Wybierz firmę'), input, list));
  }

  // ===== After pick =====
  async function pickCompany(c){
    state.company = c;
    try{
      const [ownedFromDeals, catalog, overview, billing] = await Promise.all([
        api(`${ep.owned}?companyId=${encodeURIComponent(c.id)}`),
        api(ep.catalog),
        api(`${ep.overview}?companyId=${encodeURIComponent(c.id)}`),
        api(`${ep.companyBilling}?companyId=${encodeURIComponent(c.id)}`)
      ]);
      state.catalog = catalog;
      state.overview = overview;
      state.billing = billing || { isPackageOnCompany:false, lastNet:{} };

      // Tier z CRM (ładne nazwy) → mapuj na Tier1..4, jeśli dostępny
      if (overview?.company?.tier) {
        const crm = overview.company.tier;
        state.global.tier = TIER_CODE[crm] || state.global.tier;
      }

      const ownedKeysFromProps = new Set((overview?.owned?.main||[]).map(x=>x.key));
      const ownedKeysFromDeals = new Set(ownedFromDeals?.ownedMainProducts||[]);
      state.ownedMain = new Set([...ownedKeysFromProps, ...ownedKeysFromDeals]);

      // Pakiet domyślnie ON, jeśli firma ma ≥1 posiadany produkt
      state.global.packageMode = state.ownedMain.size > 0;

      // Data startu – domyślnie dziś (yyyy-mm-dd)
      const today = new Date();
      state.global.startDate = today.toISOString().slice(0,10);

      state.selection = { main: new Set(), services: new Set() };
      state.global.extraUsers = 0;

      viewProductPicker();
    }catch(e){
      console.error('pickCompany', e);
      alert('Nie udało się pobrać danych firmy.');
    }
  }

  // ===== Kompensata (tylko gdy Pakiet=ON) =====
  function daysBetweenISO(startISO, endVal){
    if(!startISO || !endVal) return 0;
    const s = new Date(startISO+'T00:00:00');
    const e = typeof endVal==='number' ? new Date(endVal) : new Date(String(endVal));
    const diff = Math.ceil((e - s) / (1000*60*60*24));
    return Math.max(0, diff);
  }

  function computeCompensation(){
    if (!state.global.packageMode) return 0; // tylko przy pakiecie
    const startISO = state.global.startDate;
    if (!startISO) return 0;

    const ov = state.overview || {};
    const lastNet = state.billing?.lastNet || {};
    const isPkgOnCompany = !!state.billing?.isPackageOnCompany;

    // Daty końca subskrypcji per moduł
    const nextDates = {
      WPF:    ov?.owned?.main?.find(x=>x.key==='WPF')?.nextBillingDate || ov?.company?.wpf_next_billing_date,
      BUDZET: ov?.owned?.main?.find(x=>x.key==='BUDZET')?.nextBillingDate || ov?.company?.best_next_billing_date,
      UMOWY:  ov?.owned?.main?.find(x=>x.key==='UMOWY')?.nextBillingDate || ov?.company?.umowy_next_billing_date,
      SWB:    ov?.owned?.main?.find(x=>x.key==='SWB')?.nextBillingDate || ov?.company?.swb_next_billing_date
    };

    // Dzielnik: 364 (wg Twojej specyfikacji)
    const D = 364;

    if (isPkgOnCompany) {
      const net = Number(lastNet.package || 0);
      const packEnd = ov?.company?.packNextBillingDate || ov?.company?.pack_next_billing_date || null;
      if (!net || !packEnd) return 0;
      const days = daysBetweenISO(startISO, packEnd);
      return (net / D) * days;
    }

    // Firma nie jest w pakiecie → sumuj per posiadany moduł
    let sum = 0;
    for (const key of state.ownedMain) {
      const net = Number(lastNet[key] || 0);
      const end = nextDates[key];
      if (!net || !end) continue;
      const days = daysBetweenISO(startISO, end);
      sum += (net / D) * days;
    }
    return sum;
  }

  // ===== View 2: kreator =====
  function viewProductPicker(){
    const wrap = h('div',{class:'view'});

    const title = h('h2',{}, `Firma: ${state.company.properties.name}`);
    title.appendChild(h('span',{class:'company-tier'}, ` · ${tierNice(state.global.tier)}`));
    wrap.appendChild(title);

    // Obecnie posiadane
    if (state.overview) {
      const sec = h('div',{class:'owned'});
      sec.appendChild(h('h3',{},'Obecnie posiadane'));
      const list = h('div',{class:'owned-list'});
      (state.overview.owned?.main||[]).forEach(item=>{
        const lab = LABELS[item.key] || item.key;
        const row = h('div',{class:'owned-row'},
          h('span',{class:'owned-name'}, `${lab}`),
          h('span',{class:'owned-date'}, `Nast. rozliczenie: ${fmtDate(item.nextBillingDate)}`)
        );
        list.appendChild(row);
      });
      if (!list.children.length) list.appendChild(h('div',{class:'owned-empty'},'Brak posiadanych produktów wg CRM.'));
      sec.appendChild(list);
      wrap.appendChild(sec);
    }

    // Ustawienia globalne
    const settings = h('div',{class:'settings'});
    settings.appendChild(h('h3',{},'Ustawienia globalne'));

    // Pakiet
    const pkg = h('label',{class:'pkg'});
    const pkgInp = h('input',{type:'checkbox'});
    pkgInp.checked = state.global.packageMode;
    pkgInp.addEventListener('change', (e)=>{ state.global.packageMode = e.target.checked; renderSummary(); });
    pkg.appendChild(pkgInp);
    pkg.appendChild(document.createTextNode(' Pakiet (licz rabat od posiadanych + nowych)'));
    settings.appendChild(pkg);

    // Data startu
    const dateWrap = h('div',{class:'row-inline'});
    dateWrap.append(h('label',{}, 'Data startu:'));
    const dateInp = h('input',{type:'date', value: state.global.startDate || ''});
    dateInp.addEventListener('change', ()=>{ state.global.startDate = dateInp.value || null; renderSummary(); });
    dateWrap.appendChild(dateInp);
    settings.appendChild(dateWrap);

    // Tier
    const tierWrap = h('div',{class:'row-inline'});
    tierWrap.append(h('label',{},'Tier: '));
    const tierSel = h('select',{class:'select'});
    ['Tier1','Tier2','Tier3','Tier4'].forEach(code=>{
      const opt=h('option',{value:code}, tierNice(code));
      if (code===state.global.tier) opt.selected=true;
      tierSel.appendChild(opt);
    });
    tierSel.addEventListener('change', ()=>{ state.global.tier = tierSel.value; renderSummary(); });
    tierWrap.appendChild(tierSel);
    settings.appendChild(tierWrap);

    // Dodatkowi użytkownicy
    const extraWrap = h('div',{class:'row-inline'});
    extraWrap.append(h('label',{}, 'Liczba dodatkowych użytkowników:'));
    const extraInp = h('input',{type:'number',min:'0',value:String(state.global.extraUsers||0),class:'qty'});
    extraInp.addEventListener('input', ()=>{ const v = Number(extraInp.value||0); state.global.extraUsers = Math.max(0, v); renderSummary(); });
    extraWrap.appendChild(extraInp);
    settings.appendChild(extraWrap);

    wrap.appendChild(settings);

    // Produkty główne — kafelki
    const mainBar = h('div',{class:'tiles'});
    (state.catalog.mainProducts||[]).forEach(mp=>{
      const isOwned = state.ownedMain.has(mp.key);
      const isSelected = state.selection.main.has(mp.key);
      const tile = buildTile({
        label: LABELS[mp.key] || mp.key,
        selected: isOwned || isSelected,
        owned: isOwned,
        onclick: () => {
          if (isOwned) return;
          if (state.selection.main.has(mp.key)) state.selection.main.delete(mp.key);
          else state.selection.main.add(mp.key);
          viewProductPicker();
        }
      });
      mainBar.appendChild(tile);
    });
    wrap.append(h('h3',{},'Produkty główne'), mainBar);

    // Usługi — kafelki
    const svcTiles = h('div',{class:'tiles'});
    (state.catalog.services||[]).forEach(svc=>{
      const selected = state.selection.services.has(svc.key);
      const tile = buildTile({
        label: svc.label,
        selected,
        owned: false,
        onclick: () => {
          if (selected) state.selection.services.delete(svc.key);
          else state.selection.services.add(svc.key);
          viewProductPicker();
        }
      });
      svcTiles.appendChild(tile);
    });
    wrap.append(h('h3',{},'Usługi'), svcTiles);

    // Podsumowanie (na kreatorze)
    const summaryBox = h('div',{class:'summary'});
    wrap.append(h('h3',{},'Podsumowanie (estymacja)'), summaryBox);

    // CTA: Przejdź do podsumowania
    const toSummary = h('button',{ class:'btn btn-secondary', type:'button', onclick: ()=>{ go('summary'); } }, 'Przejdź do podsumowania');
    wrap.append(toSummary);

    $app.innerHTML='';
    $app.appendChild(wrap);
    renderSummary();
  }

  function buildTile({label, selected, owned, onclick}){
    const tile = h('button',{class:`tile ${selected?'tile--selected':''} ${owned?'tile--owned':''}`, type:'button', onclick}, label);
    if (owned) tile.appendChild(h('span',{class:'pill pill--owned'},'Posiadany'));
    else if (selected) tile.appendChild(h('span',{class:'pill pill--selected'},'Wybrany'));
    return tile;
  }

  // RENDER podsumowania (na kreatorze)
  function renderSummary(){
    const box = document.querySelector('.summary');
    if (!box) return;
    box.innerHTML = '';

    const tier = state.global.tier;
    const selectedMainLabels = [...state.selection.main.values()].map(k => LABELS[k] || k);
    const selectedMainTotal = selectedMainLabels.reduce((s,lab)=> s + getPrice(lab, tier), 0);
    const selectedServicesLabels = [...state.selection.services.values()];
    const selectedServicesTotal = selectedServicesLabels.reduce((s,lab)=> s + getPrice(lab, tier), 0);
    const extraUsersQty = Number(state.global.extraUsers || 0);
    const extraUsersUnit = Number(EXTRA_USER_PRICES[tier] || 0);
    const extraUsersTotal = extraUsersQty * extraUsersUnit;

    if (state.global.packageMode) {
      const unionCount = new Set([...state.ownedMain, ...state.selection.main]).size;
      const discount = bundleDiscount(unionCount);
      const compensation = computeCompensation();
      const payable = Math.max(0, selectedMainTotal + selectedServicesTotal + extraUsersTotal - discount + compensation);

      const totals = h('div',{class:'totals'},
        h('div',{}, `Nowe moduły (łącznie): ${money(selectedMainTotal)}`),
        h('div',{}, `Usługi (łącznie): ${money(selectedServicesTotal)}`),
        h('div',{}, `Dodatkowi użytkownicy: ${extraUsersQty} × ${money(extraUsersUnit)} = ${money(extraUsersTotal)}`),
        h('div',{}, `Rabat pakietowy: -${money(discount)}`),
        h('div',{}, `Rekompensata: +${money(compensation)}`),
        h('div',{class:'totals-grand'}, `Razem (est.): ${money(payable)}`)
      );
      box.append(totals);
      return;
    }

    // Pakiet OFF -> rozbicie
    const list = h('div', { class: 'li-table' });
    list.append(rowLi('Pozycja', 'Qty', 'Cena jedn.', 'Rabat', 'Suma', true));

    selectedMainLabels.forEach(lab=>{
      const price = getPrice(lab, tier);
      list.append(rowLi(lab, '1', money(price), '—', money(price)));
    });
    selectedServicesLabels.forEach(lab=>{
      const price = getPrice(lab, tier);
      list.append(rowLi(lab, '1', money(price), '—', money(price)));
    });
    if (extraUsersQty > 0){
      list.append(rowLi('Dodatkowi użytkownicy', String(extraUsersQty), money(extraUsersUnit), '—', money(extraUsersTotal)));
    }
    box.append(list);

    const discount = bundleDiscount(state.selection.main.size);
    const payable = Math.max(0, selectedMainTotal + selectedServicesTotal + extraUsersTotal - discount);
    const sums = h('div',{class:'totals'},
      h('div',{}, `Rabat pakietowy (tylko nowe): -${money(discount)}`),
      h('div',{class:'totals-grand'}, `Razem (est.): ${money(payable)}`)
    );
    box.append(sums);

    function rowLi(a,b,c,d,e,head=false){
      const r = h('div',{class:'li-row'+(head?' li-head':'')});
      r.append(h('div',{},a),h('div',{},b),h('div',{},c),h('div',{},d),h('div',{},e));
      return r;
    }
  }

  // ===== Summary page =====
  async function loadSummaryData(){
    const pipelineId = 'default';
    const dealResp = await api(`${ep.dealByCompany}?companyId=${encodeURIComponent(state.company.id)}&pipelineId=${encodeURIComponent(pipelineId)}`);
    state.context.deal = dealResp.deal;
    const ownersResp = await api(ep.owners);
    state.context.owners = ownersResp.owners || [];
  }

  function viewSummary(){
    const w = h('div',{class:'view'});
    w.appendChild(h('h2',{},'Podsumowanie'));

    const container = h('div',{class:'accordion'});

    const bar = h('div',{class:'summary-bar'});
    bar.append(
      h('button',{class:'btn btn-secondary', type:'button', onclick:()=>go('builder')},'← Wróć do kreatora'),
      h('button',{class:'btn', type:'button', onclick: async ()=>{
        try{
          await loadSummaryData();
          await renderQuotesList(container);
        }catch(e){ console.warn('refresh summary error:', e?.message||e); }
      }},'Odśwież')
    );
    w.appendChild(bar);

    const dealBox = h('div',{class:'card'}, h('div',{},'Ładowanie informacji o dealu…'));
    w.appendChild(dealBox);

    const ownerWrap = h('div',{class:'row-inline'});
    ownerWrap.append(h('label',{},'Twórca Quote: '));
    const ownerSelect = h('select',{class:'select'});
    ownerWrap.appendChild(ownerSelect);
    w.appendChild(ownerWrap);

    w.appendChild(container);

    const cta = h('button',{class:'btn', type:'button', onclick: async ()=>{
      if (!state.context.deal) { alert('Brak deala – nie można utworzyć Quote.'); return; }
      const items = buildItemsPayload();
      const discount = state.global.packageMode
        ? bundleDiscount(new Set([...state.ownedMain, ...state.selection.main]).size)
        : bundleDiscount(state.selection.main.size);
      if (!items.length){ alert('Wybierz produkty/usługi w kreatorze.'); return; }
      try{
        const payload = {
          companyId: state.company.id,
          dealId: state.context.deal.id,
          ownerId: ownerSelect.value || state.context.deal.ownerId || undefined,
          items,
          discountPLN: discount,
          title: `Oferta – ${state.company.properties.name}`
        };
        await api(ep.createQuote, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
        await renderQuotesList(container);
        alert('Quote utworzony.');
      }catch(e){ alert('Błąd tworzenia Quote: ' + e.message); }
    }}, 'Dodaj nowy Quote');
    w.appendChild(cta);

    $app.innerHTML='';
    $app.appendChild(w);

    // dociągnij dane po przejściu
    (async () => {
      try{
        await loadSummaryData();
        dealBox.innerHTML = '';
        if (!state.context.deal) {
          dealBox.append(h('div',{},'Brak powiązanego deala w pipeline „default”.'));
        } else {
          const d = state.context.deal;
          dealBox.append(
            h('div',{}, `Deal: ${d.name} (ID: ${d.id})`),
            h('div',{}, `Pipeline: ${d.pipeline} · Stage: ${d.stage}`)
          );
        }
        ownerSelect.innerHTML = '';
        (state.context.owners||[]).forEach(o=>{
          const opt=h('option',{value:o.id},o.name);
          if (o.id === (state.context.deal?.ownerId || null)) opt.selected = true;
          ownerSelect.appendChild(opt);
        });
        await renderQuotesList(container);
      }catch(e){
        console.warn('initial summary load error:', e?.message||e);
        dealBox.innerHTML = '';
        dealBox.append(h('div',{class:'muted'}, 'Nie udało się załadować informacji o dealu.'));
      }
    })();
  }

  function buildItemsPayload(){
    const items = [];
    (state.catalog.mainProducts||[]).forEach(mp=>{
      if (state.selection.main.has(mp.key)) {
        if (mp.productId) items.push({ productId: mp.productId, qty: 1 });
      }
    });
    (state.catalog.services||[]).forEach(svc=>{
      if (state.selection.services.has(svc.key)) {
        if (svc.productId) items.push({ productId: svc.productId, qty: 1 });
      }
    });
    const extraUsers = Number(state.global.extraUsers||0);
    if (extraUsers > 0) {
      items.push({ productId: EXTRA_USER_PRODUCT_ID, qty: extraUsers });
    }
    return items;
  }

  async function renderQuotesList(container){
    container.innerHTML = '';
    if (!state.context.deal) return;
    let quotes = [];
    try{
      const listResp = await api(`${ep.quotesForDeal}?dealId=${encodeURIComponent(state.context.deal.id)}`);
      quotes = listResp.quotes || [];
    }catch(e){
      container.append(h('div',{class:'muted'},'Nie udało się pobrać listy quote’ów.'));
      return;
    }
    if (!quotes.length){ container.append(h('div',{class:'muted'},'Brak quote’ów na tym dealu.')); return; }

    for (const q of quotes){
      const sect = h('details',{class:'acc-item'});
      const sum  = h('summary',{}, `${q.name} · ${q.status}`);
      if (q.publicUrl) sum.append(' · ', h('a',{href:q.publicUrl,target:'_blank', rel:'noopener'},'otwórz'));
      const body = h('div',{class:'acc-body'}, h('div',{},'Ładowanie pozycji...'));
      sect.append(sum, body);
      container.appendChild(sect);

      try{
        const det = await api(`${ep.quoteDetails}?quoteId=${encodeURIComponent(q.id)}`);
        const items = det.items || [];
        body.innerHTML='';
        if (!items.length){ body.append(h('div',{class:'muted'},'Brak pozycji.')); continue; }

        const table = h('div',{class:'li-table'});
        table.append(rowLi('Nazwa','Qty','Cena jedn.','Rabat','Suma linii', true));
        items.forEach(it=>{
          const discTxt = it.discountAmount ? `-${Number(it.discountAmount).toFixed(2)} PLN${it.discountPercent?` (${it.discountPercent}%)`:''}` : '—';
          table.append(rowLi(
            it.name,
            String(it.qty),
            (Number(it.unitPrice||0).toFixed(2)) + ' PLN',
            discTxt,
            (Number(it.lineTotal||0).toFixed(2)) + ' PLN'
          ));
        });
        body.append(table);
      }catch(e){
        body.innerHTML='';
        body.append(h('div',{class:'muted'},'Nie udało się pobrać pozycji Quote.'));
      }
    }

    function rowLi(a,b,c,d,e,head=false){
      const r = h('div',{class:'li-row'+(head?' li-head':'')});
      r.append(h('div',{},a),h('div',{},b),h('div',{},c),h('div',{},d),h('div',{},e));
      return r;
    }
  }

  // start
  go('builder');
})();
