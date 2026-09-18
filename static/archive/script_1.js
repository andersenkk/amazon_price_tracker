// ============================================
// Price Tracker Dashboard - JavaScript
// ============================================

// DOM Elements
const addProductForm = document.getElementById('addProductForm');
const formMessage = document.getElementById('formMessage');
const productsList = document.getElementById('productsList');
const scrapeAllBtn = document.getElementById('scrapeAllBtn');
const modal = document.getElementById('productModal');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const closeBtn = document.querySelector('.close');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadProducts();
    setupEventListeners();
});

// ============================================
// Event Listeners
// ============================================

function setupEventListeners() {
    addProductForm.addEventListener('submit', handleAddProduct);
    scrapeAllBtn.addEventListener('click', handleScrapeAll);
    closeBtn.addEventListener('click', closeModal);
    window.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
}

// ============================================
// Add Product
// ============================================

async function handleAddProduct(e) {
    e.preventDefault();

    const name = document.getElementById('productName').value.trim();
    const asin = document.getElementById('productASIN').value.trim().toUpperCase();
    const alertPrice = document.getElementById('alertPrice').value;

    if (!name || !asin) {
        showMessage('Please fill in product name and ASIN', 'error');
        return;
    }

    // Validate ASIN format (typically B followed by 9 digits)
    if (!/^B[0-9A-Z]{9}$/.test(asin)) {
        showMessage('ASIN should be format like B01N5O7551', 'error');
        return;
    }

    showMessage('Adding product... this may take a minute', 'info');

    try {
        const response = await fetch('/api/products', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: name,
                asin: asin,
                alert_threshold: alertPrice ? parseFloat(alertPrice) : null
            })
        });

        const data = await response.json();

        if (data.success) {
            showMessage(`✓ ${data.message}! Initial price: $${data.initial_price.toFixed(2)}`, 'success');
            addProductForm.reset();
            loadProducts();
        } else {
            showMessage(`Error: ${data.error}`, 'error');
        }
    } catch (error) {
        showMessage(`Error: ${error.message}`, 'error');
    }
}

// ============================================
// Load Products
// ============================================

async function loadProducts() {
    try {
        productsList.innerHTML = '<p class="loading">Loading products...</p>';

        const response = await fetch('/api/products');
        const data = await response.json();

        if (!data.success) {
            productsList.innerHTML = `<p class="error">Error loading products: ${data.error}</p>`;
            return;
        }

        const products = data.products;

        if (products.length === 0) {
            productsList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📦</div>
                    <h3>No products yet</h3>
                    <p>Add your first product using the form above to start tracking prices!</p>
                </div>
            `;
            return;
        }

        productsList.innerHTML = products.map(product => createProductCard(product)).join('');

        // Attach event listeners to new buttons
        products.forEach(product => {
            const viewBtn = document.getElementById(`view-${product.asin}`);
            const scrapeBtn = document.getElementById(`scrape-${product.asin}`);
            const deleteBtn = document.getElementById(`delete-${product.asin}`);

            if (viewBtn) viewBtn.addEventListener('click', () => showProductHistory(product.asin, product.name));
            if (scrapeBtn) scrapeBtn.addEventListener('click', () => handleManualScrape(product.asin));
            if (deleteBtn) deleteBtn.addEventListener('click', () => handleDeleteProduct(product.asin));
        });
    } catch (error) {
        productsList.innerHTML = `<p class="error">Error: ${error.message}</p>`;
    }
}

// ============================================
// Create Product Card
// ============================================

function createProductCard(product) {
    const priceStatus = product.current_price && product.alert_threshold
        ? product.current_price < product.alert_threshold ? 'success' : 'warning'
        : '';

    return `
        <div class="product-card">
            <div class="product-header">
                <div>
                    <div class="product-name">${escapeHtml(product.name)}</div>
                    <div class="product-asin">ASIN: ${product.asin}</div>
                </div>
            </div>

            <div class="product-stats">
                <div class="stat">
                    <div class="stat-label">Current Price</div>
                    <div class="stat-value ${priceStatus}">
                        ${product.current_price ? '$' + product.current_price.toFixed(2) : 'N/A'}
                    </div>
                </div>
                <div class="stat">
                    <div class="stat-label">Alert Price</div>
                    <div class="stat-value">
                        ${product.alert_threshold ? '$' + product.alert_threshold.toFixed(2) : 'Not set'}
                    </div>
                </div>
                <div class="stat">
                    <div class="stat-label">Min Price</div>
                    <div class="stat-value">
                        ${product.min_price ? '$' + product.min_price.toFixed(2) : 'N/A'}
                    </div>
                </div>
                <div class="stat">
                    <div class="stat-label">Max Price</div>
                    <div class="stat-value">
                        ${product.max_price ? '$' + product.max_price.toFixed(2) : 'N/A'}
                    </div>
                </div>
                <div class="stat">
                    <div class="stat-label">Avg Price</div>
                    <div class="stat-value">
                        ${product.avg_price ? '$' + product.avg_price.toFixed(2) : 'N/A'}
                    </div>
                </div>
                <div class="stat">
                    <div class="stat-label">Checks</div>
                    <div class="stat-value">${product.total_checks}</div>
                </div>
            </div>

            <div class="product-actions">
                <button id="view-${product.asin}" class="btn btn-primary btn-small">View History</button>
                <button id="scrape-${product.asin}" class="btn btn-secondary btn-small">Scrape Now</button>
                <button id="delete-${product.asin}" class="btn btn-danger btn-small">Delete</button>
            </div>
        </div>
    `;
}

// ============================================
// Show Product History
// ============================================

async function showProductHistory(asin, name) {
    modal.classList.add('show');
    modalTitle.textContent = `${name} - Price History`;
    modalBody.innerHTML = '<p class="loading">Loading history...</p>';

    try {
        const response = await fetch(`/api/products/${asin}`);
        const data = await response.json();

        if (!data.success) {
            modalBody.innerHTML = `<p class="error">Error: ${data.error}</p>`;
            return;
        }

        const history = data.history;
        const stats = data.stats;

        let html = `
            <div class="stats-summary">
                <p><strong>Min Price:</strong> $${stats.min_price ? stats.min_price.toFixed(2) : 'N/A'}</p>
                <p><strong>Max Price:</strong> $${stats.max_price ? stats.max_price.toFixed(2) : 'N/A'}</p>
                <p><strong>Average Price:</strong> $${stats.avg_price ? stats.avg_price.toFixed(2) : 'N/A'}</p>
                <p><strong>Total Checks:</strong> ${stats.total_checks}</p>
            </div>

            <h3>Price History</h3>
            <table class="price-history-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Price</th>
                    </tr>
                </thead>
                <tbody>
        `;

        history.forEach(record => {
            const date = new Date(record.timestamp).toLocaleDateString();
            const time = new Date(record.timestamp).toLocaleTimeString();
            html += `
                <tr>
                    <td>${date} ${time}</td>
                    <td>$${record.price.toFixed(2)}</td>
                </tr>
            `;
        });

        html += `
                </tbody>
            </table>
        `;

        modalBody.innerHTML = html;
    } catch (error) {
        modalBody.innerHTML = `<p class="error">Error: ${error.message}</p>`;
    }
}

// ============================================
// Manual Scrape
// ============================================

async function handleManualScrape(asin) {
    const btn = document.getElementById(`scrape-${asin}`);
    const originalText = btn.textContent;
    btn.innerHTML = '<span class="spinner"></span>Scraping...';
    btn.disabled = true;

    try {
        const response = await fetch(`/api/scrape/${asin}`, {
            method: 'POST'
        });

        const data = await response.json();

        if (data.success) {
            showMessage(`✓ Price updated: $${data.price.toFixed(2)}`, 'success');
            if (data.alert_triggered) {
                showMessage(`🚨 Alert: Price dropped below threshold!`, 'warning');
            }
            loadProducts();
        } else {
            showMessage(`Error: ${data.error}`, 'error');
        }
    } catch (error) {
        showMessage(`Error: ${error.message}`, 'error');
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

// ============================================
// Scrape All
// ============================================

async function handleScrapeAll() {
    const originalText = scrapeAllBtn.textContent;
    scrapeAllBtn.innerHTML = '<span class="spinner"></span>Scraping all...';
    scrapeAllBtn.disabled = true;

    try {
        const response = await fetch('/api/scrape-all', {
            method: 'POST'
        });

        const data = await response.json();

        if (data.success) {
            showMessage(data.message, 'info');
            // Reload products after a delay
            setTimeout(loadProducts, 5000);
        } else {
            showMessage(`Error: ${data.error}`, 'error');
        }
    } catch (error) {
        showMessage(`Error: ${error.message}`, 'error');
    } finally {
        scrapeAllBtn.textContent = originalText;
        scrapeAllBtn.disabled = false;
    }
}

// ============================================
// Delete Product
// ============================================

async function handleDeleteProduct(asin) {
    if (!confirm('Are you sure you want to delete this product? This cannot be undone.')) {
        return;
    }

    try {
        // This would need to be implemented in the backend
        // For now, just show a message
        showMessage('Delete functionality coming soon', 'info');
    } catch (error) {
        showMessage(`Error: ${error.message}`, 'error');
    }
}

// ============================================
// Modal Functions
// ============================================

function closeModal() {
    modal.classList.remove('show');
}

// ============================================
// Messages
// ============================================

function showMessage(text, type = 'info') {
    formMessage.textContent = text;
    formMessage.className = `message ${type}`;

    // Auto-hide after 5 seconds
    setTimeout(() => {
        formMessage.className = 'message';
    }, 5000);
}

// ============================================
// Utilities
// ============================================

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}