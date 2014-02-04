/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {data} = require("self");
const {URL} = require("url");

const {Cc,Ci,Cm,Cr,Cu,components,ChromeWorker} = require("chrome");

Cm.QueryInterface(Ci.nsIComponentRegistrar);

Cu.import("resource://gre/modules/Services.jsm", this);
Cu.import("resource://gre/modules/Task.jsm");
Cu.import("resource://gre/modules/commonjs/sdk/core/promise.js");
Cu.import("resource://gre/modules/NetUtil.jsm");

const MS_PER_DAY = 86400000;

function WorkerFactory() {
  this._taxonomies = {};
}

WorkerFactory.prototype = {

  _extractCategories: function(ruleData) {
    let allCats = {};
    if (ruleData != null) {
      Object.keys(ruleData).forEach(domain => {
        Object.keys(ruleData[domain]).forEach(key => {
          let val = ruleData[domain][key];
          if (Array.isArray(val)) {
            val.forEach(cat => {
              allCats[cat] = 1;
            });
          }
          else {
            allCats[val] = 1;
          }
        });
      });
    }
    return allCats;
  },

  _setupWorker: function(regionCode, variation) {
    let scriptLoader = Cc["@mozilla.org/moz/jssubscript-loader;1"].getService(Ci.mozIJSSubScriptLoader);
    scriptLoader.loadSubScript(data.url("models/" + regionCode + "/" + variation + "/domainRules.json"));
    scriptLoader.loadSubScript(data.url("models/" + regionCode + "/" + variation + "/textModel.json"));
    // use the same url stop words
    scriptLoader.loadSubScript(data.url("models/urlStopwords.json"));

    let worker = new ChromeWorker(data.url("interests/interestsWorker.js"));
    worker.postMessage({
      message: "bootstrap",
      workerRegionCode: regionCode,
      workerNamespace: variation,
      interestsDataType: "dfr",
      interestsData: interestsData,
      interestsClassifierModel: interestsClassifierModel,
      interestsUrlStopwords: interestsUrlStopwords
    });

    if (variation == "edrules") {
      this._taxonomies["edrules"] = this._extractCategories(interestsData);
    }

    return worker;
  },

  getCurrentWorkers: function () {
    let regionCode = Cc["@mozilla.org/chrome/chrome-registry;1"]
      .getService(Ci.nsIXULChromeRegistry)
      .getSelectedLocale('global');

    if ('zh-CN' === regionCode) {
      return [this._setupWorker('zh-CN', '41-cat')];
    }

    return [
      this._setupWorker('en-US', '58-cat'),
      this._setupWorker('en-US', 'edrules'),
      this._setupWorker('en-US', 'edrules_extended'),
      this._setupWorker('en-US', 'edrules_extended_kw')
    ];
  },

  getTaxonomyInterests: function (namespace) {
    return Object.keys(this._taxonomies[namespace]);
  },

}

exports.WorkerFactory = WorkerFactory;
