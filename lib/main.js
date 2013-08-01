/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {dataPromise} = require("interests");

exports.main = function(options, callbacks) {
  dataPromise.then(function(results) {
    let intro = [
      "Internal raw data for debugging:",
    ].join("\n");

    let sorted = Object.keys(results).sort(function(a, b) {
      return results[b].score - results[a].score;
    }).map(function(interest) {
      return interest + " (" + results[interest].score + ")";
    }).join("\n");

    let json = JSON.stringify(results, null, 2);
    let output = [intro, sorted, json].join("\n\n");
    require("tabs").open("data:text/plain," + output.replace(/\n/g, "%0A"));
  });
};

