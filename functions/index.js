const functions = require("firebase-functions");
const admin = require("firebase-admin");
const chromium = require("chrome-aws-lambda");
const puppeteer = require("puppeteer-core");

admin.initializeApp();
const db = admin.firestore();

exports.scraper = functions
    .region('us-west2')
    .runWith({memory: '2GB'})
    .scraper.schedule("0 0 * * *")
    .timeZone("America/Los_Angeles")
    .onRun(async () => {

      let browser;
      let page;
      let docRef;

      try {
        browser = await puppeteer.launch({
          args: [...chromium.args, "--no-sandbox"],
          defaultViewport: chromium.defaultViewport,
          executablePath: await chromium.executablePath,
          headless: chromium.headless,
        });

        page = await browser.newPage();
        
        // Counter-Strike.net
        await page.goto('https://www.counter-strike.net/news', { waitUntil: 'networkidle0' });
        let articles = await page.$$('.blogcapsule_BlogCapsule_3OBoG');

        for (const a of articles) {
            const title = await a.$eval('.blogcapsule_Title_39UGs', node => node.innerText);
            const url = await a.evaluate(node => node.href);
            const image = await a.$eval('.blogcapsule_Image_Nh_xZ', node => node.style.backgroundImage.slice(5, -2));
            
            docRef = await db.collection("news_data").add({
              title, url, image
            });
        }

        //htlv
        await page.goto('https://www.hltv.org/news/archive/2024/May', { waitUntil: 'networkidle0' });
        articles = await page.$$('.article');

        for (const a of articles) {
            const title = await a.$eval('.newstext', node => node.innerText);
            const date = await a.$eval('.newsrecent', node => node.innerText);
            const url = await a.evaluate(node => node.href);
            const image = await a.$eval('img', node => node.src);
            
            docRef = await db.collection("news_data").add({
              title, url, image
            });
        }

        //dust2
        await page.goto('https://www.dust2.us/archive?offset=0', { waitUntil: 'networkidle0' });
        const dateHeaders = await page.$$('.group-header');
        
        for (let d of dateHeaders) {
            const date = await page.evaluate(element => element.textContent, d);
            
            const articleSelectorHandle = await page.evaluateHandle(el => el.parentElement, d);
            const articles = await articleSelectorHandle.$$('.archive-news-item');

            for (let a of articles) {
                const title = await a.$eval('.news-item-header', element => element.textContent);
                const url = await a.$eval('a', element => element.href);
                const image = await a.$eval('img', element => element.src);
                
                docRef = await db.collection("news_data").add({
                  title, url, image
                });
            }
        }

        //dbltap
        await page.goto('https://www.dbltap.com/leagues/counter-strike-global-offensive', { waitUntil: 'networkidle0' });
        articles = await page.$$('article');

        for (const a of articles) {
            let author;
            try {
                author = (await page.evaluate(el => el.querySelector('h4').textContent, a)).split('|')[0].trim();
            } catch {
                author = (await page.evaluate(el => el.querySelector('h5').textContent, a)).split('|')[0].trim();
            }
    
            if (author !== 'Max Mallow' && author !== 'Alexandra Hobbs' && author !== 'Conner Dejecacion') {
                const title = await page.evaluate(el => el.querySelector('h3').textContent, a);
                const date = await page.evaluate(el => el.querySelector('time').textContent, a);
                const url = await page.evaluate(el => el.querySelector('a').href, a);
                const imageSelector = 'img';
                await a.waitForSelector(imageSelector, { timeout: 10000 });
                const image = await a.$eval(imageSelector, img => img.src);
                
                docRef = await db.collection("news_data").add({
                  title, url, image
                });
            }
        }
        console.log(`Data stored successfully with ID: ${docRef.id}`);
      } catch (error) {
        console.error("Error in Cloud Function:", error);
      } finally {
        if (page) await page.close();
        if (browser) await browser.close();
      }
    });
