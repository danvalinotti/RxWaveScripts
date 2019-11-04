const fs = require('fs');
const fetch = require('node-fetch');
const notifier = require('node-notifier');
const generateUrl = require('./genUrl.js');
const mongoose = require('mongoose');
mongoose.connect('mongodb://54.81.21.172:27017/rxwave_testing', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(r => console.log("Connected to MongoDB"));
const Schema = mongoose.Schema;
const ObjectId = mongoose.ObjectId;
const GoodRxIdSchema = new Schema({
    id: ObjectId,
    drugName: String,
    drugForm: String,
    dosageStrength: String,
    dosageStrengthNum: {type: Number, default: 0},
    dosageStrengthUnit: {type: String, default: ''},
    volumeNum: {type: Number, default: 0},
    volumeUnit: {type: String, default: ''},
    quantity: Number,
    gsn: String,
    ndc: String,
    goodRxId: String,
    url: String
});
const GoodRxIdModel = mongoose.model('GoodRxId', GoodRxIdSchema);

function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function test() {
    let file = fs.readFileSync('full_drug_list.json');
    let drugs = JSON.parse(file.toString());
    fs.truncateSync('grx_ids.json');
    console.log('id file cleared');
    let count = 1;
    let fails = [];

    for (let drug of drugs) {
        const res = await fetchId(drug, count);
        console.log(count);
        count += 1;

        if (res.drugName !== undefined) {
            let model = new GoodRxIdModel(res);
            await model.save(function(err, res) {
                if (err) {
                    return console.log(err);
                } else {
                    return console.log(`Saved '${model.drugName}' to DB`)
                }
            });
        } else {
            fails.push(res);
            console.log(`Did NOT save to DB.`);
        }
    }

    try {
        const writeText = JSON.stringify(fails);
        fs.writeFile('grx_ids.json', writeText, function(err, result) {
            if (err) console.log(err);
            console.log("Write complete");
            process.exit();
        });
    } catch (error) {
        console.log(error);
    }
}

async function fetchId(drug, count) {
    const res = generateUrl(drug);
    let response;
    let model = res.model;
    await fetch(res.url, {
        method: 'get',
        headers: {
            "Referer": "https://www.goodrx.com/",
            "Upgrade-Insecure-Requests": "1",
            "Cookie": "csrf_token=7ee783ebc36e452eb7a6ba1eb94d6619; _pxhd=43262d68911141ef14d9fd56b7b8ea1f38a25fdb45529e55c73e7e70b1492cfb:9af60001-ff15-11e9-8a21-f9624b57fc46; myrx_exp_ab_variant=experiment; goodrx-v2=2bfd1f94fecc962afe60983e7e504d5ff34a951eQJuh8AMCfM7izbZ5molYttVO6iiksqCVkDmoQoThI5vz8M3pRVaYqj2JfF/FaUuts3SLQBzBUqiT0UD9l3irIo+ParqhT4W6msLKeym9iuDn3EZw38prg33HTWqjBsguqpWSGytqpluyWP6Iyqm3tYQ89xvsOz5rWJ5F285t7ez7d/WXeJrnNRd5QffT/tdexwKb+XTYNZ6n5KmcNWeBRnrcxgNmepjFH97ccw1zPXAV7n+LwMO9tbpgAepsiTyIbejhAtJP646Ifs52xvhrwM8r24YxgmRpgrYJUps99HBlVoY2qgY7hmqvrhJfZVxt47zrDw==; variantCookie=2; cto_lwid=7d5070ad-7c7d-425e-8b6f-303e2087726f; _fbp=fb.1.1572880389327.298292437; _pxvid=9af60001-ff15-11e9-8a21-f9624b57fc46; ki_t=1572880389531%3B1572880389531%3B1572880389531%3B1%3B1; ki_r=; _ga=GA1.2.780810564.1572880390; _gid=GA1.2.1472612913.1572880390; rsci_vid=bc5663d0-7102-0dee-26f7-b2d2cc07a7fa; _dc_gtm_UA-24914838-1=1; _gat_UA-24914838-1=1",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.87 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
    }).then((response) => {
        if (response.status === 403) {
            console.log(response.status, 'Waiting 30s...');
            notifier.notify({
                title: "Drug request failed",
                message: `Request blocked for ${drug.BrandName}, retrying in 60s`
            });
            let fix = '';
            timeout(60000).then(async () => {
                await fetchId(drug, count).then((res) => {
                    fix = res;
                    console.log(fix);
                }).catch((error) => console.log(error));
            });
        } else {
            return response.text();
        }
    })
    .then((text) => {
        if (!text) {
            return null;
        } else {
            return extractId(text)
        }
    })
    .then((id) => {
        response = id;
    })
    .catch((error) => console.log(error));
    let t = 20000;
    if (count % 30 === 0) {
        t = 60000;
    }

    console.log(`Waiting ${t / 1000.0}s...`);
    return timeout(t).then(() => {
        model.goodRxId = response;
        console.log(model);
        return model;
    });
}

function extractId(text) {
    const start_index = text.indexOf("drug_id=") + 8;
    const end_index = start_index + text.substring(start_index).indexOf("&");

    if (end_index - start_index < 15) {
        return text.substring(start_index, end_index);
    } else {
        return null;
    }
}

test();