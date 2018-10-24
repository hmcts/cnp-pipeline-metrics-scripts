/*
The MIT License
Copyright 2014 Sony Mobile Communications AB. All rights reserved.
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

//A Node.js script that aggregates Jenkins Build Failure Analyzer plugin
//statistics from MongoDB to Graphite, failure categories per hour

var MongoClient = require('mongodb').MongoClient;
var net = require("net");
var _ = require("underscore");
var utils = require("./utils.js"); //TODO implement your own, see below

MongoClient.connect('mongodb://localhost:27017/build-failure-analyzer', function (err, db) { //TODO change url
    if (err) throw err;

    var failureCausesCollection = db.collection('failureCauses');
    console.log(failureCausesCollection)
    var failureCausesCategories = [];

    console.log("Retrieving failure causes...");
    failureCausesCollection.find().toArray(function (err, docs) {
        for (var i = 0; i < docs.length; i++) {
            c = {
                id: docs[i]._id.toHexString(),
                name: docs[i].name,
                categories: docs[i].categories
            };
            if (c.categories == null || c.categories.length <= 0) {
                c.categories = ["undefined"];
            }
            failureCausesCategories.push(c);
        }

        var now = new Date();
        var then = new Date();
        //Three months back, since rescans can happen
        then.setMonth(then.getMonth() - 3);

        var match = {
            "$match": {
                "startingTime": { "$gte": then },
                "result": { "$ne": "ABORTED" },
                "failureCauses": { $exists: true }
            }
        };
        var unwind = { "$unwind": "$failureCauses" };

        var project = {
            "$project": {
                "startingTime": 1,
                "master": 1,
                "failureCauses.failureCause": 1
            }
        };
        var group = {
            "$group": {
                "_id": {
                    "hour": { "$hour": "$startingTime" },
                    "dayOfMonth": { "$dayOfMonth": "$startingTime" },
                    "month": { "$month": "$startingTime" },
                    "year": { "$year": "$startingTime" },
                    "master": "$master",
                    "failureCause": "$failureCauses.failureCause"
                },
                "number": { "$sum": 1 }
            }
        };

        var collection = db.collection('statistics');

        console.log("Aggregating hourly statistics from ", then, "...");

        collection.aggregate([match, unwind, project, group], function (err, result) {
            if (err !== null) {
                throw err;
            }
            console.log("Retrieved result. Aggregating further...")
            var calculation = [];
            for (i = 0; i < result.length; i++) {
                var item = result[i];
                var id = item._id;
                var time = new Date(id.year, id.month - 1, id.dayOfMonth, id.hour, 0, 0, 0);
                var timestamp = time.getTime() / 1000;
                var master = id.master;
                //var group = utils.bfaMaster2GraphiteGroup(master); //TODO Implement your own server mapping

                if (group != null) {
                    var failureCause = _.findWhere(failureCausesCategories, { id: id.failureCause.oid.toHexString() });
                    if (failureCause != undefined) {

                        var groupCalculation = _.findWhere(calculation, { group: group });
                        if (groupCalculation == undefined) {
                            console.log("Creating group ", group);
                            groupCalculation = { group: group, categories: [] };
                            calculation.push(groupCalculation);
                        }
                        //Loop over each category of the failureCause
                        for (var j = 0; j < failureCause.categories.length; j++) {
                            var cat = failureCause.categories[j].toLowerCase();
                            var catCalculation = _.findWhere(groupCalculation.categories, { category: cat });
                            if (catCalculation == undefined) {
                                catCalculation = { category: cat, timestamps: [] };
                                groupCalculation.categories.push(catCalculation);
                            }
                            var ti = _.findWhere(catCalculation.timestamps, { time: timestamp });
                            if (ti == undefined) {
                                ti = { time: timestamp, number: 0 };
                                catCalculation.timestamps.push(ti);
                            }
                            ti.number += item.number;

                        }
                    }
                }
            }
            console.log(JSON.stringify(calculation))
            // Let's close the db
            db.close();
        });

    });

});
