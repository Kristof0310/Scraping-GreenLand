const puppeteer = require("puppeteer");
const fs = require("fs");
const cron = require("node-cron");

async function scrapeData() {
  const browser = await puppeteer.launch();
  function delay(time) {
    return new Promise(function (resolve) {
      setTimeout(resolve, time);
    });
  }
  // Create a new page instance
  const page = await browser.newPage();

  // Navigate to the target webpage
  await page.goto("https://gjob.dk/sog-job/");

  // Wait for the necessary elements to load
  await page.waitForSelector("#js-job-list > div.job-list__result");
  let urls = [];
  let titles = [];
  let locations = [];
  let deadlines = [];
  let descriptions = [];
  let applyUrls = [];

  //get total page count

  let pageCount = Math.floor(
    Number(
      await page.$eval(
        "#js-job-list > div.job-list__result > div.job-list__result-content > p",
        (element) => element.textContent.trim().split(" af ")[1]
      )
    ) / 10
  );

  let pagePromise = async (link) => {
    // Initalize the new page instance and the data object to store information.
    let dataObj = {};
    let newPage = await browser.newPage();
    await newPage.goto(link);
    const frames = await newPage.frames();
    const contentFrame = frames[1];
    await contentFrame.waitForSelector("#Body_MindKeyVacancyDetail > div");
    // Scrape revelant data fields.
    dataObj["Description"] = await contentFrame.$eval(
      "#Body_MindKeyVacancyDetail > div",
      (element) => element.innerHTML.trim()
    );
    dataObj["ApplyUrl"] = await contentFrame.$eval(
      "#Body_MindKeyVacancyDetail > div > div > a",
      (element) => element.href
    );
    // Return data object.
    await newPage.close();
    return dataObj;
  };

  for (i = 0; i < pageCount; i++) {
    await page.click(
      "#js-job-list > div.job-list__result > div.job-list__result-content > button"
    );
    await delay(100);
  }
  // Extract data from the each page
  await page.waitForSelector("#js-job-list > div.job-list__result");
  urls = await page.$$eval(
    "#js-job-list > div.job-list__result > div.row > a",
    (url) => {
      url = url.map((element) => element.href);
      return url;
    }
  );

  titles = await page.$$eval(
    "#js-job-list > div.job-list__result > div.row > a > div.col-xs-5",
    (title) => {
      title = title.map((element) =>
        element.textContent.trim().replaceAll("&", "&amp;")
      );
      return title;
    }
  );

  locations = await page.$$eval(
    "#js-job-list > div.job-list__result > div.row > a > div.col-xs-4",
    (location) => {
      location = location.map((element) =>
        element.textContent.trim().replaceAll("&", "&amp;")
      );
      return location;
    }
  );

  deadlines = await page.$$eval(
    "#js-job-list > div.job-list__result > div.row > a > div.col-xs-3",
    (deadline) => {
      deadline = deadline.map((element) =>
        element.textContent.trim().replace("-", "/")
      );
      return deadline;
    }
  );

  for (url in urls) {
    let currentPageData = await pagePromise(urls[url]);
    descriptions.push(currentPageData["Description"]);
    applyUrls.push(currentPageData["ApplyUrl"].replaceAll("&", "&amp;"));
  }

  // Combine data into an array of objects
  const combinedData = urls.map((url, index) => ({
    title: titles[index],
    location: locations[index],
    deadline: deadlines[index],
    description: descriptions[index],
    applyUrl: applyUrls[index],
  }));

  // Convert data to XML format
  const xmlData = `
  <jobs>
    ${combinedData
      .map(
        (job) => `
      <job>
        <title>${job.title}</title>
        <location>${job.location}</location>
        <deadline>${job.deadline}</deadline>
        <description><![CDATA[${job.description}]]></description>
        <applyUrl>${job.applyUrl}</applyUrl>
      </job>
    `
      )
      .join("")}
  </jobs>
`;

  // Write XML data to a file
  fs.writeFileSync("scraped_jobs.xml", xmlData);
  // Close the browser
  await browser.close();
}

scrapeData();
// Execute the scraping function every 1 hour
cron.schedule("0 0 * * *", scrapeData);
