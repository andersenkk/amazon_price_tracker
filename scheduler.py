"""
Scheduler to run the price scraper automatically
Uses APScheduler to run jobs at specific times
"""

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
import json
import time
from datetime import datetime
from amazon_webscraper_selenium import scrape_with_selenium
from database import get_all_products, save_price, init_database

def load_config():
    """Load configuration from config.json"""
    with open('config.json', 'r') as f:
        return json.load(f)


def get_products_to_scrape():
    """Return the tracked products from the database, falling back to config.json if empty."""
    products = get_all_products()
    if products:
        return [(asin, name) for _, asin, name, _ in products]

    config = load_config()
    return [(product['asin'], product['name']) for product in config.get('products', [])]


def scrape_all_products():
    """
    Scrape prices for all tracked products in the database.
    This is the main job that runs on schedule.
    """
    print("\n" + "=" * 70)
    print(f"PRICE CHECK RUNNING AT {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 70)

    products = get_products_to_scrape()
    if not products:
        print("[SCHEDULER] No products available to scrape")
        return

    for asin, name in products:
        url = f"https://www.amazon.com/dp/{asin}"
        print(f"\nScraping: {name}")
        result = scrape_with_selenium(url)

        if result and result.get('price') is not None:
            alert_triggered = save_price(
                asin=asin,
                price=result['price'],
                title=result.get('title'),
                rating=result.get('rating')
            )

            if alert_triggered:
                print(f"🚨 PRICE ALERT for {name}: ${result['price']}")
        else:
            print(f"❌ Failed to scrape {name}")

        time.sleep(3)

    print("\n" + "=" * 70)
    print("PRICE CHECK COMPLETE")
    print("=" * 70 + "\n")

def setup_scheduler():
    """
    Set up the background scheduler
    """
    config = load_config()
    scheduler_config = config['scheduler']
    run_time = scheduler_config['run_time']  # Format: "09:00"
    
    # Parse time
    hour, minute = map(int, run_time.split(':'))
    
    scheduler = BackgroundScheduler()
    
    # Schedule job to run daily at specified time
    scheduler.add_job(
        scrape_all_products,
        trigger=CronTrigger(hour=hour, minute=minute),
        id='price_check',
        name='Daily Price Check',
        replace_existing=True
    )
    
    return scheduler

def start_scheduler():
    """
    Start the scheduler and keep it running
    """
    print("\n" + "=" * 70)
    print("PRICE TRACKER SCHEDULER STARTING")
    print("=" * 70)
    
    # Initialize database
    init_database()
    
    scheduler = setup_scheduler()
    scheduler.start()
    
    config = load_config()
    run_time = config['scheduler']['run_time']
    
    print(f"\n✓ Scheduler started!")
    print(f"✓ Scheduled to run daily at {run_time}")
    print(f"✓ Timezone: {config['scheduler']['timezone']}")
    print(f"✓ Tracking {len(config['products'])} product(s)")
    print("\n[Press Ctrl+C to stop the scheduler]\n")
    
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n\nScheduler stopped by user")
        scheduler.shutdown()

def run_scraper_now():
    """
    Run the scraper immediately (useful for testing)
    """
    init_database()
    scrape_all_products()

# ============ MANUAL TESTING ============
if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "now":
        # Run immediately for testing
        print("Running scraper NOW (not scheduled)...")
        run_scraper_now()
    else:
        # Start scheduled version
        start_scheduler()