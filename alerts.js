const alertsList = document.querySelector('#alerts-list');
const alertsCount = document.querySelector('#alerts-count');
const formatPrice = value => value === null || value === undefined ? '—' : `$${Number(value).toFixed(2)}`;

async function loadAlerts() {
  try {
    const response = await fetch('/api/alerts');
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || 'Could not load alerts');
    alertsCount.textContent = data.alerts.length;
    if (!data.alerts.length) {
      alertsList.innerHTML = '<div class="alerts-empty">No alert preferences yet. Open a product and choose a target price or contact method.</div>';
      return;
    }
    alertsList.innerHTML = data.alerts.map(alert => `<article class="alert-row"><div><a class="alert-name" href="/product/${encodeURIComponent(alert.asin)}">${alert.name}</a><div class="alert-asin">${alert.asin}</div></div><div class="alert-detail"><span>Target</span><strong>${formatPrice(alert.target_price)}</strong></div><div class="alert-detail"><span>Email</span><strong>${alert.email || 'Not set'}</strong></div><div class="alert-detail"><span>Phone</span><strong>${alert.phone || 'Not set'}</strong></div><button class="remove-alert" type="button" data-asin="${alert.asin}" data-name="${alert.name}" title="Remove alert" aria-label="Remove alert for ${alert.name}">×</button></article>`).join('');
  } catch (error) {
    alertsList.innerHTML = `<div class="detail-state error">${error.message}.</div>`;
  }
}

alertsList.addEventListener('click', async event => {
  const button = event.target.closest('.remove-alert');
  if (!button || !window.confirm(`Remove alert preferences for ${button.dataset.name}?`)) return;
  const response = await fetch(`/api/alerts/${encodeURIComponent(button.dataset.asin)}`, { method: 'DELETE' });
  const data = await response.json();
  if (!response.ok || !data.success) { window.alert(data.error || 'Could not remove alert'); return; }
  loadAlerts();
});

loadAlerts();
