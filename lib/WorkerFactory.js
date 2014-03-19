/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {data} = require("sdk/self");
const {URL} = require("sdk/url");

const {Cc,Ci,Cm,Cr,Cu,components,ChromeWorker} = require("chrome");

Cm.QueryInterface(Ci.nsIComponentRegistrar);

Cu.import("resource://gre/modules/Services.jsm", this);
Cu.import("resource://gre/modules/Task.jsm");
Cu.import("resource://gre/modules/commonjs/sdk/core/promise.js");
Cu.import("resource://gre/modules/NetUtil.jsm");

const MS_PER_DAY = 86400000;
const sLocaleData = {
  "zh-CN": {
    regionCode: "zh-CN",
    mainTaxonomyModel: "41-cat",
    rankersDef: [
      {type: "rules", namespace: "41-cat"},
      {type: "keywords", namespace: "41-cat"},
      {type: "combined", namespace: "41-cat"},
    ],
    workersDefs: [
      {regionCode: 'zh-CN', modelName: '41-cat'},
    ],
    surveyEndPoint: "https://www.surveygizmo.com/s3/1545511/firefox-personalization-cn"
  },
  "default": {
    regionCode: "en-US",
    mainTaxonomyModel: "edrules",
    rankersDef: [
      {type: "rules", namespace: "edrules"},
      {type: "keywords", namespace: "edrules"},
      {type: "combined", namespace: "edrules"},
      {type: "rules", namespace: "edrules_extended"},
      {type: "keywords", namespace: "edrules_extended"},
      {type: "combined", namespace: "edrules_extended"},
    ],
    workersDefs: [
      {regionCode: 'en-US', modelName: '58-cat'},
      {regionCode: 'en-US', modelName: 'edrules'},
      {regionCode: 'en-US', modelName: 'edrules_extended'},
      {regionCode: 'en-US', modelName: 'edrules_extended_kw'},
    ],
    surveyEndPoint: "https://www.surveygizmo.com/s3/1368483/firefox-personalization"
  },
};

function WorkerFactory() {
  this._taxonomies = {};
  let regionCode = Cc["@mozilla.org/chrome/chrome-registry;1"]
                   .getService(Ci.nsIXULChromeRegistry)
                   .getSelectedLocale('global');
  this._localeData  = sLocaleData[regionCode] || sLocaleData["default"];
  this._readLocalizedInterests();
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

  _readLocalizedInterests: function() {
    try {
      let scriptLoader = Cc["@mozilla.org/moz/jssubscript-loader;1"].getService(Ci.mozIJSSubScriptLoader);
      let {regionCode, mainTaxonomyModel} = this._localeData;
      scriptLoader.loadSubScript(data.url("models/" + regionCode + "/" + mainTaxonomyModel + "/localizedInterests.json"));
      this._localeData.localizedInterests = localizedInterests;
    }
    catch (e) {
    }
  },

  _setupWorker: function(regionCode, modelName) {
    let scriptLoader = Cc["@mozilla.org/moz/jssubscript-loader;1"].getService(Ci.mozIJSSubScriptLoader);
    scriptLoader.loadSubScript(data.url("models/" + regionCode + "/" + modelName + "/domainRules.json"));
    scriptLoader.loadSubScript(data.url("models/" + regionCode + "/" + modelName + "/textModel.json"));
    // use the same url stop words
    scriptLoader.loadSubScript(data.url("models/urlStopwords.json"));

    let worker = new ChromeWorker(data.url("interests/interestsWorker.js"));
    worker.postMessage({
      message: "bootstrap",
      workerRegionCode: regionCode,
      workerNamespace: modelName,
      interestsDataType: "dfr",
      interestsData: interestsData,
      interestsClassifierModel: interestsClassifierModel,
      interestsUrlStopwords: interestsUrlStopwords
    });

    if (modelName == this._localeData.mainTaxonomyModel) {
      this._taxonomies[modelName] = this._extractCategories(interestsData);
    }

    return worker;
  },

  getCurrentWorkers: function() {
    let workers = [];
    let {workersDefs} = this._localeData;
    workersDefs.forEach(def => {
      let {regionCode, modelName} = def;
      workers.push(this._setupWorker(regionCode, modelName));
    });
    return workers;
  },

  getRankersDefinitions: function() {
    return this._localeData.rankersDef;
  },

  getTaxonomyInterests: function() {
    return Object.keys(this._taxonomies[this._localeData.mainTaxonomyModel]);
  },

  getLocalizedInterests: function() {
    return this._localeData.localizedInterests;
  },

  getSurveyEndPoint: function() {
    return this._localeData.surveyEndPoint;
  },
}

exports.WorkerFactory = WorkerFactory;
