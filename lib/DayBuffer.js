/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
const {storage} = require("sdk/simple-storage");
const {DateUtils} = require("DateUtils");

function DayBuffer(pipeline) {
  this._pipeline = pipeline;
  if (storage.dayBufferInterests == null) {
    storage.dayBufferInterests = {};
    storage.historyCoverage = {};
  }
}

DayBuffer.prototype = {

  _addInterest: function (host, visitDate, visitCount, namespace, type, interest) {
    // now start populating dayBufferInterests with visit data
    if (!storage.dayBufferInterests[visitDate]) {
      storage.dayBufferInterests[visitDate] = {};
    }
    if (!storage.dayBufferInterests[visitDate][type]) {
      storage.dayBufferInterests[visitDate][type] = {};
    }
    if (!storage.dayBufferInterests[visitDate][type][namespace]) {
      storage.dayBufferInterests[visitDate][type][namespace] = {};
    }
    if (!storage.dayBufferInterests[visitDate][type][namespace][interest]) {
      storage.dayBufferInterests[visitDate][type][namespace][interest] = {};
    }
    if (!storage.dayBufferInterests[visitDate][type][namespace][interest][host]) {
      storage.dayBufferInterests[visitDate][type][namespace][interest][host] = 0;
    }
    storage.dayBufferInterests[visitDate][type][namespace][interest][host] += visitCount;
  },

  _addToCoverage: function (host, namespace, type, visitCount, interestCount) {
    if (!storage.historyCoverage[host]) {
      storage.historyCoverage[host] = {};
    }
    if (!storage.historyCoverage[host][namespace]) {
      storage.historyCoverage[host][namespace] = {};
    }
    if (!storage.historyCoverage[host][namespace][type]) {
      storage.historyCoverage[host][namespace][type] = {visits: 0, interests: 0};
    }
    storage.historyCoverage[host][namespace][type].visits += visitCount;
    storage.historyCoverage[host][namespace][type].interests += interestCount;
  },

  addInterestMessage: function(interestMessage, dateVisits) {
    let {host, visitDate, visitCount, namespace, results} = interestMessage;
    results.forEach(item => {
      let {type, interests} = item;
      Object.keys(dateVisits).forEach(date => {
        let interestCount = 0;
        interests.forEach(interest => {
          this._addInterest(host, date, dateVisits[date], namespace, type, interest);
          if (!interest.startsWith("__")) {
            interestCount ++;
          }
        });
        this._addToCoverage(host, namespace, type, dateVisits[date], interestCount);
      });
      // TODO add am _EMPTY interest for each type if the intrest list is empty
    });
  },

  pushInterests: function(newVisitDate) {
    // check if pipeline is here
    if (this._pipeline == null) return;
    // get the dates collected so far
    let dates = Object.keys(storage.dayBufferInterests);
    //check that we have more then one
    if (dates.length < 2) return;

    // now order by dates
    dates = dates.sort(function (a,b) {
      return parseInt(b) - parseInt(a);
    });
    // remove the last day from stored interests
    let latestDay = dates[0];
    let latestDayData = storage.dayBufferInterests[latestDay];
    delete storage.dayBufferInterests[latestDay];
    // remember what we want to push
    let dataToPush = storage.dayBufferInterests;
    // save lastDayData back to storage
    storage.dayBufferInterests = {};
    storage.dayBufferInterests[latestDay] = latestDayData;
    // and now we can push
    this._pipeline.push(dataToPush);
    if (this._reportCb) {
      this._reportCb(DateUtils.today() - latestDay);
    }
  },

  clear: function() {
    storage.dayBufferInterests = {};
    storage.historyCoverage = {};
  },

  clearStorage: function() {
    delete storage.dayBufferInterests;
    delete storage.historyCoverage;
  },

  flush: function() {
    if (this._pipeline) {
      this._pipeline.push(storage.dayBufferInterests);
      storage.dayBufferInterests = {};
    }
  },

  getInterests: function() {
    return storage.dayBufferInterests;
  },

  setReportCallback: function(cb) {
    this._reportCb = cb;
  },

  getCoverage: function() {
    return storage.historyCoverage;
  }
}

exports.DayBuffer = DayBuffer;
