const functions = require("firebase-functions");
const admin = require("firebase-admin");
const chromium = require("chrome-aws-lambda");
const puppeteer = require("puppeteer-core");

admin.initializeApp();
const db = admin.firestore();

exports.scraper = functions
    .region('us-west2')
    .runWith({memory: '2GB'})
    .pubsub.schedule("0 0 * * *")
    .timeZone("America/Los_Angeles")
    .onRun(async () => {

      let browser;
      let page;
      const batch = db.batch();

      async function addArticleIfNotExists(title, data) {
        const docRef = db.collection("news").doc(shortenDocId(title));
        const doc = await docRef.get();
        
        if (!doc.exists) {
          batch.set(docRef, data);
        }
      }

      function shortenDocId(title) {
        const maxBytes = 1500;
        title = title.replace(/\./g, '');
        title = title.charAt(0).toUpperCase() + title.slice(1);
        let bytes = Buffer.byteLength(title, 'utf8');
        if (bytes < maxBytes) return title;

        while (bytes > maxBytes) {
          title = title.slice(0, -1);
          bytes = buffer.byteLength(title, 'utf8');
        }

        return title;
      }

      try {
        browser = await puppeteer.launch({
          args: [...chromium.args, "--no-sandbox"],
          defaultViewport: chromium.defaultViewport,
          executablePath: await chromium.executablePath,
          headless: chromium.headless,
        });

        page = await browser.newPage();

        const date = new Date();
        const year = date.getFullYear();
        const month = date.getMonth() + 1; 
        
        // Counter-Strike.net
        await page.goto('https://www.counter-strike.net/news', { waitUntil: 'networkidle0' });
        let articles = await page.$$('.blogcapsule_BlogCapsule_3OBoG');

        for (const a of articles) {
            const title = await a.$eval('.blogcapsule_Title_39UGs', node => node.innerText);
            const url = await a.evaluate(node => node.href);
            const image = await a.$eval('.blogcapsule_Image_Nh_xZ', node => node.style.backgroundImage.slice(5, -2));
            
            await addArticleIfNotExists(title, {title, url, image, source: 'counter-strike.net'});
        }

        //hltv
        await page.goto(`https://www.hltv.org/news/archive/${year}/${month}`, { waitUntil: 'networkidle0' });

        for (const a of articles) {
            const title = await a.$eval('.newstext', node => node.innerText);
            //const date = await a.$eval('.newsrecent', node => node.innerText);
            const url = await a.evaluate(node => node.href);
            const flag = await a.$eval('img', node => node.alt);

            let image;
            if (flag == "Saudi Arabia") {
              image = "https://cdn.britannica.com/79/5779-050-46C999AF/Flag-Saudi-Arabia.jpg"
            } else if (flag == "Brazil") {
              image = "https://cdn.britannica.com/47/6847-004-7D668BB0/Flag-Brazil.jpg"
            } else if (flag == "Denmark") {
              image = "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT_dRTRgh2t_ffybz6XN94k0ghlA8H3eiqeaA&s"
            } else if (flag == "Russia") {
              image = "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTSBSsV2up86rvStJSG-tDxoYiHfyl-1DVY5A&s"
            } else {
              image = await a.$eval('img', node => node.src);
            } 
            
            await addArticleIfNotExists(title, {title, url, image, source: 'hltv.org'});
        }

        //dust2
        await page.goto('https://www.dust2.us/archive?offset=0', { waitUntil: 'networkidle0' });
        const dateHeaders = await page.$$('.group-header');
        
        for (let d of dateHeaders) {
            //const date = await page.evaluate(element => element.textContent, d);
            
            const articleSelectorHandle = await page.evaluateHandle(el => el.parentElement, d);
            const articles = await articleSelectorHandle.$$('.archive-news-item');

            for (let a of articles) {
                const title = await a.$eval('.news-item-header', element => element.textContent);
                const url = await a.$eval('a', element => element.href);
                const image = await a.$eval('img', element => element.src);
                
                await addArticleIfNotExists(title, {title, url, image, source: 'dust2.us'});
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
                
                if (date.slice(0, 4) == year) {
                  await addArticleIfNotExists(title, {title, url, image, source: 'dbltap.com'});
                }
            }
        }

        await batch.commit();
        console.log("Data update completed successfully");
      } catch (error) {
        console.error("Error in Cloud Function:", error);
      } finally {
        if (page) await page.close();
        if (browser) await browser.close();
      }
    });