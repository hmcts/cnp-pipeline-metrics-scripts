#!/bin/bash

node index.js | jq -r '.[] | "\(.count)\t\(.stage)"'
