import puppeteer from 'puppeteer';
import { NextResponse } from 'next/server';

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
  let page = null;

  try {
    console.log(`[Scrape Start] Launching browser for search: ${searchQuery}`);
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
      ],
    });
    page = await browser.newPage();

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });

    const amazonUrl = `https://www.amazon.com/s?k=${encodeURIComponent(searchQuery)}`;

    console.log('[Scrape Nav] Applying random delay before navigation...');
    await randomDelay();

    console.log(`[Scrape Nav] Navigating to: ${amazonUrl}`);
    await page.goto(amazonUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    const captchaKeywords = ['captcha', 'enter the characters you see below', 'api.amazon.com/captcha'];
    const pageContent = await page.content();
    const foundCaptcha = captchaKeywords.some(keyword => pageContent.toLowerCase().includes(keyword));

    if (foundCaptcha) {
      console.warn('[Scrape CAPTCHA] CAPTCHA detected on page.');
      // await page.screenshot({ path: 'captcha_detected_screenshot.png' });
      return NextResponse.json({ error: 'CAPTCHA_DETECTED', message: 'Amazon is requesting a CAPTCHA. Please try again later or manually.' }, { status: 503 });
    }

    // Updated waitForSelector logic
    const mainProductSelector = 'div.s-result-item[data-asin]';
    try {
      console.log(`[Scrape Wait] Waiting for main product selector '${mainProductSelector}'...`);
      await page.waitForSelector(mainProductSelector, { timeout: 20000 }); // Increased timeout
      console.log(`[Scrape Wait] Main product selector '${mainProductSelector}' found.`);
    } catch (e) {
      console.warn(`[Scrape Wait] Timeout or error waiting for main product selector '${mainProductSelector}'. Page might not have loaded results as expected or structure changed. Error: ${e.message}`);
      // await page.screenshot({ path: 'debug_no_main_selector_found.png' });
      // No need to close browser here, finally block will handle it.
      return NextResponse.json({ error: `Failed to find search results container ('${mainProductSelector}'). Amazon page structure might have changed.`, products: [] }, { status: 200 });
    }

    console.log('[Scrape Eval] Page loaded, attempting to scrape products...');
    const products = await page.evaluate((passedMainSelector) => {
      const productElementsAll = Array.from(document.querySelectorAll(passedMainSelector));
      console.log(`[Eval] Found ${productElementsAll.length} raw product container elements using selector '${passedMainSelector}'.`);

      const productElements = productElementsAll.slice(0, 5);
      console.log(`[Eval] Processing up to ${productElements.length} product elements.`);
      const results = [];

      productElements.forEach((el, index) => {
        console.log(`[Eval Item ${index}] --- Start Processing Product Element #${index} ---`);
        if (index < 2) { // Log outerHTML for the first two items for structure review
            console.log(`[Eval Item ${index}] OuterHTML sample (first 600 chars): ${el.outerHTML.substring(0, 600)}`);
        }

        let name = null, imageUrl = null, price = null, productUrl = null;

        try {
          // Product Link (Primary source for URL, can also help find Name)
          // Adjusted to look for a link within a title structure, common in cards
          const linkSelector = "a.a-link-normal.s-no-outline, div[data-cy='title-recipe'] a.a-link-normal, .s-product-image-container a.s-no-outline"; // Try a few common patterns for the main product link
          const linkElement = el.querySelector(linkSelector);
          if (linkElement) {
            let href = linkElement.getAttribute('href');
            if (href && !href.startsWith('http')) {
              href = `https://www.amazon.com${href}`;
            }
            productUrl = href;
            console.log(`[Eval Item ${index}] Link selector ('${linkSelector}') found. Extracted productUrl: "${productUrl}"`);
          } else {
            console.log(`[Eval Item ${index}] Link selector ('${linkSelector}') FAILED.`);
          }

          // Product Name
          // Using a more specific selector based on data-cy and typical heading structure
          const nameSelector = "div[data-cy='title-recipe'] h2 span, span.a-size-medium.a-color-base.a-text-normal, h2.a-size-mini.a-spacing-none.a-color-base span.a-text-normal"; // Common name patterns
          const nameElement = el.querySelector(nameSelector);
          if (nameElement) {
            name = nameElement.textContent.trim();
            console.log(`[Eval Item ${index}] Name selector ('${nameSelector}') found. Extracted name: "${name}"`);
          } else {
            console.log(`[Eval Item ${index}] Name selector ('${nameSelector}') FAILED.`);
          }

          // Product Image URL
          const imageSelector = 'img.s-image'; // This one is often stable
          const imageElement = el.querySelector(imageSelector);
          if (imageElement) {
            imageUrl = imageElement.src;
            console.log(`[Eval Item ${index}] Image selector ('${imageSelector}') found. Extracted imageUrl: "${imageUrl}"`);
          } else {
            console.log(`[Eval Item ${index}] Image selector ('${imageSelector}') FAILED.`);
          }

          // Product Price
          // Using a more specific selector based on data-cy
          const priceSelector = "div[data-cy='price-recipe'] span.a-offscreen, span.a-price span.a-offscreen"; // Common price patterns
          const priceElement = el.querySelector(priceSelector);
          if (priceElement) {
            price = priceElement.textContent.trim();
            console.log(`[Eval Item ${index}] Price selector ('${priceSelector}') found. Extracted price: "${price}"`);
          } else {
            console.log(`[Eval Item ${index}] Price selector ('${priceSelector}') FAILED.`);
          }

          if (name && imageUrl && price && productUrl) {
            results.push({ name, imageUrl, price, url: productUrl });
            console.log(`[Eval Item ${index}] Added product to results: "${name}"`);
          } else {
            console.warn(`[Eval Item ${index}] Skipped product element due to missing critical data. Name: ${!!name}, Image: ${!!imageUrl}, Price: ${!!price}, URL: ${!!productUrl}`);
            if (index < 2 || !name || !imageUrl || !price || !productUrl) { // Log more details for initial items or if anything is missing
                 console.log(`[Eval Item ${index}] Detailed HTML for skipped/incomplete item (first 600 chars): ${el.outerHTML.substring(0,600)}`);
            }
          }
        } catch (e) {
          console.error(`[Eval Item ${index}] EXCEPTION while processing product element: ${e.message}. Element HTML (first 600 chars): ${el.outerHTML.substring(0,600)}`, e.stack);
        }
        console.log(`[Eval Item ${index}] --- End Processing Product Element #${index} ---`);
      });
      return results;
    }, mainProductSelector); // Pass mainProductSelector to page.evaluate

    console.log(`[Scrape Result] Scraped ${products.length} products successfully.`);
    if (products.length === 0) {
      console.warn(`[Scrape Result] No products extracted for query: ${searchQuery}. This could be due to page structure changes, no actual results, or CAPTCHA-like interference not caught by basic check.`);
      // await page.screenshot({ path: 'debug_no_products_extracted.png' });
    }

    return NextResponse.json(products, { status: 200 });

  } catch (error) {
    console.error('[Scrape Error] Overall error during scraping pipeline:', error);
    // if (page) { await page.screenshot({ path: 'error_screenshot.png' }); }
    return NextResponse.json({ error: 'Failed to scrape products', details: error.message }, { status: 500 });
  } finally {
    if (browser) {
      console.log('[Scrape End] Closing browser...');
      try {
        await browser.close();
      } catch (closeError) {
        console.error('[Scrape Error] Error closing browser:', closeError);
      }
    }
  }
}
