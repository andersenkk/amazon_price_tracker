const page = document.querySelector('.detail-page');
const asin = page.dataset.asin;
const formatPrice = value => value === null || value === undefined ? '—' : `$${Number(value).toFixed(2)}`;
const periodLabels = { '30d': 'Last 30 days', '3m': 'Last 3 months', '6m': 'Last 6 months', '1y': 'Last year', all: 'All time' };
let selectedPeriod = '30d';

function drawChart(history) {
  const chart = document.querySelector('#price-chart');
  if (!history.length) {
    chart.innerHTML = '<text x="400" y="150" text-anchor="middle" fill="#71807a" font-size="14">No price history yet</text>';
    return;
  }
  const prices = history.map(item => Number(item.price));
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const points = prices.map((price, index) => {
    const x = history.length === 1 ? 400 : 24 + index * (752 / (history.length - 1));
    const y = 256 - ((price - min) / range) * 212;
    return `${x},${y}`;
  }).join(' ');
  const area = `${points} 776,270 24,270`;
  chart.innerHTML = `<line x1="24" y1="270" x2="776" y2="270" stroke="#dce4dd"/><polygon points="${area}" fill="#d9eee4" opacity=".55"/><polyline points="${points}" fill="none" stroke="#116b63" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
}

async function loadProduct() {
  try {
    const response = await fetch(`/api/products/${encodeURIComponent(asin)}?period=${selectedPeriod}`);
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || 'Could not load product history');
    const history = data.history || [];
    const latest = history.length ? history[history.length - 1] : null;
    const productName = data.product.name || (latest ? latest.name : `Product ${asin}`);
    const productLink = document.querySelector('#detail-name');
    productLink.textContent = productName;
    productLink.href = `https://www.amazon.com/dp/${encodeURIComponent(asin)}`;
    document.querySelector('#detail-current-price').textContent = latest ? formatPrice(latest.price) : '—';
    document.querySelector('#detail-min').textContent = formatPrice(data.stats.min_price);
    document.querySelector('#detail-max').textContent = formatPrice(data.stats.max_price);
    document.querySelector('#detail-target').value = data.product.target_price ?? '';
    document.querySelector('#detail-email').value = data.product.email;
    document.querySelector('#detail-phone').value = data.product.phone;
    drawChart(history);
    document.querySelector('#detail-loading').hidden = true;
    document.querySelector('#detail-content').hidden = false;
  } catch (error) {
    document.querySelector('#detail-loading').hidden = true;
    const errorBox = document.querySelector('#detail-error');
    errorBox.textContent = `${error.message}.`;
    errorBox.hidden = false;
  }
}

const periodTrigger = document.querySelector('#period-trigger');
const periodMenu = document.querySelector('#period-menu');
periodTrigger.addEventListener('click', () => { const isOpen = !periodMenu.hidden; periodMenu.hidden = isOpen; periodTrigger.setAttribute('aria-expanded', String(!isOpen)); });
periodMenu.addEventListener('click', event => { const option = event.target.closest('[data-period]'); if (!option) return; selectedPeriod = option.dataset.period; periodTrigger.firstChild.textContent = `${periodLabels[selectedPeriod]} `; periodMenu.hidden = true; periodTrigger.setAttribute('aria-expanded', 'false'); loadProduct(); });
document.addEventListener('click', event => { if (!event.target.closest('.period-picker')) { periodMenu.hidden = true; periodTrigger.setAttribute('aria-expanded', 'false'); } });
loadProduct();

document.querySelector('#settings-save').addEventListener('click', async () => {
  const button = document.querySelector('#settings-save');
  const status = document.querySelector('#settings-status');
  button.disabled = true;
  status.textContent = 'Saving...';
  try {
    const response = await fetch(`/api/products/${encodeURIComponent(asin)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_price: document.querySelector('#detail-target').value,
        email: document.querySelector('#detail-email').value,
        phone: document.querySelector('#detail-phone').value
      })
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || 'Could not save settings');
    status.textContent = 'Changes saved.';
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
