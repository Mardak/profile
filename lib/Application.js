/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const HARDCODED_INTERESTS = {"Technology":0.3300970873786408,"Business":0.27184466019417475,"Video-Games":0.10679611650485436,"Movies":0.0970873786407767,"Politics":0.05825242718446602};
const HARDCODED_URL = "http://timestudy2.vm.labs.scl3.mozilla.com/nytimes/mostpopular/personalize";

const {PageMod} = require("page-mod");
const {HeadlinerPersonalizationAPI} = require("Headliner");
const {id,data} = require("self");

let NYTimesRecommendations = {
  workers: [],
  mod: null,
  contentClient: null,
  allowedInterestSet: {"Arts": true, "Basketball": true, "Travel": true, "Boxing": true, "Soccer": true, "Ideas": true, "Sports": true, "Music": true, "Hockey": true, "Android": true, "Home-Design": true, "Health-Women": true, "Business": true, "Parenting": true, "Football": true, "Autos": true, "Baseball": true, "Tennis": true, "Video-Games": true, "Television": true, "Cooking": true, "Do-It-Yourself": true, "Fashion-Men": true, "Science": true, "Programming": true, "Movies": true, "Golf": true, "Apple": true, "Fashion-Women": true, "Weddings": true, "Entrepreneur": true, "Design": true, "Health-Men": true, "Politics": true, "Technology": true},

  getTop5Interests: function NYTR_getInterests() {
    return HARDCODED_INTERESTS;
  },

  transformData: function NYTR_transformData(rawData) {
    let transformed = [];
    if (rawData.hasOwnProperty("d")) {
      let articles = rawData.d;
      for (let a of articles) {
        let item = {};
        if (a.hasOwnProperty("media") && a.media.length > 0) {
          for (let media of a.media) {
            for (let metadata of media["media-metadata"]) {
              if (metadata.format == "Standard Thumbnail") {
                item.thumbUrl = metadata.url;
              }
            }
          }
        }
        item.url = a.url;
        item.title = a.title;
        item.topic = a.column;
        transformed.push(item);
      }
    }
    return transformed;
  },

  pagemod: {
    contentScriptFile: [data.url("nytimes-personalize.js")],
    contentStyleFile: [data.url("css/nytimes/newstyles.css")],
    include: ["*.nytimes.com"],
    onAttach: function(worker) {
      console.debug("Application.NYTimesRecommendations: attached");
      NYTimesRecommendations.workers.push(worker);
      NYTimesRecommendations.contentClient.getContent(NYTimesRecommendations.getTop5Interests()).then(function recommend(data) {
        let transformed = NYTimesRecommendations.transformData(data);
        worker.port.emit("recommend_on_page", transformed);
      });

      worker.on("detach", function() {
        NYTimesRecommendations.detachWorker(this);
      });
    }
  },

  detachWorker: function NYTR_detachWorker(worker) {
    let index = NYTimesRecommendations.workers.indexOf(worker);
    if (index != -1) {
      NYTimesRecommendations.workers.splice(index, 1);
    }
    console.debug("Application.NYTimesRecommendations: detached");
  },

  destroy: function NYTR_destroy() {
    if (NYTimesRecommendations.mod) {
      NYTimesRecommendations.mod.destroy();
      NYTimesRecommendations.mod = null;
      NYTimesRecommendations.contentClient = null;
      console.debug("Application.NYTimesRecommendations: pagemod destroyed");
    }
  },

  init: function NYTR_init() {
      NYTimesRecommendations.contentClient = new HeadlinerPersonalizationAPI(HARDCODED_URL);
      NYTimesRecommendations.mod = PageMod(NYTimesRecommendations.pagemod);
  },
};

exports.NYTimesRecommendations = NYTimesRecommendations;
