const { Client } = require('pg');
const newDrugs = require('./newDrugs');
const client = new Client({
    connectionString: 'postgresql://postgres:galaxy123456@database-2.ch91gk9zmx2h.us-east-1.rds.amazonaws.com/postgres'
});
client.connect(async function (err) {
    if (err) {
        console.log(err);
    } else {
        console.log("Connected to postgres");
        // client.end();
        await getNewDrugFromDB(newDrugs, function() {
            console.log("Done");
        });
    }
});

async function getNewDrugFromDB(drugList, callback) {
    for (let drug of drugList) {
        const ndc = drug["NDC"];
        await client.query(`SELECT * FROM drug_master WHERE ndc = '${ndc}'`, async (err, res) => {
            if (err) console.log(err);
            else if (res.rows.length > 0) {
                for (let row of res.rows) {
                    console.log(row["name"], row["ndc"]);
                    let drugId = row["id"];
                    await client.query(`INSERT INTO report_dm VALUES($1, $2) RETURNING *`, [drugId, drugId], function(err) {
                        if (err) console.log(err);
                        else {
                            console.log(`Inserted drugId ${drugId} into report_dm.`);
                        }
                    })
                }
                callback();
            }
        });
    }
}

// const promise = getNewDrugFromDB(newDrugs, function() {
//     console.log("Done");
//     process.exit(0);
// });
