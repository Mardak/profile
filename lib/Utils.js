/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {Cc,Ci,Cm,Cr,Cu} = require("chrome");

Cu.import("resource://gre/modules/commonjs/sdk/core/promise.js");
Cu.import("resource://gre/modules/NetUtil.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");

const simplePrefs = require("sdk/simple-prefs");
const timers = require("sdk/timers");
const prefs = require("sdk/preferences/service");
const {PlacesInterestsUtils} = require("PlacesInterestsUtils");

/**
 * Merge obj2 into obj1.
 * @params obj1, obj2 Javascript Objects. obj2's properties will be added to obj1
 *
 * @returns obj1
 */
exports.mergeObjects = function mergeObjects(obj1, obj2) {
  for (var prop in obj2) {
    if ( typeof obj2[prop] == "object" ) {
      if ( !obj1.hasOwnProperty(prop) ) {
        obj1[prop] = obj2[prop];
      }
      else {
        obj1[prop] = mergeObjects(obj1[prop], obj2[prop]);
      }
    } else {
      obj1[prop] = obj2[prop];
    }
  }
  return obj1;
}

/**
 * Gives the size of a string in bytes
 * @params s a string
 *
 * @returns size in bytes
 */
exports.byteCount = function byteCount(s) {
  return encodeURI(s).split(/%..|./).length - 1;
}


/**
 * Resolves a promise after specified delay
 * @params milisecondsDelay
 *         a delay in ms
 * @returns promise to be resolved after delay passes
 */
exports.promiseTimeout = function promiseTimeout(milisecondsDelay) {
  let deferred = Promise.defer();
  timers.setTimeout(() => {deferred.resolve();},milisecondsDelay);
  return deferred.promise;
}

/**
 * Collectis preferences affecting history
 * @returns relevant preferences and thier values
 */
exports.getRelevantPrefs = function getRelevantPrefs() {
  let prefList = [
    // 1 - do not track , 0 - ok do track
    "privacy.donottrackheader.value",
    // true - tell sites my tracking preferences,
    // false - say nothing to a site
    "privacy.donottrackheader.enabled",
    // true - never remember history - start in private mode
    // false - remember history
    "browser.privatebrowsing.autostart",
    // true - see browser.urlbar.autocomplete.enabled
    // false - Nothing
    "browser.urlbar.autocomplete.enabled",
    // 0 - History and Bookmarks
    // 1 - History
    // 2 - Bookmarks
    "browser.urlbar.default.behavior",
    // 0 - all cookies
    // 1 - cookies from originating
    // 2 - no cookies
    // 3 - visited cookies
    "network.cookie.cookieBehavior",
    // 0 - keep until expire
    // 1 - always ask
    // 2 - keep until close
    "network.cookie.lifetimePolicy",
    // true - clear history on shutdown
    "privacy.sanitize.sanitizeOnShutdown",
    // true - keep history
    // false - do not keep history
    "places.history.enabled",
    // true keep formfill database
    "browser.formfill.enable",
  ];

  let results = {};
  prefList.forEach(pref => {
    let value;
    switch (Services.prefs.getPrefType(pref)) {
      case Services.prefs.PREF_BOOL:
        value = Services.prefs.getBoolPref(pref);
        break;
      case Services.prefs.PREF_INT:
        value = Services.prefs.getIntPref(pref);
        break;
      case Services.prefs.PREF_STRING:
        value = Services.prefs.getCharPref(pref);
        break;
      default:
        value = "invalid_type";
    }
    results[pref] = value;
  });

  // add relevant addon prefs
  results["nytimes_personalization_start"] = simplePrefs.prefs.nytimes_personalization_start;

  return results;
}

/**
 * Returns user agent locale
 */
exports.getUserAgentLocale = function getUserAgentLocale() {
  // if localized version returns null, use prefs.get directly
  return prefs.getLocalized("general.useragent.locale") || prefs.get("general.useragent.locale");
}

/**
 * Computes user interests from moz_hosts table
 *
 * Order moz_hosts by frecency and walk hosts down
 * computing interests of slices of top hosts at
 * position between 1 and 10, then computing interests
 * at slices on each 10th position
 */
exports.computeInterestsFromHosts = function computeInterestsFromHosts(interestsDFR) {
  let interests = {};
  let hostsSeen = 0;
  let interestsSeen = false;
  let lastFrecency;
  let lastInterestsString;
  let interestsSlices = {};

  function saveLastInterestsSlice(alwaysSave = false) {
    if (interestsSeen && (alwaysSave || hostsSeen < 10 || (hostsSeen % 10) == 0)) {
      interestsString = JSON.stringify(interests);
      if (lastInterestsString != interestsString) {
        interestsSlices[hostsSeen + ""] = {
          interests: JSON.parse(interestsString),
          frecency: lastFrecency,
        };
        lastInterestsString = interestsString;
      }
    }
  };
  // read moz_hosts data and compute interests
  return PlacesInterestsUtils.getMozHosts(item => {
    try {
      let {host, frecency} = item;
      if (interestsDFR[host] && interestsDFR[host]["__ANY"]) {
        interestsSeen = true;
        let interest = interestsDFR[host]["__ANY"];
        interests[interest] = (interests[interest] || 0) + frecency;
      }
      hostsSeen ++;
      lastFrecency = frecency;
      saveLastInterestsSlice();
    }
    catch(ex) {
      console.log(ex + " ERROR\n");
    }
  }).then(() => {
    // return collected interests slices
    if (interestsSlices[hostsSeen + ""] == null) {
      saveLastInterestsSlice(true);
    }
    return interestsSlices;
  });
}
