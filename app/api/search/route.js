import puppeteer from 'puppeteer';
import { NextResponse } from 'next/server';
import fs from 'fs';

// Helper function for random delays
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const randomDelay = () => delay(Math.random() * 1000 + 500); // 0.5s to 1.5s

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const searchQuery = searchParams.get('q');

  if (!searchQuery) {
    return NextResponse.json({ error: 'Search query is required' }, { status: 400 });
  }

  let browser = null;
  let page = null; // Define page here to access in finally for screenshots if needed

  try {
    console.log(`Launching browser for search: ${searchQuery}`);
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        // Consider '--single-process' only for debugging if issues persist
      ],
    });
    page = await browser.newPage();

    // 1. Set Realistic User-Agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36');

    // 3. Improve Viewport Settings
    await page.setViewport({ width: 1920, height: 1080 });

    const amazonUrl = `https://www.amazon.com/s?k=${encodeURIComponent(searchQuery)}`;

    // 2. Introduce Random Delay
    console.log('Applying random delay before navigation...');
    await randomDelay();

    console.log(`Navigating to: ${amazonUrl}`);
    await page.goto(amazonUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    // 4. Handle CAPTCHAs (Detection Only)
    const captchaKeywords = ['captcha', 'enter the characters you see below', 'api.amazon.com/captcha'];
    const pageContent = await page.content();
    const foundCaptcha = captchaKeywords.some(keyword => pageContent.toLowerCase().includes(keyword));

    if (foundCaptcha) {
      console.warn('CAPTCHA detected on page.');
      // await page.screenshot({ path: 'captcha_detected_screenshot.png' }); // For debugging
      return NextResponse.json({ error: 'CAPTCHA_DETECTED', message: 'Amazon is requesting a CAPTCHA. Please try again later or manually.' }, { status: 503 });
    }

    // Wait for search results to ensure page is loaded (selector might need adjustment)
    try {
      await page.waitForSelector('div[data-component-type="s-search-result"]', { timeout: 15000 }); // Increased timeout slightly
    } catch (e) {
      console.warn("Main search result selector 'div[data-component-type=\"s-search-result\"]' not found after CAPTCHA check. Page might not have loaded results as expected or structure changed.");
      // await page.screenshot({ path: 'debug_no_search_results_selector.png' });
      // Return empty or specific error if this selector is crucial
      return NextResponse.json({ error: 'Failed to find search results container. Amazon page structure might have changed.', products: [] }, { status: 200 });
    }

    console.log('Page loaded, attempting to scrape products...');
    // store content in a html file
    let pageContentHtml = await page.content();
    await fs.promises.writeFile('amazon_search_page.html', pageContentHtml);

    const products = await page.evaluate(() => {
      // 5. Refine Error Handling for Scraping (within page.evaluate)
      const productElements = Array.from(document.querySelectorAll('div[data-component-type="s-search-result"]')).slice(0, 5); // Limit to 5
      const results = [];

      productElements.forEach(el => {
        try {
          const nameElement = el.querySelector('h2 a.a-link-normal span.a-text-normal');
          const imageElement = el.querySelector('img.s-image');
          const priceElement = el.querySelector('.a-price .a-offscreen');
          const linkElement = el.querySelector('h2 a.a-link-normal');

          const name = nameElement ? nameElement.textContent.trim() : null;
          const imageUrl = imageElement ? imageElement.src : null;
          const price = priceElement ? priceElement.textContent.trim() : null;
          let productUrl = linkElement ? linkElement.getAttribute('href') : null;

          if (productUrl && !productUrl.startsWith('http')) {
            productUrl = `https://www.amazon.com${productUrl}`;
          }

          // Only add if core elements are found
          if (name && imageUrl && price && productUrl) {
            results.push({ name, imageUrl, price, url: productUrl });
          } else {
            // Log if a product-like element is missing crucial info
            console.warn('Skipping a product element due to missing name, image, price, or URL.');
          }
        } catch (e) {
          // Log error for a specific product element but continue with others
          console.error('Error processing a product element:', e.message);
        }
      });
      return results;
    });

    console.log(`Scraped ${products.length} products successfully.`);
    if (products.length === 0) {
      console.warn(`No products extracted for query: ${searchQuery}. This could be due to page structure changes, no results, or CAPTCHA-like interference not caught by basic check.`);
      // await page.screenshot({ path: 'debug_no_products_extracted.png' });
    }

    return NextResponse.json(products, { status: 200 });

  } catch (error) {
    console.error('Error during scraping:', error);
    // if (page) { // Ensure page is defined before trying to take a screenshot
    //   try {
    //     await page.screenshot({ path: 'error_screenshot.png' });
    //   } catch (ssError) {
    //     console.error('Failed to take error screenshot:', ssError);
    //   }
    // }
    return NextResponse.json({ error: 'Failed to scrape products', details: error.message }, { status: 500 });
  } finally {
    if (browser) {
      console.log('Closing browser...');
      try {
        await browser.close();
      } catch (closeError) {
        console.error('Error closing browser:', closeError);
      }
    }
  }
}
