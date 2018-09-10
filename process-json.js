const json = require('./results.json')

const reduced = json.reduce((result, current) => {
    if (result.product) {
        result = {}
    }

    result[current.current_step_name] = Number.isInteger(result[current.current_step_name]) ?
        result[current.current_step_name] += 1 : 1
    return result
})

function compare(a,b) {
    if (a.count < b.count)
      return -1;
    if (a.count > b.count)
      return 1;
    return 0;
  }

const sorted = Object.keys(reduced).map(function(key) {
    return {stage: key, count: reduced[key]};
  })
  .sort(compare)
  .reverse()


console.log(JSON.stringify(sorted))