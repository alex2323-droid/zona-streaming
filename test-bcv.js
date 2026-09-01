import https from 'https';
import * as cheerio from 'cheerio';

https.get('https://www.bcv.org.ve/', { rejectUnauthorized: false }, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    const $ = cheerio.load(data);
    const usd = $('#dolar strong').text().trim();
    const euro = $('#euro strong').text().trim();
    const cny = $('#yuan strong').text().trim();
    const try_ = $('#lira strong').text().trim();
    const rub = $('#rublo strong').text().trim();
    console.log({ usd, euro, cny, try_, rub });
  });
});
