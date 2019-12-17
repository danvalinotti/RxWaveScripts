const nextDrugsList = require('./nextDrugs');
const fs = require('fs');
const pg = require('pg');
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
        getNDCs();
        // client.end();
    }
});

function getNDCs() {
    const drugFile = fs.readFileSync('nextDrugs.json');
    const drugList = JSON.parse(drugFile.toString());
    console.log(drugList instanceof Array);
    for (let drug of drugList) {
        let newDrug = drug;
        let gsn = newDrug.GSN;
        let newGsn = gsn;
        while (gsn.length < 6) {
            newGsn = "0" + gsn;
            gsn = newGsn;
        }

        console.log(gsn);
        client.query(
            `SELECT ndc, gsn FROM drug_master WHERE gsn = ${gsn} limit 1;`,
            function(err, res) {
                console.log(res.rows.length);
                if (err) throw err;
                else if (res.rows && res.rows.length > 0){
                    newDrug.NDC = res.rows[0].NDC;
                    newDrug.GSN = gsn;
                    console.log(newDrug.NDC);
                } else {
                    console.log(`No drug master found for GSN=${drug.GSN}`);
                }
            });
    }
}