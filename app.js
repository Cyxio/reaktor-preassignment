import { serve } from "https://deno.land/std@0.65.0/http/server.ts";
import { renderFile } from 'https://raw.githubusercontent.com/syumai/dejs/master/mod.ts';

let port = 7777;
if (Deno.args.length > 0) {
  const lastArgument = Deno.args[Deno.args.length - 1];
  port = Number(lastArgument);
}

const server = serve({ port: port });

const manufList = [];
const manufAvailbList = {};
const availabilities = {};
let beanies = {};
let facemasks = {};
let gloves = {};

let fetchingItems = false;
let fetchingAvailabilities = false;

let successfulUpdate = new Date();

const fetchItems = async() => {
    let response = await fetch('https://bad-api-assignment.reaktor.com/v2/products/beanies');
    beanies = JSON.parse(await response.text());
    console.log("fetched beanies");
    response = await fetch('https://bad-api-assignment.reaktor.com/v2/products/facemasks');
    facemasks = JSON.parse(await response.text());
    console.log("fetched facemasks");
    response = await fetch('https://bad-api-assignment.reaktor.com/v2/products/gloves');
    gloves = JSON.parse(await response.text());
    console.log("fetched gloves");
    for (const item of beanies.concat(facemasks, gloves)){
        if (!manufList.includes(item.manufacturer))
            manufList.push(item.manufacturer);
    }
    console.log("items fetched.");
    console.log("manufacturers found: " + manufList);
    fetchingItems = false;
}

const fetchAvailabilities = async() => {
    for (const manufacturer of manufList) {
        let tries = 1;
        console.log(`fetching availabilities for ${manufacturer}...`);
        let availability = await fetch(`https://bad-api-assignment.reaktor.com/v2/availability/${manufacturer}`);
        let avb = JSON.parse(await availability.text());
        //check response value to see if fetch was successful, indicated by response length !== 2
        while (avb.response.length === 2){
            if(tries > 5){
                console.log("Unable to reach API");
                break;
            }
            console.log(`fetch failed, retrying...(${tries}/5)`)
            availability = await fetch(`https://bad-api-assignment.reaktor.com/v2/availability/${manufacturer}`);
            avb = JSON.parse(await availability.text());
            tries++;
        }
        if(avb.response.length === 2){
            console.log(`fetch failed for ${manufacturer}`);
            continue;
        }
        manufAvailbList[manufacturer] = avb.response;
        console.log(`fetch successful for ${manufacturer}, amount of ID:s ${manufAvailbList[manufacturer].length}`);
        console.log(`total manufacturer availabilities fetched: ${1 + manufList.indexOf(manufacturer)}`);
    } 
    //update dictionary of all availabilities
    for (const [manuf, json] of Object.entries(manufAvailbList)){
        if (!json) 
            continue;
        for (const item of json){
            let str = item.DATAPAYLOAD;
            str = str.split('<INSTOCKVALUE>')[1];
            str = str.split('</INSTOCKVALUE>')[0];
            availabilities[(item.id).toLowerCase()] = str;
        }
    }
    console.log("availabilities updated");
    fetchingAvailabilities = false;
    successfulUpdate = new Date();
}

await fetchItems();
await fetchAvailabilities();

for await (const request of server) {
    //handle icon request before anything else
    if (request.url === "/favicon.ico"){
        request.respond({
            body: await Deno.readFile("favicon.png"),
            headers: new Headers({
                "Content-Type": "image/png",
            })
        });
        continue;
    }
    if (request.url === "/styles.css"){
        request.respond({
            body: await Deno.readFile("styles.css"),
            headers: new Headers({
                "Content-Type": "text/css",
            })
        });
        continue;
    }
    //start another fetch asynchronously
    if (!fetchingItems) {
        fetchingItems = true;
        fetchItems();
    }
    if (!fetchingAvailabilities){
        fetchingAvailabilities = true;
        fetchAvailabilities();
    }
    if (request.url === "/beanies")
        request.respond({ body: await renderFile('index.ejs', { items: beanies, avb: availabilities, update: successfulUpdate}) });
    else if (request.url === "/facemasks")
        request.respond({ body: await renderFile('index.ejs', { items: facemasks, avb: availabilities, update: successfulUpdate}) });
    else if (request.url === "/gloves")
        request.respond({ body: await renderFile('index.ejs', { items: gloves, avb: availabilities, update: successfulUpdate}) });
    else if (request.url === "/")
        request.respond({ body: await renderFile('index.ejs', { items: null, avb: null, update: null}) });
    else { //redirect to landing page
        request.respond({
            status: 303,
            headers: new Headers({
                'Location': "/",
            })
        });
    }
}