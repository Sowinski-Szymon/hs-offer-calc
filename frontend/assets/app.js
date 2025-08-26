(() => {
  let $app = null;
  let ep = {};

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

  const LABELS = {
    WPF: 'ePublink WPF',
    BUDZET: 'ePublink Budżet',
    UMOWY: 'ePublink Umowy',
    SWB: 'ePublink SWB'
  };
  const TIER_LABEL = { Tier1: 'Solo', Tier2: 'Plus', Tier3: 'Pro', Tier4: 'Max' };
  const TIER_CODE = { Solo: 'Tier1', Plus: 'Tier2', Pro: 'Tier3', Max: 'Tier4' };

  const state = {
    company: null,
    catalog: null,
    overview: null,
    ownedMain: new Set(),
    selection: { main: new Set(), services: new Set() },
    global: { packageMode: false, tier: 'Tier1', extraUsers: 0, startDate: null },
    router: { page: 'builder' },
    context: { deal: null, owners: [] }
  };

  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k,v] of Object.entries(attrs)) {
      if (k === 'class') el.className = v;
      else if (k === 'onclick' || k === 'onchange' || k === 'oninput') el[k] = v;
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
  function fmtDate(val) {
    if (!val) return '—';
    const d = new Date(isNaN(val) ? String(val) : Number(val));
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pl-PL');
  }
  function money(v){ return `${Number(v||0).toFixed(2)} PLN`; }
  function bundleDiscount(c){ if(c>=4) return 900; if(c===3) return 600; if(c===2) return 300; return 0; }
  function tierNice(code){ return TIER_LABEL[code] || code; }
  function getPrice(label, tierCodeStr){ const m=PRICING_MATRIX[label]; return m ? Number(m[tierCodeStr]||0) : 0; }

  function go(page){
    state.router.page = page;
    if (page === 'builder') viewCompanyPicker();
    if (page === 'summary') viewSummary();
  }

  // Widok 1: wybór firmy
  function viewCompanyPicker(){
    const input = h('input',{
      class:'inp',
      placeholder:'Szukaj firmy (min 2 litery)',
      style:'display:block;width:100%;max-width:640px;padding:12px;border:2px solid #2b6cb0;border-radius:8px;margin:12px 0;'
    });
    const list = h('div',{class:'list', style:'margin-top:8px;'});

    let t;
    input.oninput = ()=> {
      const q = input.value.trim();
      clearTimeout(t);
      t = setTimeout(async () => {
        if (q.length<2){ list.innerHTML=''; return; }
        try{
          const results = await api(`${ep.search}?query=${encodeURIComponent(q)}`);
          list.innerHTML = '';
          results.forEach(r=>{
            const row = h('div',{class:'row', style:'padding:10px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:8px;cursor:pointer;'}, r.properties.name||'Bez nazwy');
            row.onclick = ()=>pickCompany(r);
            list.appendChild(row);
          });
        }catch(e){
          list.innerHTML = '<div class="muted">Błąd wyszukiwania firm.</div>';
        }
      },300);
    };

    $app.innerHTML='';
    $app.append(
      h('div',{class:'view'},
        h('h2',{},'Wybierz firmę'),
        input,
        list
      )
    );
  }

  async function pickCompany(c){
    state.company = c;
    try{
      const [catalog, overview] = await Promise.all([
        api(ep.catalog),
        api(`${ep.overview}?companyId=${encodeURIComponent(c.id)}`)
      ]);
      state.catalog = catalog;
      state.overview = overview;
      state.ownedMain = new Set((overview?.owned?.main||[]).map(x=>x.key));

      state.global.packageMode = state.ownedMain.size > 0;
      state.global.startDate = new Date().toISOString().slice(0,10);

      viewProductPicker();
    }catch(e){
      alert('Nie udało się pobrać danych firmy.');
      go('builder');
    }
  }

  // Widok 2: kreator
  function viewProductPicker(){
    const wrap = h('div',{class:'view'});
    wrap.appendChild(h('h2',{}, `Firma: ${state.company.properties.name}`));

    if (state.overview) {
      const sec = h('div',{class:'owned'});
      sec.appendChild(h('h3',{},'Obecnie posiadane'));
      const list = h('div',{class:'owned-list'});
      (state.overview.owned?.main||[]).forEach(item=>{
        const label = LABELS[item.key] || item.key;
        const dateTxt = fmtDate(item.nextBillingDate);
        list.appendChild(h('div',{class:'owned-row'}, `${label} – ${dateTxt}`));
      });
      wrap.appendChild(sec);
    }

    const pkg = h('label',{}, 
      h('input',{type:'checkbox', onchange:(e)=>{ state.global.packageMode = e.target.checked; }}),
      ' Pakiet'
    );
    pkg.querySelector('input').checked = state.global.packageMode;
    wrap.appendChild(pkg);

    const dateInp = h('input',{type:'date', value: state.global.startDate});
    dateInp.onchange = ()=>{ state.global.startDate = dateInp.value; };
    wrap.appendChild(h('div',{}, 'Data startu: ', dateInp));

    const tierSel = h('select',{onchange:()=>{ state.global.tier = tierSel.value; }});
    ['Tier1','Tier2','Tier3','Tier4'].forEach(code=>{
      const opt=h('option',{value:code},tierNice(code));
      if(code===state.global.tier) opt.selected=true;
      tierSel.appendChild(opt);
    });
    wrap.appendChild(h('div',{}, 'Tier: ', tierSel));

    const extraInp = h('input',{type:'number',min:'0',value:String(state.global.extraUsers||0),oninput:()=>{state.global.extraUsers=Number(extraInp.value||0);} });
    wrap.appendChild(h('div',{}, 'Liczba dodatkowych użytkowników: ', extraInp));

    wrap.appendChild(h('button',{class:'btn', type:'button', onclick:()=>go('summary')},'Przejdź do podsumowania'));

    $app.innerHTML='';
    $app.appendChild(wrap);
  }

  // Widok 3: podsumowanie
  function viewSummary(){
    const w = h('div',{class:'view'});
    w.appendChild(h('h2',{},'Podsumowanie'));
    const back = h('button',{class:'btn', type:'button', onclick:()=>go('builder')},'← Wybierz inną firmę');
    w.appendChild(back);
    $app.innerHTML='';
    $app.appendChild(w);
  }

  function init() {
    $app = document.getElementById('app');
    const raw = $app.getAttribute('data-endpoints') || '{}';
    const endpointsObj = JSON.parse(raw);
    const base = endpointsObj.base || '';
    ep = {
      search: `${base}/companies-search`,
      overview: `${base}/company-overview`,
      catalog: `${base}/catalog`
    };
    go('builder');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
