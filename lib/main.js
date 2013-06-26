/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

exports.main = function(options, callbacks) {
  require("interests").dataPromise.then(function(result) {
    let output = JSON.stringify(result, null, 2);
    require("tabs").open("data:text/plain," + output.replace(/\n/g, "%0A"));
  });
};

