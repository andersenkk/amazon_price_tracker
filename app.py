"""
Price Tracker Web Dashboard
Flask application to manage products and view price history
"""
 
from flask import Flask, render_template, request, jsonify, send_from_directory
from database import (
    init_database, get_all_products, add_product, 
    delete_product,
    get_price_history, get_price_history_last_days, get_price_statistics, save_price,
    get_product_settings, update_product_settings, get_alert_products, clear_product_alert
)
from amazon_webscraper_selenium import scrape_with_selenium
from scheduler import scrape_all_products
import threading
import time
import os
 
app = Flask(__name__, static_folder='.', static_url_path='')
 
# Initialize database on startup
init_database()
 
@app.route('/')
def index():
    """Render the main dashboard page"""
    return render_template('index.html')
 
@app.route('/style.css')
def style_css():
    """Serve the dashboard stylesheet."""
    return send_from_directory('.', 'style.css')
 
@app.route('/product/<asin>')
def product_detail(asin):
    """Render the detail page for a tracked product."""
    return render_template('product.html', asin=asin)
 
@app.route('/alerts')
def alerts_page():
    """Render the configured alert preferences page."""
    return render_template('alerts.html')
 
@app.route('/api/products', methods=['GET'])
def get_products():
    """API endpoint: Get all tracked products"""
    try:
        products = get_all_products()
        
        # Format products with current price data
        product_list = []
        for product_id, asin, name, threshold in products:
            stats = get_price_statistics(asin)
            history = get_price_history(asin, limit=1)
            
            current_price = history[0][0] if history else None
            
            product_list.append({
                'id': product_id,
                'asin': asin,
                'name': name,
                'alert_threshold': threshold,
                'current_price': current_price,
                'min_price': stats['min_price'],
                'max_price': stats['max_price'],
                'avg_price': stats['avg_price'],
                'total_checks': stats['total_checks']
            })
        
        return jsonify({'success': True, 'products': product_list})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
 
@app.route('/api/products', methods=['POST'])
def add_new_product():
    """API endpoint: Add a new product to track"""
    try:
        data = request.json
        asin = data.get('asin')
        name = data.get('name')
        alert_threshold = data.get('alert_threshold')
        
        # Validate input
        if not asin or not name:
            return jsonify({'success': False, 'error': 'ASIN and name are required'}), 400
        
        # Verify it's a valid Amazon product
        print(f"[DEBUG] Scraping to verify product: {asin}")
        url = f"https://www.amazon.com/dp/{asin}"
        result = scrape_with_selenium(url)
        
        if not result or not result['price']:
            return jsonify({'success': False, 'error': 'Could not find product on Amazon. Check ASIN.'}), 400
        
        # Add to database
        product_id = add_product(asin, name, alert_threshold)
        
        # Only store the newly added product's initial scrape. The full watchlist
        # refresh happens explicitly from the refresh button when the user wants it.
        return jsonify({
            'success': True, 
            'message': f'Added {name}',
            'product_id': product_id,
            'initial_price': result['price']
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
 
@app.route('/api/products/<asin>', methods=['GET'])
def get_product_history(asin):
    """API endpoint: Get price history for a specific product"""
    try:
        periods = {'30d': 30, '3m': 90, '6m': 180, '1y': 365, 'all': None}
        period = request.args.get('period', '30d')
        if period not in periods:
            return jsonify({'success': False, 'error': 'Invalid history period'}), 400
 
        product = get_product_settings(asin)
        if not product:
            return jsonify({'success': False, 'error': 'Product not found'}), 404
 
        history = get_price_history_last_days(asin, days=periods[period])
        stats = {
            'min_price': min((item[0] for item in history), default=None),
            'max_price': max((item[0] for item in history), default=None),
            'avg_price': round(sum(item[0] for item in history) / len(history), 2) if history else None,
            'total_checks': len(history)
        }
        
        history_data = [
            {
                'price': h[0],
                'timestamp': h[1],
                'name': h[2]
            }
            for h in history
        ]
        
        return jsonify({
            'success': True,
            'product': {
                'name': product[1],
                'target_price': product[2],
                'email': product[3] or '',
                'phone': product[4] or ''
            },
            'history': history_data,
            'stats': stats
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
 
@app.route('/api/products/<asin>', methods=['PATCH'])
def update_product(asin):
    """API endpoint: Update target price and future alert contact details."""
    try:
        data = request.get_json(silent=True) or {}
        target_price = data.get('target_price')
        if target_price in ('', None):
            target_price = None
        else:
            try:
                target_price = float(target_price)
                if target_price < 0:
                    raise ValueError
            except (TypeError, ValueError):
                return jsonify({'success': False, 'error': 'Target price must be a positive number'}), 400
 
        email = (data.get('email') or '').strip()
        phone = (data.get('phone') or '').strip()
        if not update_product_settings(asin, target_price, email, phone):
            return jsonify({'success': False, 'error': 'Product not found'}), 404
 
        return jsonify({'success': True, 'message': 'Product settings updated'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
 
@app.route('/api/products/<asin>', methods=['DELETE'])
def remove_product(asin):
    """API endpoint: Stop tracking a product and remove its history."""
    try:
        if not delete_product(asin):
            return jsonify({'success': False, 'error': 'Product not found'}), 404
 
        return jsonify({'success': True, 'message': f'Removed {asin}'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
 
@app.route('/api/alerts', methods=['GET'])
def get_alerts():
    """API endpoint: Get products with configured alert preferences."""
    alerts = [
        {'asin': asin, 'name': name, 'target_price': target, 'email': email or '', 'phone': phone or ''}
        for asin, name, target, email, phone in get_alert_products()
    ]
    return jsonify({'success': True, 'alerts': alerts})
 
@app.route('/api/alerts/<asin>', methods=['DELETE'])
def remove_alert(asin):
    """API endpoint: Clear alert preferences without deleting the product."""
    if not clear_product_alert(asin):
        return jsonify({'success': False, 'error': 'Product not found'}), 404
    return jsonify({'success': True, 'message': 'Alert preferences removed'})
 
@app.route('/api/scrape/<asin>', methods=['POST'])
def manual_scrape(asin):
    """API endpoint: Manually scrape a specific product now"""
    try:
        print(f"[DEBUG] Manual scrape triggered for {asin}")
        url = f"https://www.amazon.com/dp/{asin}"
        result = scrape_with_selenium(url)
        
        if not result or not result['price']:
            return jsonify({'success': False, 'error': 'Failed to scrape product'}), 400
        
        # Save price
        alert_triggered = save_price(
            asin=asin,
            price=result['price'],
            title=result['title'],
            rating=result['rating']
        )
        
        return jsonify({
            'success': True,
            'price': result['price'],
            'title': result['title'],
            'rating': result['rating'],
            'alert_triggered': alert_triggered
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
 
@app.route('/api/scrape-all', methods=['POST'])
def scrape_all():
    """API endpoint: Run scraper for all products now"""
    try:
        print("[DEBUG] Scraping all products...")
        # Run in background thread so request doesn't timeout
        thread = threading.Thread(target=scrape_all_products)
        thread.daemon = True
        thread.start()
        
        return jsonify({
            'success': True,
            'message': 'Scraper started. Check back in a minute for results.'
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
 
@app.errorhandler(404)
def not_found(error):
    """Handle 404 errors"""
    return jsonify({'success': False, 'error': 'Endpoint not found'}), 404
 
@app.errorhandler(500)
def server_error(error):
    """Handle 500 errors"""
    return jsonify({'success': False, 'error': 'Server error'}), 500
 
if __name__ == '__main__':
    print("=" * 70)
    print("PRICE TRACKER WEB DASHBOARD")
    print("=" * 70)
    print("\n✓ Starting Flask server...")
    print("✓ Open your browser to: http://localhost:5000")
    print("✓ Press Ctrl+C to stop\n")
    
    # Run Flask app
    app.run(debug=True, port=5000)
