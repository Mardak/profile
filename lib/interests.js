/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {data} = require("self");
const {Cc, Ci, Cu} = require("chrome");
Cu.import("resource://gre/modules/commonjs/sdk/core/promise.js");
Cu.import("resource://gre/modules/PlacesUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");

let PlacesDB = {
  _db: PlacesUtils.history.QueryInterface(Ci.nsPIPlacesDatabase).DBConnection,

  _execute: function PIS__execute(sql, optional={}) {
    let {columns, key, listParams, onRow, params} = optional;

    // Convert listParams into params and the desired number of identifiers
    if (listParams != null) {
      params = params || {};
      Object.keys(listParams).forEach(function(listName) {
        let listIdentifiers = [];
        for (let i = 0; i < listParams[listName].length; i++) {
          let paramName = listName + i;
          params[paramName] = listParams[listName][i];
          listIdentifiers.push(":" + paramName);
        }

        // Replace the list placeholders with comma-separated identifiers
        sql = sql.replace(":" + listName, listIdentifiers, "g");
      });
    }

    // Initialize the statement cache and the callback to clean it up
    if (this._cachedStatements == null) {
      this._cachedStatements = {};
      PlacesUtils.registerShutdownFunction(function() {
        Object.keys(this._cachedStatements).forEach(function(key) {
          this._cachedStatements[key].finalize();
        });
      });
    }

    // Use a cached version of the statement if handy; otherwise created it
    let statement = this._cachedStatements[sql];
    if (statement == null) {
      statement = this._db.createAsyncStatement(sql);
      this._cachedStatements[sql] = statement;
    }

    // Bind params if we have any
    if (params != null) {
      Object.keys(params).forEach(function(param) {
        statement.bindByName(param, params[param]);
      });
    }

    // Determine the type of result as nothing, a keyed object or array of columns
    let results;
    if (onRow != null) {}
    else if (key != null) {
      results = {};
    }
    else if (columns != null) {
      results = [];
    }

    // Execute the statement and update the promise accordingly
    let deferred = Promise.defer();
    statement.executeAsync({
      handleCompletion: function(reason) {
        deferred.resolve(results);
      },

      handleError: function(error) {
        deferred.reject(new Error(error.message));
      },

      handleResult: function(resultSet) {
        let row;
        while (row = resultSet.getNextRow()) {
          // Read out the desired columns from the row into an object
          let result;
          if (columns != null) {
            // For just a single column, make the result that column
            if (columns.length == 1) {
              result = row.getResultByName(columns[0]);
            }
            // For multiple columns, put as valyes on an object
            else {
              result = {};
              columns.forEach(function(column) {
                result[column] = row.getResultByName(column);
              });
            }
          }

          // Give the packaged result to the handler
          if (onRow != null) {
            onRow(result);
          }
          // Store the result keyed on the result key
          else if (key != null) {
            results[row.getResultByName(key)] = result;
          }
          // Append the result in order
          else if (columns != null) {
            results.push(result);
          }
        }
      }
    });

    return deferred.promise;
  },
};

let reference = JSON.parse(data.load("interestReference.json"));
let hostToInterests = {};
Object.keys(reference).forEach(function(interest) {
  reference[interest].forEach(function(host) {
    if (hostToInterests[host] == null) {
      hostToInterests[host] = [];
    }
    hostToInterests[host].push(interest);
  });
});

// Compute the host data for number of days each host was visited
let visitedOn = {};

// Record a visit for this key on this day
function updateVisitDay(key, day) {
  visitedOn[key] = visitedOn[key] || {};
  visitedOn[key][day] = true;
}

// Record a visit for this host and any interests on this day
function recordHostVisit(host, day) {
  updateVisitDay(host, day);
  (hostToInterests[host] || []).forEach(function(key) updateVisitDay(key, day));
}

exports.dataPromise = PlacesDB._execute(
  "SELECT rev_host, v.visit_date / 86400000000 day " +
  "FROM moz_historyvisits v " +
  "JOIN moz_places h " +
  "ON h.id = v.place_id " +
  "WHERE h.hidden = 0 AND h.visit_count > 0 " +
  "GROUP BY h.rev_host, day", {
  columns: ["rev_host", "day"],
  onRow: function({rev_host, day}) {
    try {
      // Record the days for the exact host
      let host = rev_host.slice(0, -1).split("").reverse().join("");
      recordHostVisit(host, day);

      // Record the days for the base domain
      let base = Services.eTLD.getBaseDomainFromHost(host);
      recordHostVisit(base, day);
    }
    catch(ex) {}
  }
}).then(function() {
  // Reduce the visits to a count of days for each key
  let daysVisited = {};
  Object.keys(visitedOn).forEach(function(key) {
    daysVisited[key] = Object.keys(visitedOn[key]).length;
  });

  let result = {};
  Object.keys(reference).forEach(function(interest) {
    // Record the individual host results
    let hostsResult = {};
    reference[interest].forEach(function(host) {
      hostsResult[host] = daysVisited[host] || 0;
    });

    // Package the result for the interest
    result[interest] = {
      hosts: hostsResult,
      score: daysVisited[interest] || 0,
    };
  });

  return result;
});
