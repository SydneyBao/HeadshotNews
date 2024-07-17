const functions = require("firebase-functions");
const admin = require("firebase-admin");
const chromium = require("chrome-aws-lambda");
const puppeteer = require("puppeteer-core");

admin.initializeApp();
const db = admin.firestore();

exports.onUserCreate = functions.firestore.document("users/{userid}")
    .onCreate(async (snap, context) => {
      const url = "https://en.wikipedia.org/wiki/Main_Page";

      let browser;
      let page;

      try {
        browser = await puppeteer.launch({
          args: [...chromium.args, "--no-sandbox"],
          defaultViewport: chromium.defaultViewport,
          executablePath: await chromium.executablePath,
          headless: chromium.headless,
        });

        page = await browser.newPage();
        await page.goto(url, {waitUntil: "networkidle0"});

        let imgSource = await page
            .$eval("#mp-otd #mp-otd-img img", (img) => img.src);

        if (imgSource) {
          imgSource = imgSource.replace("thumb/", "");
          const fileExIndex = Math.max(
              imgSource.indexOf(".jpg/"),
              imgSource.indexOf(".JPG/"),
              imgSource.indexOf(".png/"),
              imgSource.indexOf(".PNG/"),
          );
          imgSource = imgSource.substring(0, fileExIndex + 4);
        }

        const docRef = await db.collection("wikipedia_data").add({
          imgSource,
        });

        console.log(`Data stored successfully with ID: ${docRef.id}`);
      } catch (error) {
        console.error("Error in Cloud Function:", error);
      } finally {
        if (page) await page.close();
        if (browser) await browser.close();
      }
    });
