const fs = require('fs');
const fetch = require('node-fetch');
const notifier = require('node-notifier');
const generateUrl = require('./genGoodRxUrl.js');
const mongoose = require('mongoose');
mongoose.connect('mongodb://54.81.21.172:27017/rxwave_testing', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log("Connected to MongoDB"));
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

async function testfix() {
    let file = fs.readFileSync('nulls.json');
    let drugs = JSON.parse(file.toString());
    let count = 1;
    let fails = [];

    for (let drug of drugs) {
        const res = await fetchNulls(drug.url, count);
        console.log(count);
        count += 1;

        if (res === null) {
            fails.push(drug);
        } else {
            await GoodRxIdModel.updateOne({_id: drug._id}, {goodRxId: res}, function(err) {
                if (err) console.log(err);
                console.log(`Updated ${drug.drugName}`)
            });
        }
    }

    try {
        const writeText = JSON.stringify(fails);
        fs.writeFile('final_nulls.json', writeText, function (err) {
            if (err) console.log(err);
            console.log("Write complete");
            process.exit();
        });
    } catch (error) {
        console.log(error);
    }
}

async function test() {
    let file = fs.readFileSync('exceptions.json');
    let drugs = JSON.parse(file.toString());
    let count = 1;
    let fails = [];

    for (let drug of drugs) {
        const res = await fetchId(drug, count);
        console.log(count);
        count += 1;

        if (res.drugName !== undefined) {
            let model = new GoodRxIdModel(res);
            await model.save(function (err) {
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
        fs.writeFile('final_exceptions.json', writeText, function (err) {
            if (err) console.log(err);
            console.log("Write complete");
            process.exit();
        });
    } catch (error) {
        console.log(error);
    }
}

async function fetchNulls(url, count) {
    let response;
    console.log(url);
    let i = count % 7;
    await fetch(url, {
        method: 'get',
        headers: {
            "Referer": "https://www.goodrx.com/",
            "Upgrade-Insecure-Requests": "1",
            "Cookie": cookies[i],
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.87 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
    }).then((response) => {
        if (response.status !== 403) {
            return response.text();
        } else {
            console.log(response.status, 'Waiting 30s...');
            notifier.notify({
                title: "Drug request failed",
                message: `Request blocked, retrying in 60s`
            });
            return null;
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
    let t = 15000;
    if (count % 30 === 0) {
        t = 60000;
    }

    console.log(`Waiting ${t / 1000.0}s...`);
    return timeout(t).then(() => {
        console.log(response);
        return response;
    });
}

async function fetchId(drug, count) {
    const res = generateUrl(drug);
    let response;
    let model = res.model;
    let i = count % 7;
    await fetch(res.url, {
        method: 'get',
        headers: {
            "Referer": "https://www.goodrx.com/",
            "Upgrade-Insecure-Requests": "1",
            "Cookie": cookies[i],
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
    let t = 15000;
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

function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

const cookies = [
    'csrf_token=fe98f437e90b4d798574680b10487142; _pxhd=3029431ae7e9e099afa91d3c46a652ec1f8e2594d437eac053f9d3461839d9e5:6e1a5f20-ff1c-11e9-a55a-5d27e4ca1dac; myrx_exp_ab_variant=experiment; grx_unique_id=1cabceffcf8041b3882405d2c0f78ba7; c=; kw=; gclid=; ppa_exp_ab_variant=experiment; variantCookie=2; _pxvid=6e1a5f20-ff1c-11e9-a55a-5d27e4ca1dac; _ga=GA1.2.582319787.1572883324; _gid=GA1.2.795690922.1572883324; rsci_vid=bdd4752a-4d8b-ff9a-ae56-bb95c9ee40b7; cto_lwid=e3ea55d1-7366-4c08-bb46-68b4220cea95; _fbp=fb.1.1572883323932.209847031; __gads=ID=147bd9857967132f:T=1572883324:S=ALNI_MblLtrALre5ioKcEwnH3SDYtl3TnQ; ki_r=; goodrx-v2=8ee7a6b6e7ebd9981eec681d386032c3ae1d5e3acamlt6XRBCkeLTX1nrDQTFtaTmvoPcOaQCrisIw+diPhrFJWFqd3kjkUkHwdBbkQEtMnR1AknxAtIEjTBiR4vVU6KI7wLqxyWSdZ6rC+JmeSskg+UAR3bnaEZlVRRRgALFp9hiZULPXXyrZlv7/GCPAt9ysACjq5Dc/o84j5cgzxR4hrzNaXyvVFFTCHZT9tjsDFuXJefetPsjvYbg1BVm87aD8tAPIL+1L6xUF9tc9FCvdAJ4m6dZo298pUyb2bRFnbVvgfS0Er6y+lHmCb5vknkoZ3RGi2+zm6Wqp5juzLnspose/Lsa0xv60VFIBh0Wtby1bKRBnOgNVNnozhHPS2cYGk1Vroc7a3h5+jbiSMS9bqgzFxMjv3M4gOAkat8+X1MWXmu/ZujKeZv8XGP3g=; ki_t=1572883327213%3B1572883327213%3B1572890169028%3B1%3B16; _dc_gtm_UA-24914838-1=1; _gat_UA-24914838-1=1',
    'csrf_token=fe98f437e90b4d798574680b10487142; _pxhd=3029431ae7e9e099afa91d3c46a652ec1f8e2594d437eac053f9d3461839d9e5:6e1a5f20-ff1c-11e9-a55a-5d27e4ca1dac; myrx_exp_ab_variant=experiment; grx_unique_id=1cabceffcf8041b3882405d2c0f78ba7; c=; kw=; gclid=; ppa_exp_ab_variant=experiment; variantCookie=2; _pxvid=6e1a5f20-ff1c-11e9-a55a-5d27e4ca1dac; _ga=GA1.2.582319787.1572883324; _gid=GA1.2.795690922.1572883324; rsci_vid=bdd4752a-4d8b-ff9a-ae56-bb95c9ee40b7; cto_lwid=e3ea55d1-7366-4c08-bb46-68b4220cea95; _fbp=fb.1.1572883323932.209847031; __gads=ID=147bd9857967132f:T=1572883324:S=ALNI_MblLtrALre5ioKcEwnH3SDYtl3TnQ; ki_r=; _pxff_tm=1; goodrx-v2=495066d484796b38caab7fe2174e164efaad61d2fPber0ycncJO8PEiK1KSo6GbtHbxeHZTvXKhcvn1Q+z/1EmPWaYfx+m1VaU893TnfyzOPIx9BS6ZX9hPntXiUOGBfOU7MAAt7+dKMv+vAwmO7hEF+lcKLswlbDMrJ2aEnWyx80vwO7NGKNBttBNjeDqxcFyCl2hvbrMOnpIJgGZe2oZV8PwZj9Y+y2jRW/QcaEz5MiMpQB+SoHBPK9vEH/TmegckFdJ6WQ6F91QhfT75OpkbBEbfrQFyIvzF9gOdvt/+qNQjjqlRQ71qD2jGYlWZXKcsep2yMmtaHipK1u1NORFagwBv9ShzUjFKpryLQld2cgMk5wAdVmCMRYIVAhdiRgDuOVvTJZDfS38WTo4HaHREsJWgKKbixEAUv5hv+GYy0WchSrcVmyiK0rMHW/4=; ki_t=1572883327213%3B1572883327213%3B1572884288539%3B1%3B9; _dc_gtm_UA-24914838-1=1; _gat_UA-24914838-1=1; _px2=eyJ1IjoiYjA0NjliZjAtZmYxZS0xMWU5LTgwZDItYjNkZDQ4NzIyNWJhIiwidiI6IjZlMWE1ZjIwLWZmMWMtMTFlOS1hNTVhLTVkMjdlNGNhMWRhYyIsInQiOjE1NzI4ODQ1ODkxNDksImgiOiJiMzI1OWJiM2RiNzYyY2NkM2NmZTdmZDRiNjg0OTEzMzRjZjRkZjZmYTlkZGQzMzcxZWQ1ZGZiZGM4NzE4MjRmIn0=',
    'csrf_token=fe98f437e90b4d798574680b10487142; _pxhd=3029431ae7e9e099afa91d3c46a652ec1f8e2594d437eac053f9d3461839d9e5:6e1a5f20-ff1c-11e9-a55a-5d27e4ca1dac; myrx_exp_ab_variant=experiment; grx_unique_id=1cabceffcf8041b3882405d2c0f78ba7; c=; kw=; gclid=; ppa_exp_ab_variant=experiment; variantCookie=2; _pxvid=6e1a5f20-ff1c-11e9-a55a-5d27e4ca1dac; _ga=GA1.2.582319787.1572883324; _gid=GA1.2.795690922.1572883324; rsci_vid=bdd4752a-4d8b-ff9a-ae56-bb95c9ee40b7; cto_lwid=e3ea55d1-7366-4c08-bb46-68b4220cea95; _fbp=fb.1.1572883323932.209847031; __gads=ID=147bd9857967132f:T=1572883324:S=ALNI_MblLtrALre5ioKcEwnH3SDYtl3TnQ; ki_r=; goodrx-v2=5bc558e3628d37c38e4bb4c9359b1780d67e5507fNxQQN/P51m5MIbmptqPxi+hqoTguIojpOs6KzptxcqN7N3BK0WEIh6et5vhyVzieHDqtV3Bz2jtLPrsAAtHM+sVBjIkHXaQu7C4HyVwt4+a34wd8FB8EZidETfPxcKQ+7CQfGZva6aeK7CLfqhDnXvUzsF5FGJPN2Dttlu5uxaXT5hEnwpB7JMA/vLAWm3iDnJ5r9th3UeqizD6sqgy7K8WwTIwGt9qYIa+bjgun8S7qgzTSSY6AwCnC+n4QmmJfXYW6E4FIfzS8CdigdB4UVQQe7v0VcVc4qArQ4j7MwoxEVrRQ/sst9qX3/PnKyHr39WtpiJ1nIbhat76BbPd8UbyVRXd/2gyw1/dqNdat7xJPI63sStSN+6NeZxHmL4IBsNanUgMF8kCtPXiVL0qn88=; _dc_gtm_UA-24914838-1=1; _gat_UA-24914838-1=1; ki_t=1572883327213%3B1572883327213%3B1572890253863%3B1%3B18',
    'csrf_token=fe98f437e90b4d798574680b10487142; _pxhd=3029431ae7e9e099afa91d3c46a652ec1f8e2594d437eac053f9d3461839d9e5:6e1a5f20-ff1c-11e9-a55a-5d27e4ca1dac; myrx_exp_ab_variant=experiment; grx_unique_id=1cabceffcf8041b3882405d2c0f78ba7; c=; kw=; gclid=; ppa_exp_ab_variant=experiment; variantCookie=2; _pxvid=6e1a5f20-ff1c-11e9-a55a-5d27e4ca1dac; _ga=GA1.2.582319787.1572883324; _gid=GA1.2.795690922.1572883324; rsci_vid=bdd4752a-4d8b-ff9a-ae56-bb95c9ee40b7; cto_lwid=e3ea55d1-7366-4c08-bb46-68b4220cea95; _fbp=fb.1.1572883323932.209847031; __gads=ID=147bd9857967132f:T=1572883324:S=ALNI_MblLtrALre5ioKcEwnH3SDYtl3TnQ; ki_r=; _dc_gtm_UA-24914838-1=1; _gat_UA-24914838-1=1; _pxff_tm=1; ki_t=1572883327213%3B1572883327213%3B1572890257995%3B1%3B19; goodrx-v2=d63898ad263b0de82d9f0d380360950628e342945EU2x5f7quHYLluTi6EB7qG7TaxB7XJX4Sw4XnfiyturibtwO+QAte+2pKwtkOJJOU43mBdIf0HYn8qm2YmXz66VB2fcHydjc70nJqVVB3DAAk5euZ+2u76/36w+tyKdpSRrjGEq8XAdwcv3xbn93NZxL/a0R1+k5+vS6kbTorRHglx1aSXxb57DWWY+JZ2NnJ/OF3Ji+mqjv3yvUKWGhTYBd9yZG4FkOtl+oezGIxGRo7ZJ470SEU71s3gdG1OA0xnfSqcd5P+M13g4i5sVtl0PR0HmZZMSIIMNXzsBemKfa811nts1x18lJF/6kiIHyPfUbvKzk0gQQ3qlH3IkkV+P5sVxYSlpO/YWPpvi3fn8+nRFul6SRpCdfdVpZ80QmU3vbfAsCr5mlBKcWFKerAc=',
    'csrf_token=fe98f437e90b4d798574680b10487142; _pxhd=3029431ae7e9e099afa91d3c46a652ec1f8e2594d437eac053f9d3461839d9e5:6e1a5f20-ff1c-11e9-a55a-5d27e4ca1dac; myrx_exp_ab_variant=experiment; grx_unique_id=1cabceffcf8041b3882405d2c0f78ba7; c=; kw=; gclid=; ppa_exp_ab_variant=experiment; variantCookie=2; _pxvid=6e1a5f20-ff1c-11e9-a55a-5d27e4ca1dac; _ga=GA1.2.582319787.1572883324; _gid=GA1.2.795690922.1572883324; rsci_vid=bdd4752a-4d8b-ff9a-ae56-bb95c9ee40b7; cto_lwid=e3ea55d1-7366-4c08-bb46-68b4220cea95; _fbp=fb.1.1572883323932.209847031; __gads=ID=147bd9857967132f:T=1572883324:S=ALNI_MblLtrALre5ioKcEwnH3SDYtl3TnQ; ki_r=; _dc_gtm_UA-24914838-1=1; _gat_UA-24914838-1=1; _pxff_tm=1; ki_t=1572883327213%3B1572883327213%3B1572890288892%3B1%3B21; goodrx-v2=78e511f5e32660288102f6a6b77402118d31cd06kkp+Ndzr4Y8yy/wLxc8SUafEyGN19d1blmVUG3CZlRFnRS4O105F8GkoHeVlNh8Otcj3u53JFD2Jm9iZxZTopspT7TJaXLkQX7Z+maRXBHAbbD0aaUS2Q3kDVNy8YklztQYyvogJDZSDOJcbghv3Nd/lCm5NiJTOMZdqvz0zzwxoEc+d3LeTDxfyR9GtaqBKuYJE/Re4t832tp+Q5eNnMqvNJ2M4iuH/1VafYUfx40xn+xb4gSu4QTLhtI/ihCKRSyiNPw1jKWkhFlTqBuECUEdqhyLaDq5X2mMukohDB3I/PuUqNCZ3h3/XaIVrQM3mZKCHCUoVyOGz2KTX2PqFXw63jv3Zd7b8FrKbJy2rL/nLIn/YhjNRNdvBH/53ZgKOdnShVqZ4N90eZ2g39riTTTU=',
    'csrf_token=fe98f437e90b4d798574680b10487142; _pxhd=3029431ae7e9e099afa91d3c46a652ec1f8e2594d437eac053f9d3461839d9e5:6e1a5f20-ff1c-11e9-a55a-5d27e4ca1dac; myrx_exp_ab_variant=experiment; grx_unique_id=1cabceffcf8041b3882405d2c0f78ba7; c=; kw=; gclid=; ppa_exp_ab_variant=experiment; variantCookie=2; _pxvid=6e1a5f20-ff1c-11e9-a55a-5d27e4ca1dac; _ga=GA1.2.582319787.1572883324; _gid=GA1.2.795690922.1572883324; rsci_vid=bdd4752a-4d8b-ff9a-ae56-bb95c9ee40b7; cto_lwid=e3ea55d1-7366-4c08-bb46-68b4220cea95; _fbp=fb.1.1572883323932.209847031; __gads=ID=147bd9857967132f:T=1572883324:S=ALNI_MblLtrALre5ioKcEwnH3SDYtl3TnQ; ki_r=; _pxff_tm=1; goodrx-v2=1418865922883c35c51f66e9f96e7dc7637ca125P+3aRNLQtG9brrQQ6TzXWLd/FNicUr1pLfB8WLlk4/ZUbEo5tK2kM4T4gg7pOPQBMe8hlE3OhsNmortiC4xZlJp5/B549sxuP11SwFOU8YIHFg8pQmmC+g6r+tyXwFjpBcm8jF+ed0nqPQj0gnzkuFDXMHBJWe6uLhB2U+LDEVi3bQ/FSs3G3fyvt52oiAk2MDzDh9h2VJH3kIflWg2S4uFLkged8P34huvPMSz8Z3Sq9qrEfQTQu7j4XwDfuMNwHl5a/OSc6RcGp9rYcyM/K8lW0qgjpb6+okuQVBVlWbQvEbUnL+1+bSczY7aEot5AmQ2QmUBAivllJsSBdT2ckuzS7bvYtgUo9NcivQ8+9Wh6YBtAgfPwu3xFcRQtRKCkp0vXHdCcCa/IlzvAYojv3eg=; _dc_gtm_UA-24914838-1=1; _gat_UA-24914838-1=1; ki_t=1572883327213%3B1572883327213%3B1572890314454%3B1%3B23',
    'csrf_token=fe98f437e90b4d798574680b10487142; _pxhd=3029431ae7e9e099afa91d3c46a652ec1f8e2594d437eac053f9d3461839d9e5:6e1a5f20-ff1c-11e9-a55a-5d27e4ca1dac; myrx_exp_ab_variant=experiment; grx_unique_id=1cabceffcf8041b3882405d2c0f78ba7; c=; kw=; gclid=; ppa_exp_ab_variant=experiment; variantCookie=2; _pxvid=6e1a5f20-ff1c-11e9-a55a-5d27e4ca1dac; _ga=GA1.2.582319787.1572883324; _gid=GA1.2.795690922.1572883324; rsci_vid=bdd4752a-4d8b-ff9a-ae56-bb95c9ee40b7; cto_lwid=e3ea55d1-7366-4c08-bb46-68b4220cea95; _fbp=fb.1.1572883323932.209847031; __gads=ID=147bd9857967132f:T=1572883324:S=ALNI_MblLtrALre5ioKcEwnH3SDYtl3TnQ; ki_r=; _pxff_tm=1; ki_t=1572883327213%3B1572883327213%3B1572890352852%3B1%3B24; goodrx-v2=a25622cce68d34447893ae52ab9564e36e0ee124jojPoI14jvl+KfDTPkOBJtJw9+XD9uPMgz+s3EMV4qHFQE/65hCkTQX8Xenx4i53wxxIcWmCvsuFCfB9m0MSS8jU//n3iJJKdDXgCi9t1feIbE0eOd3D4gdcRpHeoJcKPvzEFLoGEnUlNwUkne+AAE4UvY20H7JkN8UHTYo3ZOcLuKwazRQdK4xDXTqoCWbX1aO3w92lfE4I9ezqVYrvSGrP6fjABHRD2RzDSDY0i7fVxl8la9cJWbcfCWllXuZRRNtklzZvm9PmDhpX5trltQ1AI9ESQkDPI3mCa6BOESkRpPql38Rex5hdsOYMnzajw/O3+NXehqNQglGLPRDkFDrZpa6oD3P/8kpD4eQEYcPRW0fxmVWlaZbinlifumP1p8BT+lQpsKL2gAfU3RZWKlM=; _px2=eyJ1IjoiZGMwMzA0YTAtZmYyYy0xMWU5LWE4Y2YtNTU2YTI4Yzk0ZDI0IiwidiI6IjZlMWE1ZjIwLWZmMWMtMTFlOS1hNTVhLTVkMjdlNGNhMWRhYyIsInQiOjYzMzUyODAwMDAwMCwiaCI6IjViNjdhODI1OThjNDU4ZjJiNGEwMGVjOTkzOTFkYmQwYzAyNzE3ZGM5NTI5YWRiZDBlMjAxMmNiYjAxZjM4MGIifQ==',
    'goodrx-v2=7c7f018629418f0eae9c03104aa5b897a30f469datuKeIfjuVGdVkviY8phjZoSvXRrAcU8iz/SEqFt92NbcEHdEPNQa0vR3gci/h97b0FeWG64wKf+s8HBENtdgzl57Qu/zB+bCFcYEe+QncXfnKpHepoB29xSCMqzgskUeKFfpbcT/F17c3vSL0P0rdxdOY9b0WIng8iUn6KHIdfM+Gg80rp2gv6TR3u348aWUIunnvi+9poVw55HEdU/qMSN+ByN4SMn7RG4reaz6G+aY2gk6RaZ9IrO4ACNhbhVGkozXQD7R11dHsXHbBCahcgVqx0ejZ2zDHYRTNi9W2LfEqCgRT8fryc0t9VrM+h18LHnoEMpL2hID3Nrw9gTyZT1BSs1Ozgc97ZxJbCkuI81yPE890PzfoSbY1J9zpiLuZbyKWT1MTmvndpMYUJsGbBF/jyI7JH1PNLqQnVTjMqx9f4/UGVPule1VDiNyKDghBI0QPfKrFjCbdyDkR0+NAkk27jzKPWdcE5rniM4ttMtIvnM3arUKJNPWY/hZ+UUU6u5Z9l8ZRr03Q69KYDSw1LgbWtbhpFRCTTXUThwCuVREy8dZfl7ikwP2gN+KAtLEdmnAj9piEDJzCB82qPXx5T6nFmk4GyR+tJUm2zsXeut85IwWRNmP3USSFc5XolAkByFJh6/eC76/lee1FRohwNn81gj5TMRz6g7sVkTMBwUlybAfi2ky5IbEdw0uvJZZz7X7FxAUf7cRf0Vb85m24RXtypfJgbe2ajNJquiDX2wn23ENaZekyqOyXTUzSe8pP4E6PXQPugS9PptJ+/zEpOTBq0FMKYBvbuU7uElZ6/LuWAQVLGKBnP/jdR/SXjbvSJMAg2kfSgMrTkomardE18Bj1F4+JbWpnGXTOF9cuW+5fAdWYZRg/fxnyBQxDNELHfGdfwecuHg1VJuorWqnYM=; grx_unique_id=610b6199cdd94d38bb8640586b13bc04; c=; kw=; gclid=; closedWalmartFluShot=true; currentLocation={%22city%22:%22Keasbey%22%2C%22state%22:%22NJ%22%2C%22coords%22:{%22latitude%22:40.5143%2C%22longitude%22:-74.30215}%2C%22zip%22:%2208832%22%2C%22source%22:%22session%22%2C%22full_state%22:%22New%20Jersey%22%2C%22formatted_address%22:%22Keasbey%2C%20NJ%22%2C%22distance%22:6}; csrf_token=42fcb0bf1418483ab91c1f28ee6bff2b; _pxhd=96e40567f06a79b4fa1b5796c08483351a3a54834448b8100adc7802dfce52e7:02d25221-ff2d-11e9-b9ec-af91f9619bc2; ppa_exp_ab_variant=experiment; myrx_exp_ab_variant=experiment'
];

const promise = testfix();