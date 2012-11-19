/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {Class} = require("api-utils/heritage");
const {data} = require("self");
const {Demographer} = require("Demographer");
const {Factory, Unknown} = require("api-utils/xpcom");
const Observer = require("observer-service");
const {PageMod} = require("page-mod");
const Preferences = require("simple-prefs");
const tabs = require("tabs");
const widgets = require("widget");

const {Ci,Cu} = require("chrome");
Cu.import("resource://gre/modules/Services.jsm");

exports.main = function(options, callbacks) {
  // Create demographer
  let demographer = new Demographer();
  demographer.collectDataFromHistory();

  // Handle about:profile requests
  Factory({
    contract: "@mozilla.org/network/protocol/about;1?what=profile",

    Component: Class({
      extends: Unknown,
      interfaces: ["nsIAboutModule"],

      newChannel: function(uri) {
        let chan = Services.io.newChannel(data.url("demog.html"), null, null);
        chan.originalURI = uri;
        return chan;
      },

      getURIFlags: function(uri) {
        return Ci.nsIAboutModule.URI_SAFE_FOR_UNTRUSTED_CONTENT;
      }
    })
  });

  widgets.Widget({
    id: "demogs",
    label: "demogs",
    contentURL: data.url("icon.png"),
    onClick: function() {
      console.log("clicked");
      tabs.open(
      {
        url: data.url( "demog.html"),
        onReady: function ( tab ) {
                  let worker = tab.attach({
                     contentScriptFile: [
                        data.url("jquery/jquery.min.js"),
                        data.url("demog.js"),
                     ],
                  });

                  worker.port.on("donedoc", function() {
                    // Make sure the demographer is done computing before accessing
                    demographer.onReady(function() {
                      worker.port.emit("show_demog", demographer.getResults());
                    });
                  });
                }
      });
    }
  });
}
