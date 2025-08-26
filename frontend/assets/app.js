(() => {
  // ===== Endpoints =====
  const base = JSON.parse(document.getElementById('app').dataset.endpoints).base;
  const ep = {
    search: `${base}/companies-search`,
    owned: `${base}/company-products`,
    overview: `${base}/company-overview`,
    catalog: `${base}/catalog`,
    createQuote: `${base}/create-quote`,
    getQuote: `${base}/get-quote`
  };

  // ===== State =====
  const state = {
    company: null,
    catalog: null,
    overview: null,
    ownedMain: new Set(),              // klucze: WPF/BUDZET/UMOWY/SWB
    selection: { main: new Set(), services: new Set() }, // teraz booleany (Set kluczy)
    global: {                          // Ustawienia globalne
      packageMode: true,               // "Pakiet"
      tier: 'Solo',                    // Tier firmy
      extraUsers: 0                    // Dodatkowi użytkownicy
    },
    lastQuote: null
  };

  const $app = document.querySelector('#app');

  // ===== Utils =====
  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k,v] of Object.entries(attrs)) {
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (v !== null && v !== undefined) el.setAttribute(k, v);
    }
    children.flat().forEach(c => el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return el;
  }
  async function api(url, opts) { const r = await fetch(url, opts); if (!r.ok) throw new Error(await r.text()); return r.json(); }
  function fmtDate(val) { if (val === null || val === undefined || val === '') return '—'; const n = Number(val); const d = isNaN(n) ? new Date(String(val)) : new Date(n); return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pl-PL'); }
  function bundleDiscount(c){ if (c>=4) return 900; if (c===3) return 600; if (c===2) return 300; return 0; }
  function computeDiscount(){
    const selectedCount = state.selection.main.size;
    if (state.global.packageMode) {
      const union = new Set([...state.ownedMain, ...state.selection.main]);
      return bundleDiscount(union.size);
    }
    return bundleDiscount(selectedCount);
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
        }catch(e){ console.error(e); }
      },300);
    });
    $app.innerHTML='';
    $app.append(h('div',{class:'view'}, h('h2',{},'Wybierz firmę'), input, list));
  }

  // ===== After pick =====
  async function pickCompany(c){
    state.company = c;
    try{
      const [ownedFromDeals, catalog, overview] = await Promise.all([
        api(`${ep.owned}?companyId=${encodeURIComponent(c.id)}`),
        api(ep.catalog),
        api(`${ep.overview}?companyId=${encodeURIComponent(c.id)}`)
      ]);
      state.catalog = catalog;
      state.overview = overview;

      // Tier z firmy (jeśli jest) → globalnie
      if (overview?.company?.tier) state.global.tier = overview.company.tier;

      const ownedKeysFromProps = new Set((overview?.owned?.main||[]).map(x=>x.key));
      const ownedKeysFromDeals = new Set(ownedFromDeals?.ownedMainProducts||[]);
      state.ownedMain = new Set([...ownedKeysFromProps, ...ownedKeysFromDeals]);

      // reset wyborów
      state.selection = { main: new Set(), services: new Set() };
      // liczba userów globalnie domyślnie 0
      state.global.extraUsers = 0;

      viewProductPicker();
    }catch(e){
      console.error('pickCompany', e);
      alert('Nie udało się pobrać danych firmy.');
    }
  }

  // ===== View 2: kafelki + ustawienia globalne =====
  function viewProductPicker(){
    const wrap = h('div',{class:'view'});

    const title = h('h2',{}, `Firma: ${state.company.properties.name}`);
    if (state.overview?.company?.tier) title.appendChild(h('span',{class:'company-tier'}, ` · Tier: ${state.overview.company.tier}`));
    wrap.appendChild(title);

    // Obecnie posiadane (z datami)
    if (state.overview) {
      const sec = h('div',{class:'owned'});
      sec.appendChild(h('h3',{},'Obecnie posiadane'));
      const list = h('div',{class:'owned-list'});
      const labelMap = { WPF:'ePublink WPF', BUDZET:'ePublink Budżet', UMOWY:'ePublink Umowy', SWB:'ePublink SWB' };
      (state.overview.owned?.main||[]).forEach(item=>{
        const row = h('div',{class:'owned-row'},
          h('span',{class:'owned-name'}, `${labelMap[item.key]||item.key} · Tier: ${state.global.tier}`),
          h('span',{class:'owned-date'}, `Nast. rozliczenie: ${fmtDate(item.nextBillingDate)}`)
        );
        list.appendChild(row);
      });
      if (!list.children.length) list.appendChild(h('div',{class:'owned-empty'},'Brak posiadanych produktów/usług wg CRM.'));
      sec.appendChild(list);
      wrap.appendChild(sec);
    }

    // ===== Ustawienia globalne
    const settings = h('div',{class:'settings'});
    settings.appendChild(h('h3',{},'Ustawienia globalne'));

    // Pakiet
    const pkg = h('label',{class:'pkg'},
      (()=>{ const inp=h('input',{type:'checkbox'}); inp.checked = state.global.packageMode; inp.addEventListener('change',e=>{ state.global.packageMode = e.target.checked; renderSummary(); }); return inp; })(),
      ' Pakiet (licz rabat od posiadanych + nowych)'
    );
    settings.appendChild(pkg);

    // Tier (dla całej jednostki)
    const tierWrap = h('div',{class:'row-inline'});
    tierWrap.append(h('label',{},'Tier: '));
    const tierSel = h('select',{class:'select'});
    ['Solo','Plus','Pro','Max'].forEach(t=>{
      const opt=h('option',{value:t},t);
      if (t===state.global.tier) opt.selected=true;
      tierSel.appendChild(opt);
    });
    tierSel.addEventListener('change',()=>{ state.global.tier = tierSel.value; });
    tierWrap.appendChild(tierSel);
    settings.appendChild(tierWrap);

    // Dodatkowi użytkownicy (wykrywamy usługę qtySelectable i przenosimy tu)
    const extraSvc = (state.catalog.services||[]).find(s=>s.qtySelectable);
    const extraWrap = h('div',{class:'row-inline'});
    extraWrap.append(h('label',{}, extraSvc ? extraSvc.label : 'Dodatkowi użytkownicy'));
    const extraInp = h('input',{type:'number',min:'0',value:String(state.global.extraUsers||0),class:'qty'});
    extraInp.addEventListener('change',()=>{ const v = Number(extraInp.value||0); state.global.extraUsers = Math.max(0, v); });
    extraWrap.appendChild(extraInp);
    settings.appendChild(extraWrap);

    wrap.appendChild(settings);

    // ===== Produkty główne — kafelki
    const labelMap = { WPF:'ePublink WPF', BUDZET:'ePublink Budżet', UMOWY:'ePublink Umowy', SWB:'ePublink SWB' };
    const mainBar = h('div',{class:'tiles'});
    (state.catalog.mainProducts||[]).forEach(mp=>{
      const isOwned = state.ownedMain.has(mp.key);
      const isSelected = state.selection.main.has(mp.key);
      const tile = buildTile({
        label: labelMap[mp.key] || mp.key,
        selected: isOwned || isSelected,
        owned: isOwned,
        onClick: () => {
          if (isOwned) return; // blokada
          if (state.selection.main.has(mp.key)) state.selection.main.delete(mp.key);
          else state.selection.main.add(mp.key);
          viewProductPicker(); // szybki rerender sekcji
        }
      });
      mainBar.appendChild(tile);
    });
    wrap.append(h('h3',{},'Produkty główne'), mainBar);

    // ===== Usługi — kafelki (bez tej od extra users)
    const svcTiles = h('div',{class:'tiles'});
    (state.catalog.services||[]).filter(s=>!s.qtySelectable).forEach(svc=>{
      const selected = state.selection.services.has(svc.key);
      const tile = buildTile({
        label: svc.label,
        selected,
        owned: false,
        onClick: () => {
          if (selected) state.selection.services.delete(svc.key);
          else state.selection.services.add(svc.key);
          viewProductPicker();
        }
      });
      svcTiles.appendChild(tile);
    });
    wrap.append(h('h3',{},'Usługi'), svcTiles);

    // ===== Podsumowanie + CTA
    const summary = h('div',{class:'summary'});
    const btn = h('button',{class:'btn', onClick: async()=>{ await createQuote(summary); }}, 'Generuj ofertę (Quote)');
    wrap.append(h('h3',{},'Podsumowanie'), summary, btn);

    $app.innerHTML='';
    $app.appendChild(wrap);
    renderSummary();
  }

  // ===== Kafelek bazowy =====
  function buildTile({label, selected, owned, onClick}){
    const tile = h('button',{class:`tile ${selected?'tile--selected':''} ${owned?'tile--owned':''}`, type:'button'}, label);
    if (owned) tile.appendChild(h('span',{class:'pill pill--owned'},'Posiadany'));
    else if (selected) tile.appendChild(h('span',{class:'pill pill--selected'},'Wybrany'));
    if (!owned) tile.addEventListener('click', onClick);
    return tile;
  }

  // ===== Payload do quote =====
  function buildItemsPayload(){
    const items = [];
    // Produkty główne → productId wg global.tier
    (state.catalog.mainProducts||[]).forEach(mp=>{
      if (state.selection.main.has(mp.key)) {
        const tier = state.global.tier;
        const pid = mp.tiers?.[tier]?.productId;
        if (pid) items.push({ productId: pid, qty: 1 });
      }
    });
    // Usługi (zwykłe)
    (state.catalog.services||[]).filter(s=>!s.qtySelectable).forEach(svc=>{
      if (state.selection.services.has(svc.key)) items.push({ productId: svc.productId, qty: 1 });
    });
    // Dodatkowi użytkownicy — z ustawień globalnych
    const extraSvc = (state.catalog.services||[]).find(s=>s.qtySelectable);
    if (extraSvc && state.global.extraUsers>0) {
      items.push({ productId: extraSvc.productId, qty: state.global.extraUsers });
    }
    return items;
  }

  // ===== Podsumowanie =====
  function renderSummary(){
    const s = document.querySelector('.summary');
    if (!s) return;
    const selectedMain = [...state.selection.main.values()];
    const discount = computeDiscount();
    s.innerHTML = '';
    s.append(
      h('div',{}, `Wybrane produkty główne: ${selectedMain.join(', ') || '–'}`),
      h('div',{}, `Tryb: ${state.global.packageMode ? 'Pakiet (posiadane + nowe)' : 'Tylko nowe'}`),
      h('div',{}, `Tier (globalny): ${state.global.tier}`),
      h('div',{}, `Dodatkowi użytkownicy: ${state.global.extraUsers}`),
      h('div',{}, `Rabat pakietowy: ${discount} PLN`)
    );
  }

  // ===== Quote =====
  async function createQuote(summaryEl){
    const items = buildItemsPayload();
    const discount = computeDiscount();
    if (!items.length) { alert('Wybierz co najmniej jeden produkt lub usługę.'); return; }
    summaryEl.classList.add('loading');
    try{
      const payload = {
        companyId: state.company.id,
        items,
        discountPLN: discount,
        title: `Oferta – ${state.company.properties.name}`
      };
      const res = await api(ep.createQuote, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      state.lastQuote = res;
      const url = res.properties?.hs_public_url;
      summaryEl.innerHTML='';
      summaryEl.append(
        h('div',{class:'ok'},'Oferta utworzona.'),
        url ? h('a',{href:url,target:'_blank',rel:'noopener'},'Otwórz publiczny link') : h('div',{},'Publiczny link pojawi się po publikacji w HubSpot.'),
        h('div',{},'Podgląd (API):'),
        h('a',{href:`${ep.getQuote}?quoteId=${encodeURIComponent(res.quoteId)}`,target:'_blank'},'JSON podgląd')
      );
    }catch(e){
      console.error(e);
      alert('Błąd generowania oferty: ' + e.message);
    }finally{
      summaryEl.classList.remove('loading');
    }
  }

  // start
  viewCompanyPicker();
})();
