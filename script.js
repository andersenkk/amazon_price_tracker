const list = document.querySelector('#product-list');
const alertsLink = document.querySelector('a[href="#alerts"]');
if (alertsLink) alertsLink.href = '/alerts';
const productsPanel = document.querySelector('#products');
const watchlistActions = document.createElement('div');
watchlistActions.className = 'watchlist-actions';
watchlistActions.innerHTML = '<button class="primary" id="watchlist-add-product" type="button">＋ Add product</button><a class="secondary action-link" href="/alerts">◉ Check alerts</a>';
productsPanel.parentElement.insertBefore(watchlistActions, productsPanel);
const formatPrice = value => value === null || value === undefined ? '—' : `$${Number(value).toFixed(2)}`;
const sparkline = (index, positive = false) => {
  const points = positive ? '2,24 16,19 29,21 42,13 56,16 70,7 84,10 98,3' : (index % 2 ? '2,6 16,10 29,8 42,18 56,15 70,24 84,20 98,27' : '2,24 16,19 29,21 42,13 56,16 70,7 84,10 98,3');
  return `<svg viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><polyline points="${points}" fill="none" stroke="${positive ? '#50a473' : '#e56d50'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
};

const filterBar = document.createElement('div');
filterBar.className = 'watchlist-filters';
filterBar.setAttribute('aria-label', 'Filter watchlist');
filterBar.innerHTML = '<label><span>Name</span><input id="watchlist-name" type="search" placeholder="Search products"></label><label><span>Platform</span><select id="watchlist-platform"><option value="">All platforms</option><option value="Amazon">Amazon</option></select></label><label><span>Price</span><input id="watchlist-price" type="number" min="0" step="1" placeholder="Any price"></label><button id="clear-watchlist-filters" type="button" title="Clear filters" aria-label="Clear watchlist filters">×</button>';
list.parentElement.insertBefore(filterBar, list);

const columnHeader = document.createElement('div');
columnHeader.className = 'watchlist-columns';
columnHeader.innerHTML = '<span>Product <button class="sort-button" id="sort-name" type="button" title="Sort product names">A–Z</button></span><span>Platform</span><span>Price <button class="sort-button" id="sort-price" type="button" title="Sort prices">Low–High</button></span><span></span><span></span>';
list.parentElement.insertBefore(columnHeader, list);

const nameFilter = document.querySelector('#watchlist-name');
const platformFilter = document.querySelector('#watchlist-platform');
const priceFilter = document.querySelector('#watchlist-price');
let productsCache = [];
let nameSort = 'asc';
let priceSort = 'asc';

function applyWatchlistFilters() {
  const name = nameFilter.value.trim().toLowerCase();
  const platform = platformFilter.value;
  const priceValue = Number(priceFilter.value);
  document.querySelectorAll('#product-list .product').forEach(row => {
    const productName = row.querySelector('.product-name').textContent.toLowerCase();
    const productPlatform = row.querySelector('.platform').textContent;
    const price = Number(row.querySelector('.price').textContent.replace(/[^0-9.-]+/g, ''));
    const matchesName = !name || productName.includes(name);
    const matchesPlatform = !platform || productPlatform === platform;
    const matchesPrice = !priceFilter.value || (Number.isFinite(price) && price === priceValue);
    row.hidden = !(matchesName && matchesPlatform && matchesPrice);
  });
}

function renderProducts(products) {
  productsCache = products;
  const checks = products.reduce((sum, product) => sum + (product.total_checks || 0), 0);
  const targets = products.filter(product => product.current_price !== null && product.alert_threshold && product.current_price <= product.alert_threshold).length;
  document.querySelector('#tracked-count').textContent = products.length;
  document.querySelector('#checks-count').textContent = checks;
  document.querySelector('#target-count').textContent = targets;

  if (!products.length) {
    list.innerHTML = '<div class="empty">Your watchlist is quiet for now.<br>Use <strong>Add product</strong> to start collecting a price history.</div>';
    return;
  }

  const sortedProducts = [...products].sort((left, right) => {
    if (nameSort !== null) return nameSort === 'asc' ? left.name.localeCompare(right.name) : right.name.localeCompare(left.name);
    const leftPrice = left.current_price === null ? Number.POSITIVE_INFINITY : Number(left.current_price);
    const rightPrice = right.current_price === null ? Number.POSITIVE_INFINITY : Number(right.current_price);
    return priceSort === 'asc' ? leftPrice - rightPrice : rightPrice - leftPrice;
  });
  list.innerHTML = sortedProducts.map((product, index) => {
    const atTarget = product.current_price !== null && product.alert_threshold && product.current_price <= product.alert_threshold;
    const note = atTarget ? 'Target reached' : product.total_checks ? `${product.total_checks} checks · low ${formatPrice(product.min_price)}` : 'No price checks yet';
    return `<article class="product"><a class="product-link" href="/product/${encodeURIComponent(product.asin)}" aria-label="View price history for ${product.name}"><div><div class="product-name" title="${product.name}">${product.name}</div><div class="product-meta">${product.asin} · ${note}</div></div><div class="platform">Amazon</div><div><div class="price">${formatPrice(product.current_price)}</div><div class="change ${atTarget ? '' : 'steady'}">${atTarget ? '↓ target hit' : 'tracking'}</div></div><div class="sparkline">${sparkline(index, atTarget)}</div></a><button class="delete-button" type="button" data-asin="${product.asin}" aria-label="Stop tracking ${product.name}" title="Stop tracking product">×</button></article>`;
  }).join('');
  applyWatchlistFilters();
}

async function loadProducts() {
  list.innerHTML = '<div class="loading">Refreshing your watchlist...</div>';
  try {
    const response = await fetch('/api/products');
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || 'Could not load products');
    renderProducts(data.products);
  } catch (error) {
    list.innerHTML = `<div class="error">${error.message}. Start the Flask app and try again.</div>`;
  }
}

async function refreshAllProducts() {
  const refreshButton = document.querySelector('#refresh-button');
  if (!refreshButton) return;

  refreshButton.disabled = true;
  refreshButton.setAttribute('aria-busy', 'true');
  list.innerHTML = '<div class="loading">Checking all tracked products...</div>';

  try {
    const response = await fetch('/api/scrape-all', { method: 'POST' });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || 'Could not refresh products');
    await new Promise(resolve => setTimeout(resolve, 1200));
    await loadProducts();
  } catch (error) {
    list.innerHTML = `<div class="error">${error.message}</div>`;
  } finally {
    refreshButton.disabled = false;
    refreshButton.removeAttribute('aria-busy');
  }
}

const addProductModal = document.querySelector('#add-product-modal');
const productUrlInput = document.querySelector('#product-url');
const productNameInput = document.querySelector('#product-name');
const targetPriceInput = document.querySelector('#target-price');
let wizardAsin = null;
function extractAsin(value) { const match = value.match(/(?:\/dp\/|\/gp\/product\/|\/gp\/aw\/d\/)([A-Z0-9]{10})/i); return match ? match[1].toUpperCase() : null; }
function setWizardStep(step) { const urlStep = step === 'url'; document.querySelector('#wizard-step-url').hidden = !urlStep; document.querySelector('#wizard-step-details').hidden = urlStep; document.querySelector('#wizard-progress-url').classList.toggle('active', urlStep); document.querySelector('#wizard-progress-details').classList.toggle('active', !urlStep); document.querySelector('#wizard-title').textContent = urlStep ? 'Start tracking a product' : 'Name your product'; document.querySelector('#wizard-copy').textContent = urlStep ? 'Paste a product URL and we will start watching its price.' : 'Give this product a name and set a target price if you have one.'; }
function openAddWizard() { productUrlInput.value = ''; productNameInput.value = ''; targetPriceInput.value = ''; document.querySelector('#wizard-url-error').textContent = ''; document.querySelector('#wizard-details-error').textContent = ''; wizardAsin = null; setWizardStep('url'); addProductModal.hidden = false; productUrlInput.focus(); }
function closeAddWizard() { addProductModal.hidden = true; }
function continueWizard() { wizardAsin = extractAsin(productUrlInput.value.trim()); if (!wizardAsin) { document.querySelector('#wizard-url-error').textContent = 'Enter a valid Amazon product URL containing an ASIN.'; productUrlInput.focus(); return; } setWizardStep('details'); productNameInput.focus(); }
async function submitWizard() { const name = productNameInput.value.trim(); const target = targetPriceInput.value.trim(); if (!name) { document.querySelector('#wizard-details-error').textContent = 'Enter a name for this product.'; productNameInput.focus(); return; } const alertThreshold = target && !Number.isNaN(Number(target)) ? Number(target) : null; const submitButton = document.querySelector('#wizard-submit'); submitButton.disabled = true; submitButton.textContent = 'Adding...'; try { const response = await fetch('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ asin: wizardAsin, name, alert_threshold: alertThreshold }) }); const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.error || 'Could not add product'); closeAddWizard(); await loadProducts(); } catch (error) { document.querySelector('#wizard-details-error').textContent = error.message; } finally { submitButton.disabled = false; submitButton.textContent = 'Add product'; } }
async function deleteProduct(asin, name) { if (!window.confirm(`Stop tracking ${name}? Its saved price history will also be deleted.`)) return; try { const response = await fetch(`/api/products/${encodeURIComponent(asin)}`, { method: 'DELETE' }); const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.error || 'Could not delete product'); await loadProducts(); } catch (error) { window.alert(error.message); } }

document.querySelector('#refresh-button').addEventListener('click', refreshAllProducts);
document.querySelector('#add-product-nav').addEventListener('click', openAddWizard);
document.querySelector('#watchlist-add-product').addEventListener('click', openAddWizard);
document.querySelector('#wizard-close').addEventListener('click', closeAddWizard);
document.querySelector('#wizard-cancel-url').addEventListener('click', closeAddWizard);
document.querySelector('#wizard-next').addEventListener('click', continueWizard);
document.querySelector('#wizard-back').addEventListener('click', () => setWizardStep('url'));
document.querySelector('#wizard-submit').addEventListener('click', submitWizard);
addProductModal.addEventListener('click', event => { if (event.target === addProductModal) closeAddWizard(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !addProductModal.hidden) closeAddWizard(); });
list.addEventListener('click', event => { const button = event.target.closest('.delete-button'); if (button) deleteProduct(button.dataset.asin, button.closest('.product').querySelector('.product-name').textContent); });
[nameFilter, platformFilter, priceFilter].forEach(input => input.addEventListener('input', applyWatchlistFilters));
platformFilter.addEventListener('change', applyWatchlistFilters);
document.querySelector('#clear-watchlist-filters').addEventListener('click', () => { nameFilter.value = ''; platformFilter.value = ''; priceFilter.value = ''; applyWatchlistFilters(); });
new MutationObserver(applyWatchlistFilters).observe(list, { childList: true });
document.querySelector('#sort-name').addEventListener('click', () => { nameSort = nameSort === 'asc' ? 'desc' : 'asc'; priceSort = null; document.querySelector('#sort-name').textContent = nameSort === 'asc' ? 'A–Z' : 'Z–A'; renderProducts(productsCache); });
document.querySelector('#sort-price').addEventListener('click', () => { priceSort = priceSort === 'asc' ? 'desc' : 'asc'; nameSort = null; document.querySelector('#sort-price').textContent = priceSort === 'asc' ? 'Low–High' : 'High–Low'; renderProducts(productsCache); });
loadProducts();
