/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
const {Cu} = require("chrome");
const {Request} = require("sdk/request");
const simplePrefs = require("sdk/simple-prefs")
const {storage} = require("sdk/simple-storage");
const prefs = require("sdk/preferences/service");

const {mergeObjects, byteCount, getRelevantPrefs} = require("Utils");
const {getTLDCounts} = require("HistoryReader");
const {NYTimesHistoryVisitor} = require("NYTimesHistoryVisitor");
const {Crypto} = require("Crypto");
const {NYTUtils} = require("NYTUtils");

const kIdle = "idle";
const kDispatchComplete = "dispatcher-payload-transmission-complete";
const kDispatchFailure = "dispatcher-payload-transmission-failure";
const kMaxPayloadSize = 1024*256;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Task.jsm");
Cu.import("resource://gre/modules/commonjs/sdk/core/promise.js");

XPCOMUtils.defineLazyServiceGetter(this, "idleService",
                                   "@mozilla.org/widget/idleservice;1",
                                   "nsIIdleService");

function Dispatcher(serverUrl, {enabled, dispatchIdleDelay}) {
  if (!storage.hasOwnProperty("interests")) {
    storage.interests = {};
  }
  this._serverUrl = serverUrl;
  this._isIdleObserver = false;
  this._enabled = enabled || false;
  this._dispatchIdleDelay = dispatchIdleDelay || 120;
  this._dispatchIdleCustomDelay = null;
  this._extras = {};
}

Dispatcher.prototype = {
  clear: function() {
    storage.interests = {};
  },

  clearStorage: function() {
    delete storage.interests;
  },

  consume: function _consume(annotatedData) {
    // may cause disk churning
    mergeObjects(storage.interests, annotatedData);
    return null;
  },

  addExtraParameterToPayload: function _addExtraParameterToPayload(key, value) {
    this._extras[key] = value;
  },

  getPendingBatch: function _getPendingBatch() {
    if (Object.keys(storage.interests).length > 0) {
      return JSON.parse(JSON.stringify(this._makePayload(kMaxPayloadSize)));
    }
    return null;
  },

  observe: function _observe(aSubject, aTopic, aData) {
    switch (aTopic) {
      case kIdle:
        // ping data to server
        this._unsetObserveIdle();
        if (this._enabled) {
          this._sendPing(this._serverUrl);
        }
        break;
    }
  },

  _sendPing: function __sendPing(serverUrl) {
    var payload = this._makePayload(kMaxPayloadSize);
    return this._dispatch(serverUrl, payload).then(days => {
      this._clearAfterDispatch(days);
      Services.obs.notifyObservers(null, kDispatchComplete, days);
      return days.length;
    },
    reason => {
      Services.obs.notifyObservers(null, kDispatchFailure, reason);
      return reason;
    });
  },

  _makePayloadObject: function __makePayloadObject() {
    let obj = {
      payloadDate: "" + new Date(),
      locale: prefs.getLocalized("general.useragent.locale"),
      version: storage.version,
      source: storage.downloadSource,
      installDate: storage.installDate,
      updateDate: storage.updateDate,
      tldCounter: getTLDCounts(),
      prefs: getRelevantPrefs(),
      uuid: simplePrefs.prefs.uuid,
      hasSurveyInterests: Crypto.hasMappedInterests(simplePrefs.prefs.uuid),
      nytVisits: NYTimesHistoryVisitor.getVisits() || [],
      nytUserData: NYTUtils.getNYTUserData(),
      interests: {}
    };
    // add extra parameters
    Object.keys(this._extras).forEach(name => {
      obj[name] = this._extras[name];
    });

    return obj;
  },

  _makePayload: function __makePayload(maxSize) {
    let payload = this._makePayloadObject();
    let payloadSize = byteCount(JSON.stringify(payload));
    let sortedMsgIds = Object.keys(storage.interests)
      .map((k) => {return parseInt(k);})
      .sort();

    for(var i=0; i < sortedMsgIds.length; i++) {
      let data = {}
      let day = sortedMsgIds[i];
      data[day] = storage.interests[day];
      mergeObjects(payload.interests, data);
      payloadSize += byteCount(JSON.stringify(data));
      if (payloadSize >= maxSize) {
        break;
      }
    }
    return payload;
  },

  _deleteDays: function __deleteDays(days) {
    let storageData = storage.interests;
    days.forEach( (day) => {
      delete storageData[day];
    });
    storage.interests = storageData;
  },

  _clearAfterDispatch: function __clearAfterDispatch(days) {
    this._deleteDays(days);
    NYTimesHistoryVisitor.clear();
  },

  _dispatch: function __dispatch(serverUrl, payload) {
    deferred = Promise.defer();

    if (Object.keys(payload.interests).length == 0) {
      deferred.reject("won't send. payload empty");
    }
    else {
      let serverPing = Request({
        url: serverUrl,
        contentType: "application/json; charset=utf8",
        content: JSON.stringify(payload),
        onComplete: (response) => {
          if (response.status >= 200 && response.status < 300) {
            let days = Object.keys(payload.interests);
            deferred.resolve(days);
          }
          else {
            deferred.reject("HTTP Error " + response.status + " " + response.statusText)
          }
        },
      });
      serverPing.post();
    }
    return deferred.promise;
  },

  setObserveIdle: function setObserveIdle(delay) {
    if (!this._isIdleObserver) {
      this._dispatchIdleCustomDelay = delay || null;
      delay = this._dispatchIdleCustomDelay || this._dispatchIdleDelay;
      idleService.addIdleObserver(this, delay);
      this._isIdleObserver = true;
    }
  },

  _unsetObserveIdle: function __unsetObserveIdle() {
    if (this._isIdleObserver) {
      let delay = this._dispatchIdleCustomDelay || this._dispatchIdleDelay; 
      idleService.removeIdleObserver(this, delay);
      this._isIdleObserver = false;
      this._dispatchIdleCustomDelay = null;
    }
  },
}

exports.Dispatcher = Dispatcher;
