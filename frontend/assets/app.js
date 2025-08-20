(() => {
  const base = JSON.parse(document.getElementById('app').dataset.endpoints).base;
  const ep = {
    search: `${base}/companies-search`,
    owned: `${base}/company-products`,
    overview: `${base}/company-overview`,
    catalog: `${base}/catalog`,
    createQuote: `${base}/create-quote`,
    getQuote: `${base}/get-quote`
  };

  const state = {
    company: null,
    catalog: null,
    ownedMain: new Set(),
    overview: null,
    selection: { main: new Map(), services: new Map() },
    discountMode: 'TOTAL_AFTER_UPSELL',
    lastQuote: null
  };

  const $app = document.querySelector('#app');

  // === utils ===
  function h(tag, attrs = {}, ...children) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v;
      else if (k.startsWith('on')) n.addEventListener(k.substring(2), v);
      else n.setAttribute(k, v);
    }
    children.flat().forEach(c => n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return n;
  }
  async function api(url, opts) {
    const r = await fetch(url, opts);
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }
  function bundleDiscount(c) { if (c >= 4) return 900; if (c === 3) return 600; if (c === 2) return 300; return 0; }
  function computeDiscount() {
    const selectedKeys = new Set([...state.selection.main.keys()].filter(k => state.selection.main.get(k)));
    const unionCount = new Set([...state.ownedMain, ...selectedKeys]).size;
    const effective = state.discountMode === 'TOTAL_AFTER_UPSELL' ? unionCount : selectedKeys.size;
    return bundleDiscount(effective);
  }
  function fmtDateFromMsOrIso(val) {
    if (!val && val !== 0) return '—';
    const num = Number(val);
    const d = isNaN(num) ? new Date(String(val)) : new Date(num);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('pl-PL');
  }

  // === wybór firmy ===
  function viewCompanyPicker() {
    const input = h('input', { class: 'inp', placeholder: 'Szukaj firmy (min 2 litery)' });
    const list = h('div', { class: 'list' });
    let t;
    input.addEventListener('input', () => {
      const q = input.value.trim();
      clearTimeout(t);
      t = setTimeout(async () => {
        if (q.length < 2) { list.innerHTML = ''; return; }
        try {
          const results = await api(`${ep.search}?query=${encodeURIComponent(q)}`);
          list.innerHTML = '';
          results.forEach(r => {
            const row = h('div', { class: 'row' },
              `${r.properties.name || 'Bez nazwy'}${r.properties.domain ? ' · ' + r.properties.domain : ''}`);
            row.addEventListener('click', () => pickCompany(r));
            list.appendChild(row);
          });
        } catch (e) {
          console.error('companies-search error', e);
        }
      }, 250);
    });
    $app.innerHTML = '';
    $app.append(h('div', { class: 'view' }, h('h2', {}, 'Wybierz firmę'), input, list));
  }

  async function pickCompany(c) {
    state.company = c;
    try {
      const [ownedFromDeals, catalog, overview] = await Promise.all([
        api(`${ep.owned}?companyId=${encodeURIComponent(c.id)}`),
        api(ep.catalog),
        api(`${ep.overview}?companyId=${encodeURIComponent(c.id)}`)
      ]);
      state.catalog = catalog;
      state.overview = overview;

      const ownedKeysFromProps = new Set((overview?.owned?.main || []).map(x => x.key));
      const ownedKeysFromDeals = new Set(ownedFromDeals?.ownedMainProducts || []);
      state.ownedMain = new Set([...ownedKeysFromProps, ...ownedKeysFromDeals]);

      state.selection = { main: new Map(), services: new Map() };
      viewProductPicker();
    } catch (e) {
      console.error('pickCompany error', e);
      alert('Nie udało się pobrać danych firmy. Sprawdź konsolę.');
    }
  }

  // === produkty + usługi + obecne ===
  function viewProductPicker() {
    const wrap = h('div', { class: 'view' });
    wrap.appendChild(h('h2', {}, `Firma: ${state.company.properties.name}`));

    // --- obecnie posiadane ---
    if (state.overview) {
      const sec = h('div', { class: 'owned' });
      sec.appendChild(h('h3', {}, 'Obecnie posiadane'));

      const list = h('div', { class: 'owned-list' });
      const labelMap = { WPF: 'ePublink WPF', BUDZET: 'ePublink Budżet', UMOWY: 'ePublink Umowy', SWB: 'ePublink SWB' };

      (state.overview.owned?.main || []).forEach(item => {
        const title = labelMap[item.key] || item.key;
        const tier = item.tier ? ` · Tier: ${item.tier}` : '';
        const dateTxt = fmtDateFromMsOrIso(item.nextBillingDate);
        list.appendChild(
          h('div', { class: 'owned-row' },
            h('span', { class: 'owned-name' }, `${title}${tier}`),
            h('span', { class: 'owned-date' }, `Nast. rozliczenie: ${dateTxt}`)
          )
        );
      });

      (state.overview.owned?.services || []).forEach(svcKey => {
        list.appendChild(
          h('div', { class: 'owned-row' },
            h('span', { class: 'owned-name' }, `Usługa: ${svcKey}`)
          )
        );
      });

      if (!list.children.length) list.appendChild(h('div', { class: 'owned-empty' }, 'Brak posiadanych produktów/usług wg CRM.'));
      sec.appendChild(list);
      wrap.appendChild(sec);
    }
    // --- /obecnie posiadane ---

    // Produkty główne
    const mainGrid = h('div', { class: 'grid' });
    state.catalog.mainProducts.forEach(mp => {
      const card = h('div', { class: 'card' });
      const title = h('div', { class: 'card-h' }, mp.label, state.ownedMain.has(mp.key) ? h('span', { class: 'badge' }, 'Posiadany') : '');
      card.appendChild(title);

      const radios = h('div', { class: 'tiers' });
      ['Solo', 'Plus', 'Pro', 'Max', 'Brak'].forEach(tier => {
        const id = `${mp.key}-${tier}`;
        const inp = h('input', { type: 'radio', name: `tier-${mp.key}`, id });
        inp.addEventListener('change', () => {
          if (tier === 'Brak') state.selection.main.set(mp.key, null);
          else state.selection.main.set(mp.key, tier);
          renderSummary();
        });
        const lbl = h('label', { for: id }, tier);
        radios.append(inp, lbl);
      });
      card.appendChild(radios);
      mainGrid.appendChild(card);
    });

    // Usługi
    const svcGrid = h('div', { class: 'grid' });
    state.catalog.services.forEach(svc => {
      const card = h('div', { class: 'card' });
      const cb = h('input', { type: 'checkbox', id: `svc-${svc.key}` });
      cb.addEventListener('change', () => {
        state.selection.services.set(svc.key, cb.checked ? (svc.qtySelectable ? Number(card.querySelector('.qty')?.value || 1) : 1) : 0);
        renderSummary();
      });
      const lbl = h('label', { for: `svc-${svc.key}` }, svc.label);
      card.append(cb, lbl);
      if (svc.qtySelectable) {
        const qty = h('input', { type: 'number', min: '1', value: '1', class: 'qty' });
        qty.addEventListener('change', () => {
          if (cb.checked) state.selection.services.set(svc.key, Number(qty.value || 1));
          renderSummary();
        });
        card.appendChild(qty);
      }
      svcGrid.appendChild(card);
    });

    const summary = h('div', { class: 'summary' });
    const btn = h('button', { class: 'btn', onClick: async () => { await createQuote(summary); } }, 'Generuj ofertę (Quote)');

    wrap.append(h('h3', {}, 'Produkty główne'), mainGrid, h('h3', {}, 'Usługi'), svcGrid, h('h3', {}, 'Podsumowanie'), summary, btn);
    $app.innerHTML = '';
    $app.appendChild(wrap);
    renderSummary();
  }

  function buildItemsPayload() {
    const items = [];
    state.catalog.mainProducts.forEach(mp => {
      const tier = state.selection.main.get(mp.key);
      if (tier && mp.tiers[tier]) items.push({ productId: mp.tiers[tier].productId, qty: 1 });
    });
    state.catalog.services.forEach(svc => {
      const qty = state.selection.services.get(svc.key) || 0;
      if (qty > 0) items.push({ productId: svc.productId, qty });
    });
    return items;
  }

  function renderSummary() {
    const s = document.querySelector('.summary');
    if (!s) return;
    const selectedMain = [...state.selection.main.entries()].filter(([, v]) => !!v).map(([k]) => k);
    const discount = computeDiscount();
    s.innerHTML = '';
    s.append(
      h('div', {}, `Wybrane produkty główne: ${selectedMain.join(', ') || '–'}`),
      h('div', {}, `Rabat pakietowy: ${discount} PLN`),
      h('small', { class: 'muted' }, `Tryb rabatu: ${state.discountMode}`)
    );
  }

  async function createQuote(summaryEl) {
    const items = buildItemsPayload();
    const discount = computeDiscount();
    if (!items.length) { alert('Wybierz co najmniej jeden produkt lub usługę.'); return; }
    summaryEl.classList.add('loading');
    try {
      const payload = { companyId: state.company.id, items, discountPLN: discount, title: `Oferta – ${state.company.properties.name}` };
      const res = await api(ep.createQuote, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      state.lastQuote = res;
      const url = res.properties?.hs_public_url;
      summaryEl.innerHTML = '';
      summaryEl.append(
        h('div', { class: 'ok' }, 'Oferta utworzona.'),
        url ? h('a', { href: url, target: '_blank', rel: 'noopener' }, 'Otwórz publiczny link') : h('div', {}, 'Publiczny link pojawi się po publikacji w HubSpot.'),
        h('div', {}, 'Podgląd (API):'),
        h('a', { href: `${ep.getQuote}?quoteId=${encodeURIComponent(res.quoteId)}`, target: '_blank' }, 'JSON podgląd')
      );
    } catch (e) {
      console.error(e);
      alert('Błąd generowania oferty: ' + e.message);
    } finally {
      summaryEl.classList.remove('loading');
    }
  }

  viewCompanyPicker();
})();
