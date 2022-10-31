import fetch from "node-fetch";
import cheerio from "cheerio";
import chrome from "chrome-cookies-secure"

const parseCookies = (cookies) => {
    return Object.entries(cookies).map(([key, value]) => `${key}=${value}`).join("; ")
}

chrome.getCookies("https://open.spotify.com", async (err, cookies) => {
    const request = await fetch("https://open.spotify.com", {
        headers: {
            Cookie: parseCookies(cookies),
        }
    })

    if (!request.status === 200) {
        console.log("Request failed")
        return
    }

    const data = await request.text();

    const $ = cheerio.load(data);
    
    const session = JSON.parse($('script#session').text());

    console.log(session.accessToken);

})