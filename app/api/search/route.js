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
      return NextResponse.json({ error: 'CAPTCHA_DETECTED', message: 'Amazon is requesting a CAPTCHA. Please try again later or manually.' }, { status: 503 });
    }

    try {
      await page.waitForSelector('div[data-component-type="s-search-result"]', { timeout: 15000 });
    } catch (e) {
      console.warn("[Scrape Selector] Main search result selector 'div[data-component-type=\"s-search-result\"]' not found. Page might not have loaded results as expected or structure changed.");
      return NextResponse.json({ error: 'Failed to find search results container. Amazon page structure might have changed.', products: [] }, { status: 200 });
    }

    console.log('[Scrape Eval] Page loaded, attempting to scrape products...');
    const products = await page.evaluate(() => {
      const productContainerSelector = 'div[data-component-type="s-search-result"]';
      const productElementsAll = Array.from(document.querySelectorAll(productContainerSelector));
      // Log initial count of found containers
      console.log(`[Eval] Found ${productElementsAll.length} raw product container elements using selector '${productContainerSelector}'.`);

      const productElements = productElementsAll.slice(0, 5); // Limit to 5 for processing
      console.log(`[Eval] Processing up to ${productElements.length} product elements.`);
      const results = [];

      productElements.forEach((el, index) => {
        console.log(`[Eval Item ${index}] --- Start Processing Product Element #${index} ---`);
        // Log a sample of outerHTML if a critical piece of info is missing later, or for the first item
        if (index === 0) {
            console.log(`[Eval Item ${index}] OuterHTML sample (first 500 chars): ${el.outerHTML.substring(0, 500)}`);
        }

        let name = null, imageUrl = null, price = null, productUrl = null;

        try {
          // Product Name
          const nameSelector = 'h2 a.a-link-normal span.a-text-normal';
          const nameElement = el.querySelector(nameSelector);
          if (nameElement) {
            name = nameElement.textContent.trim();
            console.log(`[Eval Item ${index}] Name selector ('${nameSelector}') found. Extracted name: "${name}"`);
          } else {
            console.log(`[Eval Item ${index}] Name selector ('${nameSelector}') FAILED.`);
            // console.log(`[Eval Item ${index}] OuterHTML for failed name: ${el.outerHTML.substring(0, 500)}`); // Log if name is critical and missing
          }

          // Product Image URL
          const imageSelector = 'img.s-image';
          const imageElement = el.querySelector(imageSelector);
          if (imageElement) {
            imageUrl = imageElement.src;
            console.log(`[Eval Item ${index}] Image selector ('${imageSelector}') found. Extracted imageUrl: "${imageUrl}"`);
          } else {
            console.log(`[Eval Item ${index}] Image selector ('${imageSelector}') FAILED.`);
          }

          // Product Price
          const priceSelector = '.a-price .a-offscreen';
          const priceElement = el.querySelector(priceSelector);
          if (priceElement) {
            price = priceElement.textContent.trim();
            console.log(`[Eval Item ${index}] Price selector ('${priceSelector}') found. Extracted price: "${price}"`);
          } else {
            console.log(`[Eval Item ${index}] Price selector ('${priceSelector}') FAILED.`);
          }

          // Product Page Link
          const linkSelector = 'h2 a.a-link-normal';
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

          if (name && imageUrl && price && productUrl) {
            results.push({ name, imageUrl, price, url: productUrl });
            console.log(`[Eval Item ${index}] Added product to results: "${name}"`);
          } else {
            console.warn(`[Eval Item ${index}] Skipped product element due to missing critical data. Name: ${!!name}, Image: ${!!imageUrl}, Price: ${!!price}, URL: ${!!productUrl}`);
            if (!name) console.log(`[Eval Item ${index}] OuterHTML for element missing name (first 500 chars): ${el.outerHTML.substring(0,500)}`);

          }
        } catch (e) {
          console.error(`[Eval Item ${index}] EXCEPTION while processing product element: ${e.message}. Element HTML (first 500 chars): ${el.outerHTML.substring(0,500)}`, e.stack);
        }
        console.log(`[Eval Item ${index}] --- End Processing Product Element #${index} ---`);
      });
      return results;
    });

    console.log(`[Scrape Result] Scraped ${products.length} products successfully.`);
    if (products.length === 0) {
      console.warn(`[Scrape Result] No products extracted for query: ${searchQuery}. This could be due to page structure changes, no actual results, or CAPTCHA-like interference not caught by basic check.`);
    }

    return NextResponse.json(products, { status: 200 });

  } catch (error) {
    console.error('[Scrape Error] Overall error during scraping pipeline:', error);
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
