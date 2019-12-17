const fs = require('fs');
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

async function findNulls() {
    const nullArr = [];
    const dupes = await GoodRxIdModel.find({goodRxId: null});
    for (let dupe of dupes) {
        nullArr.push(dupe);
    }

    try {
        let writeText = JSON.stringify(nullArr);
        fs.writeFile('nulls.json', writeText, function(err) {
            if (err) console.log(err);
            console.log("Write complete");
            process.exit();
        });
    } catch (e) {
        console.log(e);
    }
}

async function findAndFixDuplicates() {
    let file = fs.readFileSync('full_drug_list.json');
    let drugsJson = JSON.parse(file.toString());
    let dupeArray = [];

    for (let drug of drugsJson) {
        const dupes = await GoodRxIdModel.find({ndc: drug.NDC11});
        if (dupes.length > 1) {
            console.log(dupes.length);
            for (let i = 0; i < dupes.length; i++) {
                dupeArray.push(dupes[i]);
                console.log("Added null val");
            }
        }
    }

    try {
        let writeText = JSON.stringify(dupeArray);
        fs.writeFile('dupes.json', writeText, function(err) {
            if (err) console.log(err);
            console.log("Write complete");
            process.exit();
        });
    } catch (e) {
        console.log(e);
    }
}

async function deleteDuplicates() {
    let file = fs.readFileSync('dupes.json');
    let drugsJson = JSON.parse(file.toString());

    for (let drug of drugsJson) {
        await GoodRxIdModel.deleteOne({_id: drug._id});
        console.log(`Deleted ${drug.drugName}`)
    }
    process.exit();
}

async function findMissingDrugs() {
    let file = fs.readFileSync('full_drug_list.json');
    let drugsJson = JSON.parse(file.toString());
    // console.log(drugsJson);
    // let drugsMongo;
    let missingDrugs = [];

    for (let drug of drugsJson) {
        const data = await GoodRxIdModel.find({ndc: drug.NDC11, goodRxId: { $ne: "" }});
        console.log(data);
        if (!data.length) {
            missingDrugs.push(drug);
            console.log(`MISSING: ${drug.BrandName}`)
        } else {
            console.log(`${drug.BrandName} found`)
        }
    }

    try {
        const writeText = JSON.stringify(missingDrugs);
        fs.writeFile('exceptions.json', writeText, function(err) {
            if (err) console.log(err);
            console.log("Write complete");
            process.exit();
        });
    } catch (error) {
        console.log(error);
    }
}

const promise = findMissingDrugs();
const promise1 = deleteDuplicates();
const promise2 = findNulls();
const promise3 = findAndFixDuplicates();