#!/bin/bash
export COSMOS_AUTH_KEY=$(az cosmosdb list-read-only-keys --resource-group pipelinemetrics-database-prod --name pipeline-metrics --query primaryReadonlyMasterKey -o tsv)
node index.js | jq -r '.[] | "\(.count)\t\(.stage)"'
