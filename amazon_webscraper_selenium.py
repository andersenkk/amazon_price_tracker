"""
Amazon Price Scraper using Selenium

This scraper uses a headless Chrome browser to fetch Amazon product pages.
The browser looks like a real user, making it much harder for Amazon to block.

The scrape_with_selenium() function accepts any Amazon product URL and returns:
- title: Product name
- price: Current price as float
- rating: Product rating
- url: The URL that was scraped
- timestamp: When it was scraped

Usage:
    from amazon_scraper_selenium import scrape_with_selenium
    
    url = "https://www.amazon.com/dp/B01N5O7551"
    result = scrape_with_selenium(url)
    print(result['price'])  # 44.99
"""

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from bs4 import BeautifulSoup
import time

def setup_chrome_driver():
    """
    Set up a headless Chrome browser that mimics a real user.
    
    Returns:
        WebDriver: Selenium Chrome WebDriver instance, or None if failed
    """
    chrome_options = Options()
    
    # Run headless (no visible browser window)
    chrome_options.add_argument("--headless")
    
    # Set window size
    chrome_options.add_argument("--window-size=1920,1080")
    
    # User agent that looks like a real browser
    chrome_options.add_argument(
        "user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    )
    
    # Disable common bot detection
    chrome_options.add_argument("--disable-blink-features=AutomationControlled")
    chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
    chrome_options.add_experimental_option('useAutomationExtension', False)
    
    print("[DEBUG] Setting up Chrome driver...")
    
    # Use webdriver-manager to auto-download the correct driver
    try:
        from webdriver_manager.chrome import ChromeDriverManager
        driver = webdriver.Chrome(
            service=webdriver.chrome.service.Service(ChromeDriverManager().install()),
            options=chrome_options
        )
        return driver
    except ImportError:
        print("[ERROR] webdriver-manager not installed. Install with:")
        print("  pip install selenium webdriver-manager")
        return None
    except Exception as e:
        print(f"[ERROR] Failed to set up Chrome driver: {e}")
        return None

def scrape_with_selenium(url):
    """
    Scrape an Amazon product page and extract price, title, and rating.
    
    Args:
        url (str): Full Amazon product URL
                   Example: "https://www.amazon.com/dp/B01N5O7551"
    
    Returns:
        dict: Contains:
            - 'title': Product name (str or None)
            - 'price': Price as float (float or None)
            - 'rating': Star rating (str or None)
            - 'url': The URL that was scraped (str)
            - 'timestamp': When scraped (str)
        Or None if scraping failed
    
    Example:
        result = scrape_with_selenium("https://www.amazon.com/dp/B01N5O7551")
        if result and result['price']:
            print(f"Product: {result['title']}")
            print(f"Price: ${result['price']}")
    """
    driver = setup_chrome_driver()
    if not driver:
        return None
    
    try:
        print(f"[DEBUG] Opening {url}")
        driver.get(url)
        
        # Wait for page to load and JavaScript to render
        print("[DEBUG] Waiting for page to load...")
        time.sleep(3)
        
        # Get page source after JavaScript has rendered
        html = driver.page_source
        
        # Parse HTML with BeautifulSoup
        soup = BeautifulSoup(html, 'html.parser')
        
        # ============ Extract Title ============
        title = None
        title_span = soup.find('span', {'id': 'productTitle'})
        if title_span:
            title = title_span.get_text(strip=True)
            print(f"[SUCCESS] Title: {title}")
        else:
            print("[WARNING] Could not find title")
        
        # ============ Extract Price ============
        price = None
        
        # Try multiple CSS selectors (Amazon changes their HTML sometimes)
        price_selectors = [
            soup.find('span', {'class': 'a-price-whole'}),
            soup.find('span', {'data-a-color': 'price'}),
            soup.find('span', {'class': 'a-price'}),
        ]
        
        for price_elem in price_selectors:
            if price_elem:
                price_text = price_elem.get_text(strip=True)
                print(f"[DEBUG] Found price text: {price_text}")
                try:
                    # Remove $ and commas, convert to float
                    price = float(price_text.replace('$', '').replace(',', '').split()[0])
                    print(f"[SUCCESS] Price (parsed): ${price}")
                    break  # Found valid price, exit loop
                except ValueError:
                    print(f"[WARNING] Could not parse price: {price_text}")
                    continue
        
        if not price:
            print("[WARNING] Could not extract price from any selector")
        
        # ============ Extract Rating ============
        rating = None
        rating_span = soup.find('span', {'class': 'a-icon-star'})
        if rating_span:
            rating = rating_span.get_text(strip=True)
            print(f"[SUCCESS] Rating: {rating}")
        else:
            print("[WARNING] Could not find rating")
        
        # ============ Save HTML for Debugging ============
        with open('amazon_selenium.html', 'w', encoding='utf-8') as f:
            f.write(html)
        print("[DEBUG] HTML saved to amazon_selenium.html for inspection")
        
        # ============ Return Results ============
        return {
            'title': title,
            'price': price,
            'rating': rating,
            'url': url,
            'timestamp': time.strftime('%Y-%m-%d %H:%M:%S')
        }
        
    except Exception as e:
        print(f"[ERROR] Exception during scraping: {e}")
        return None
    
    finally:
        print("[DEBUG] Closing browser...")
        driver.quit()


# ============ Testing / Manual Execution ============
if __name__ == "__main__":
    """
    Test the scraper by running: python amazon_scraper_selenium.py
    """
    print("=" * 70)
    print("AMAZON SCRAPER - SELENIUM VERSION")
    print("=" * 70)
    print("\nUsing headless browser (more reliable, harder to block)\n")
    
    # Test with a sample product (change this to test different products)
    test_url = "https://www.amazon.com/dp/B01N5O7551"
    
    print(f"Testing with: {test_url}\n")
    result = scrape_with_selenium(test_url)
    
    if result:
        print("\n" + "=" * 70)
        print("SCRAPING RESULTS:")
        print("=" * 70)
        print(f"Title: {result['title']}")
        print(f"Price: ${result['price'] if result['price'] else 'N/A'}")
        print(f"Rating: {result['rating'] if result['rating'] else 'N/A'}")
        print(f"URL: {result['url']}")
        print(f"Timestamp: {result['timestamp']}")
        print("=" * 70)
    else:
        print("\n[ERROR] Scraping failed - check error messages above")