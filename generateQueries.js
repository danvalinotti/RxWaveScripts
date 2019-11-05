const fs = require('fs');
const zipcodes = require('zipcodes');
const { Client } = require('pg');
const client = new Client({
    connectionString: 'postgresql://postgres:galaxy123456@database-2.ch91gk9zmx2h.us-east-1.rds.amazonaws.com/postgres'
});
client.connect(function (err) {
   if (err) {
       console.log(err);
   } else {
       console.log("Connected to postgres");
       const promise = generateDrugRequestQueries();
       // client.end();
   }
});

function generateDrugMasterQueries() {
    const drugMasterList = fs.readFileSync('drugMasterList.json');
    let index = 277517;
    let zips = ['07083', '30062', '60657', '75034', '92648'];
    let drugArr = JSON.parse(drugMasterList.toString());
    for (let drug of drugArr) {
        // console.log(drug);
        for (const zip of zips) {
            fs.appendFile('drug_master_script.txt',
                `INSERT INTO drug_master(
                    id, dosage_strength, dosageuom, drug_type, gsn, name, ndc, quantity, report_flag, zip_code)
                    VALUES (${index}, '${drug.DosageStrength}', null, '${drug.DrugForm}', '${drug.GSN}', '${drug.DrugName}',
                        '${drug.NDC}', ${drug.Quantity}.0, true, '${zip}');\n`
                , function(err) {
                    if (err) throw err;
                });
            drug.DrugIDs.push(index);
            index += 1;
        }
    }

    fs.writeFile('drugMaster.json', JSON.stringify(drugArr), function(err) {
        if (err) console.log(err);
        console.log("Done");
    });
}

async function generateDrugRequestQueries() {
    const drugMasterList = fs.readFileSync('drugMaster.json');
    let index = 475744;
    let drugArr = JSON.parse(drugMasterList.toString());
    let zips = ['07083', '30062', '60657', '75034', '92648'];
    let queries = [];
    for (const drug of drugArr) {
        for (let j= 0; j < drug.DrugIDs.length; j++) {
            for (let i = 0; i < 7; i++) {
                let name = drug.DrugName;
                let quantity = drug.Quantity;
                let goodRxId = drug.GoodRxID;
                if (i === 5) {
                    name = drug.BlinkDrugName === "" ? drug.DrugName : drug.BlinkDrugName;
                    goodRxId = drug.BlinkDrugID;
                } else if (i === 2) {
                    name = drug.WellRxName;
                    quantity = drug.WellRxQuantity;
                }
                const query = `INSERT INTO public.drug_request(
                        id, brand_indicator, drug_id, drug_name, gsn, latitude, longitude, ndc, program_id, quantity, zipcode, dosage_strength, drug_type, good_rx_id)
                        VALUES (${index}, 'BRAND', '${drug.DrugIDs[j]}', '${name}', '${drug.GSN}', '${zipcodes.lookup(zips[j]).latitude}', '${zipcodes.lookup(zips[j]).longitude}', '${drug.NDC}', 
                            '${i}', '${quantity}', '${zips[j]}', '${drug.DosageStrength}', '${drug.DrugForm}', '${goodRxId}');`;
                client.query(query, (err, res) => {
                    if (err) {
                        console.log(err);
                        console.log(query);
                    }
                    console.log(res);
                });
                index += 1;
            }
        }
    }
    fs.writeFile('drug_request_script.json', JSON.stringify(queries), function(err) {
        if (err) throw err;
        console.log("Done");
    });
}

