(() => {
  // ===== Endpoints =====
  const base = JSON.parse(document.getElementById('app').dataset.endpoints).base;
  const ep = {
    search: `${base}/companies-search`,
    owned: `${base}/company-products`,
    overview: `${base}/company-overview`,
    catalog: `${base}/catalog`,
    createQuote: `${base}/create-quote`,
    getQuote: `${base}/get-quote`,
    dealByCompany: `${base}/deal-by-company`,
    quotesForDeal: `${base}/deal-quotes`,
    quoteDetails: `${base}/quote-details`,
    owners: `${base}/owners`
  };

  // ===== App State =====
  const state = {
    company: null,
    catalog: null,
    overview: null,
    ownedMain: new Set(),                        // WPF/BUDZET/UMOWY/SWB
    selection: { main: new Set(), services: new Set() }, // zestawy wybranych kluczy
    global: { packageMode: true, tier: 'Tier1' },        // Tier1–Tier4, Pakiet
    lastQuote: null,
    router: { page: 'builder' },                // 'builder' | 'summary'
    context: { deal: null, owners: [] }         // dane dla strony podsumowania
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
  function fmtDate(val) { if (val===null||val===undefined||val==='') return '—'; const n=Number(val); const d=isNaN(n)?new Date(String(val)):new Date(n); return isNaN(d.getTime())?'—':d.toLocaleDateString('pl-PL'); }
  function bundleDiscount(c){ if(c>=4) return 900; if(c===3) return 600; if(c===2) return 300; return 0; }
  function computeDiscount(){
    const selectedCount = state.selection.main.size;
    if (state.global.packageMode) {
      const union = new Set([...state.ownedMain, ...state.selection.main]);
      return bundleDiscount(union.size);
    }
    return bundleDiscount(selectedCount);
  }
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

      // Tier firmy jeżeli zapisany w CRM – można użyć jako domyślny (opcjonalnie)
      if (overview?.company?.tier) state.global.tier = overview.company.tier;

      const ownedKeysFromProps = new Set((overview?.owned?.main||[]).map(x=>x.key));
      const ownedKeysFromDeals = new Set(ownedFromDeals?.ownedMainProducts||[]);
      state.ownedMain = new Set([...ownedKeysFromProps, ...ownedKeysFromDeals]);

      state.selection = { main: new Set(), services: new Set() };

      viewProductPicker();
    }catch(e){
      console.error('pickCompany', e);
      alert('Nie udało się pobrać danych firmy.');
    }
  }

  // ===== View 2: kreator (kafelki + ustawienia globalne) =====
  function viewProductPicker(){
    const wrap = h('div',{class:'view'});

    const title = h('h2',{}, `Firma: ${state.company.properties.name}`);
    if (state.overview?.company?.tier) title.appendChild(h('span',{class:'company-tier'}, ` · Tier CRM: ${state.overview.company.tier}`));
    wrap.appendChild(title);

    // Obecnie posiadane
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

    // Ustawienia globalne
    const settings = h('div',{class:'settings'});
    settings.appendChild(h('h3',{},'Ustawienia globalne'));

    const pkg = h('label',{class:'pkg'},
      (()=>{ const inp=h('input',{type:'checkbox'}); inp.checked = state.global.packageMode; inp.addEventListener('change',e=>{ state.global.packageMode = e.target.checked; renderSummary(); }); return inp; })(),
      ' Pakiet (licz rabat od posiadanych + nowych)'
    );
    settings.appendChild(pkg);

    const tierWrap = h('div',{class:'row-inline'});
    tierWrap.append(h('label',{},'Tier: '));
    const tierSel = h('select',{class:'select'});
    ['Tier1','Tier2','Tier3','Tier4'].forEach(t=>{
      const opt=h('option',{value:t},t);
      if (t===state.global.tier) opt.selected=true;
      tierSel.appendChild(opt);
    });
    tierSel.addEventListener('change',()=>{ state.global.tier = tierSel.value; });
    tierWrap.appendChild(tierSel);
    settings.appendChild(tierWrap);

    wrap.appendChild(settings);

    // Produkty główne — kafelki
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
        onClick: () => {
          if (selected) state.selection.services.delete(svc.key);
          else state.selection.services.add(svc.key);
          viewProductPicker();
        }
      });
      svcTiles.appendChild(tile);
    });
    wrap.append(h('h3',{},'Usługi'), svcTiles);

    // Podsumowanie (display) + CTA: Przejdź do podsumowania
    const summary = h('div',{class:'summary'});
    const toSummary = h('button',{class:'btn btn-secondary', onClick: async ()=>{
      await loadSummaryData();
      go('summary');
    }}, 'Przejdź do podsumowania');

    wrap.append(h('h3',{},'Podsumowanie'), summary, toSummary);

    $app.innerHTML='';
    $app.appendChild(wrap);
    renderSummary();
  }

  function buildTile({label, selected, owned, onClick}){
    const tile = h('button',{class:`tile ${selected?'tile--selected':''} ${owned?'tile--owned':''}`, type:'button'}, label);
    if (owned) tile.appendChild(h('span',{class:'pill pill--owned'},'Posiadany'));
    else if (selected) tile.appendChild(h('span',{class:'pill pill--selected'},'Wybrany'));
    if (!owned) tile.addEventListener('click', onClick);
    return tile;
  }

  function buildItemsPayload(){
    const items = [];
    // Produkty główne – jeden productId per moduł
    (state.catalog.mainProducts||[]).forEach(mp=>{
      if (state.selection.main.has(mp.key)) {
        if (mp.productId) items.push({ productId: mp.productId, qty: 1 });
      }
    });
    // Usługi (po 1 szt.)
    (state.catalog.services||[]).forEach(svc=>{
      if (state.selection.services.has(svc.key)) {
        if (svc.productId) items.push({ productId: svc.productId, qty: 1 });
      }
    });
    return items;
  }

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
      h('div',{}, `Rabat pakietowy: ${discount} PLN`)
    );
  }

  // ===== Summary page =====
  async function loadSummaryData(){
    // Używamy podanego pipeline ID: "default"
    const pipelineId = 'default';
    const dealResp = await api(`${ep.dealByCompany}?companyId=${encodeURIComponent(state.company.id)}&pipelineId=${encodeURIComponent(pipelineId)}`);
    state.context.deal = dealResp.deal;
    const ownersResp = await api(ep.owners);
    state.context.owners = ownersResp.owners || [];
  }

  function viewSummary(){
    const w = h('div',{class:'view'});
    w.appendChild(h('h2',{},'Podsumowanie'));

    const bar = h('div',{class:'summary-bar'});
    bar.append(
      h('button',{class:'btn btn-secondary', onClick:()=>go('builder')},'← Wróć do kreatora'),
      h('button',{class:'btn', onClick: async ()=>{ await loadSummaryData(); await renderQuotesList(container); }},'Odśwież')
    );
    w.appendChild(bar);

    const dealBox = h('div',{class:'card'});
    if (!state.context.deal) {
      dealBox.append(h('div',{},'Brak powiązanego deala w pipeline „default”.'));
    } else {
      const d = state.context.deal;
      dealBox.append(
        h('div',{}, `Deal: ${d.name} (ID: ${d.id})`),
        h('div',{}, `Pipeline: ${d.pipeline} · Stage: ${d.stage}`)
      );
    }
    w.appendChild(dealBox);

    const ownerWrap = h('div',{class:'row-inline'});
    ownerWrap.append(h('label',{},'Twórca Quote: '));
    const ownerSelect = h('select',{class:'select'});
    (state.context.owners||[]).forEach(o=>{
      const opt=h('option',{value:o.id},o.name);
      if (o.id === (state.context.deal?.ownerId || null)) opt.selected = true;
      ownerSelect.appendChild(opt);
    });
    ownerWrap.appendChild(ownerSelect);
    w.appendChild(ownerWrap);

    const container = h('div',{class:'accordion'});
    w.appendChild(container);

    const cta = h('button',{class:'btn', onClick: async ()=>{
      if (!state.context.deal) { alert('Brak deala – nie można utworzyć Quote.'); return; }
      const items = buildItemsPayload();
      const discount = computeDiscount();
      if (!items.length){ alert('Wybierz produkty/usługi w kreatorze.'); return; }
      try{
        const payload = {
          companyId: state.company.id,
          dealId: state.context.deal.id,
          ownerId: ownerSelect.value || state.context.deal.ownerId || undefined,
          items,
          discountPLN: discount,
          title: `Oferta – ${state.company.properties.name}`
          // Tier celowo NIE wysyłany do HS; używasz go później w automatyzacji dealowej
        };
        await api(ep.createQuote, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
        await renderQuotesList(container);
        alert('Quote utworzony.');
      }catch(e){ alert('Błąd tworzenia Quote: ' + e.message); }
    }}, 'Dodaj nowy Quote');
    w.appendChild(cta);

    $app.innerHTML='';
    $app.appendChild(w);
    renderQuotesList(container).catch(console.error);
  }

  async function renderQuotesList(container){
    container.innerHTML = '';
    if (!state.context.deal) return;
    const listResp = await api(`${ep.quotesForDeal}?dealId=${encodeURIComponent(state.context.deal.id)}`);
    const quotes = listResp.quotes || [];
    if (!quotes.length){ container.append(h('div',{class:'muted'},'Brak quote’ów na tym dealu.')); return; }
    for (const q of quotes){
      const sect = h('details',{class:'acc-item'});
      const sum  = h('summary',{}, `${q.name} · ${q.status}`);
      if (q.publicUrl) sum.append(' · ', h('a',{href:q.publicUrl,target:'_blank'},'otwórz'));
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
        let sumNet = 0, sumDisc = 0;
        items.forEach(it=>{
          sumNet += it.lineTotal;
          sumDisc += it.discountAmount || 0;
          const discTxt = it.discountAmount ? `-${it.discountAmount.toFixed(2)} PLN${it.discountPercent?` (${it.discountPercent}%)`:''}` : '—';
          table.append(rowLi(
            it.name,
            String(it.qty),
            (it.unitPrice||0).toFixed(2) + ' PLN',
            discTxt,
            (it.lineTotal||0).toFixed(2) + ' PLN'
          ));
        });
        body.append(table);

        const discountCalc = computeDiscount();
        const recomp = 0; // tu możesz w przyszłości wliczyć „rekompensatę”
        const grand = Math.max(0, sumNet - discountCalc - recomp);
        const totals = h('div',{class:'totals'},
          h('div',{}, `Suma pozycji: ${sumNet.toFixed(2)} PLN`),
          h('div',{}, `Rabat pakietowy: -${discountCalc.toFixed(2)} PLN`),
          h('div',{}, `Rekompensata: -${recomp.toFixed(2)} PLN`),
          h('div',{class:'totals-grand'}, `Razem: ${grand.toFixed(2)} PLN`)
        );
        body.append(totals);
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
