// @ts-check
"use strict";

const cosmos = require("@azure/cosmos");
const CosmosClient = cosmos.CosmosClient;

const config = {
  names: {
    database: 'jenkins',
    container: 'pipeline-metrics'
  },
  connection: {
    endpoint: 'https://pipeline-metrics.documents.azure.com:443/',
    authKey: process.env.COSMOS_AUTH_KEY
  }
}

const databaseId = config.names.database;
const containerId = config.names.container;

const endpoint = config.connection.endpoint;
const masterKey = config.connection.authKey;

const queryLimit = 10000
const queryTimeAfter = '2018-09-10T00:00:00Z'

const query = `
SELECT TOP ${queryLimit} c.product, c.current_step_name
FROM c 
WHERE c.current_build_scheduled_time > '${queryTimeAfter}' 
  AND c.current_build_current_result = 'FAILURE' 
  AND c.current_step_name != 'Pipeline Failed'
`

const client = new CosmosClient({ endpoint, auth: { masterKey } });

async function run() {
  const queryResult = await queryForItems();

  function handleIfOnlyOnePresent() {
    return queryResult.map(item => {
      return { [item.current_step_name]: 1 };
    }).pop();
  }

  const reduced = queryResult.length === 1 ? handleIfOnlyOnePresent() :
    queryResult.reduce((result, current) => {
      if (result.product) {
        result = { [current.current_step_name]: 1 }
      }

      result[current.current_step_name] = Number.isInteger(result[current.current_step_name]) ?
        result[current.current_step_name] += 1 : 1

      return result
    })

  function compare(a, b) {
    if (a.count < b.count)
      return -1;
    if (a.count > b.count)
      return 1;
    return 0;
  }

  const sorted = Object.keys(reduced).map(function (key) {
    return { stage: key, count: reduced[key] };
  })
    .sort(compare)
    .reverse()


  console.log(JSON.stringify(sorted))

}

async function queryForItems() {
  const database = await init(databaseId);
  const container = database.container(containerId);
  const items = await container.items.query(query);
  return (await items.toArray()).result;
}

async function init(databaseId) {
  const { database } = await client.databases.createIfNotExists({ id: databaseId });
  return database;
}

async function handleError(error) {
  console.log("\nAn error with code '" + error.code + "' has occurred:");
  console.log("\t", error);
}

run().catch(handleError);
