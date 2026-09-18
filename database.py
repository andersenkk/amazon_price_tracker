"""
Database handler for price tracking
Stores all price history in SQLite
"""

import sqlite3
import os
from datetime import datetime
from pathlib import Path

DB_PATH = "price_tracker.db"

def init_database():
    """
    Create the database and tables if they don't exist
    """
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Create products table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY,
            asin TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            price_alert_threshold REAL,
            date_added TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Create price history table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS price_history (
            id INTEGER PRIMARY KEY,
            product_id INTEGER NOT NULL,
            price REAL NOT NULL,
            title TEXT,
            rating TEXT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(product_id) REFERENCES products(id)
        )
    ''')

    for column, definition in (('alert_email', 'TEXT'), ('alert_phone', 'TEXT')):
        try:
            cursor.execute(f'ALTER TABLE products ADD COLUMN {column} {definition}')
        except sqlite3.OperationalError:
            pass

    # Remove duplicate same-day snapshots so we keep only one record per product per day.
    cursor.execute('''
        DELETE FROM price_history
        WHERE id NOT IN (
            SELECT MIN(id)
            FROM price_history
            GROUP BY product_id, date(timestamp)
        )
    ''')

    cursor.execute('''
        CREATE UNIQUE INDEX IF NOT EXISTS idx_price_history_product_day
        ON price_history(product_id, date(timestamp))
    ''')

    conn.commit()
    conn.close()
    print("[DATABASE] Database initialized")

def add_product(asin, name, price_alert_threshold=None):
    """
    Add a new product to track
    """
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        cursor.execute('''
            INSERT INTO products (asin, name, price_alert_threshold)
            VALUES (?, ?, ?)
        ''', (asin, name, price_alert_threshold))
        conn.commit()
        print(f"[DATABASE] Added product: {name} ({asin})")
        return cursor.lastrowid
    except sqlite3.IntegrityError:
        print(f"[DATABASE] Product {asin} already exists")
        return None
    finally:
        conn.close()

def get_all_products():
    """
    Get all products currently being tracked
    """
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute('SELECT id, asin, name, price_alert_threshold FROM products')
    products = cursor.fetchall()
    conn.close()
    
    return products

def get_product_settings(asin):
    """Get editable settings for one tracked product."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        SELECT id, name, price_alert_threshold, alert_email, alert_phone
        FROM products WHERE asin = ?
    ''', (asin,))
    product = cursor.fetchone()
    conn.close()
    return product

def update_product_settings(asin, target_price, email, phone):
    """Save editable alert settings for one tracked product."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        UPDATE products
        SET price_alert_threshold = ?, alert_email = ?, alert_phone = ?
        WHERE asin = ?
    ''', (target_price, email, phone, asin))
    updated = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return updated

def get_alert_products():
    """Get products with at least one alert preference configured."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        SELECT asin, name, price_alert_threshold, alert_email, alert_phone
        FROM products
        WHERE price_alert_threshold IS NOT NULL
           OR COALESCE(alert_email, '') != ''
           OR COALESCE(alert_phone, '') != ''
        ORDER BY name COLLATE NOCASE
    ''')
    products = cursor.fetchall()
    conn.close()
    return products

def clear_product_alert(asin):
    """Remove alert preferences without deleting the tracked product."""
    return update_product_settings(asin, None, '', '')

def delete_product(asin):
    """Delete a tracked product and its stored price history."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    try:
        cursor.execute('SELECT id FROM products WHERE asin = ?', (asin,))
        product = cursor.fetchone()
        if not product:
            return False

        cursor.execute('DELETE FROM price_history WHERE product_id = ?', (product[0],))
        cursor.execute('DELETE FROM products WHERE id = ?', (product[0],))
        conn.commit()
        return True
    finally:
        conn.close()

def save_price(asin, price, title=None, rating=None):
    """
    Save a price check to the database
    """
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        # Get product ID from ASIN
        cursor.execute('SELECT id, price_alert_threshold FROM products WHERE asin = ?', (asin,))
        result = cursor.fetchone()
        
        if not result:
            print(f"[DATABASE] Product {asin} not found")
            return False
        
        product_id, alert_threshold = result
        
        # Keep only one saved price record per product per day.
        existing = cursor.execute('''
            SELECT 1
            FROM price_history
            WHERE product_id = ?
              AND date(timestamp) = date('now')
            LIMIT 1
        ''', (product_id,)).fetchone()
        if existing:
            print(f"[DATABASE] Skipping duplicate price entry for {asin} on {datetime.now().strftime('%Y-%m-%d')}")
            return False

        # Insert price
        cursor.execute('''
            INSERT INTO price_history (product_id, price, title, rating)
            VALUES (?, ?, ?, ?)
        ''', (product_id, price, title, rating))

        conn.commit()
        print(f"[DATABASE] Saved price ${price} for ASIN {asin}")

        # Check if price is below alert threshold
        if alert_threshold and price < alert_threshold:
            print(f"[ALERT] Price dropped below ${alert_threshold} for {asin}!")
            return True  # Return True to indicate alert triggered

        return False
    finally:
        conn.close()

def get_price_history(asin, limit=30):
    """
    Get recent price history for a product
    """
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT ph.price, ph.timestamp, p.name
        FROM price_history ph
        JOIN products p ON ph.product_id = p.id
        WHERE p.asin = ?
        ORDER BY ph.timestamp DESC
        LIMIT ?
    ''', (asin, limit))
    
    history = cursor.fetchall()
    conn.close()
    
    return history

def get_price_history_last_days(asin, days=30):
    """Get all recorded prices for a product within the requested period."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    if days is None:
        cursor.execute('''
            SELECT ph.price, ph.timestamp, p.name
            FROM price_history ph
            JOIN products p ON ph.product_id = p.id
            WHERE p.asin = ?
            ORDER BY ph.timestamp ASC
        ''', (asin,))
    else:
        cursor.execute('''
            SELECT ph.price, ph.timestamp, p.name
            FROM price_history ph
            JOIN products p ON ph.product_id = p.id
            WHERE p.asin = ?
              AND ph.timestamp >= datetime('now', ?)
            ORDER BY ph.timestamp ASC
        ''', (asin, f'-{days} days'))

    history = cursor.fetchall()
    conn.close()
    return history

def get_price_statistics(asin):
    """
    Get price stats (min, max, average) for a product
    """
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT 
            MIN(price) as min_price,
            MAX(price) as max_price,
            AVG(price) as avg_price,
            COUNT(*) as total_checks
        FROM price_history ph
        JOIN products p ON ph.product_id = p.id
        WHERE p.asin = ?
    ''', (asin,))
    
    stats = cursor.fetchone()
    conn.close()
    
    return {
        'min_price': stats[0],
        'max_price': stats[1],
        'avg_price': round(stats[2], 2) if stats[2] else None,
        'total_checks': stats[3]
    }

def display_all_products():
    """
    Display summary of all tracked products
    """
    products = get_all_products()
    
    if not products:
        print("No products tracked yet")
        return
    
    print("\n" + "=" * 70)
    print("TRACKED PRODUCTS")
    print("=" * 70)
    
    for product_id, asin, name, threshold in products:
        stats = get_price_statistics(asin)
        print(f"\n{name}")
        print(f"  ASIN: {asin}")
        print(f"  Alert Threshold: ${threshold if threshold else 'N/A'}")
        if stats['total_checks'] > 0:
            print(f"  Price Range: ${stats['min_price']} - ${stats['max_price']}")
            print(f"  Average Price: ${stats['avg_price']}")
            print(f"  Total Checks: {stats['total_checks']}")
        else:
            print(f"  No price history yet")

# ============ SETUP ============
if __name__ == "__main__":
    # Initialize database
    init_database()
    
    # Add example product
    add_product("B01N5O7551", "MSR PocketRocket Stove", 40.00)
    
    # Display products
    display_all_products()