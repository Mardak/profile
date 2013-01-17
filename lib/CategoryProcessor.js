/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const MILLISECONDS_A_DAY = 86400000000;


function WeightAlgorithm(name, weightFunction) {
  this.name = name;
  this.weightFunction = weightFunction;
}

WeightAlgorithm.prototype = {

  computeWeight: function(placeData,delay) {
     return this.weightFunction(placeData,delay);
  }
}


let nameOrder = {
 "frecency":  0,
 "visits":    1,
 "lin_decay": 2,
 "one":       3,
 "decay_090": 4,
 "decay_095": 5,
 "decay_099": 6
};


function CategoryProcessor(hostsToCats) {
    this.hostMap = hostsToCats;
    this.cats = [{},{},{},{},{}];
    this.largest = {};
    this.firstNDomains = 1000;
    this.unknownSites = {};
    this.totalSites = {};
    this.newSitesSeen = 0;
    this.weightAlgs = [];
    this.weightAlgs.push( new WeightAlgorithm("frecency",function(placeData,dayDelta) { return placeData.frecency; }));
    this.weightAlgs.push( new WeightAlgorithm("visits",function(placeData,dayDelta) { return placeData.vcount; }));
    this.weightAlgs.push( new WeightAlgorithm("lin_decay",function(placeData,dayDelta) { return placeData.vcount * 100.0 / (1+dayDelta); }));
    this.weightAlgs.push( new WeightAlgorithm("one",function(placeData,dayDelta) { return 1; }));
    this.weightAlgs.push( new WeightAlgorithm("decay_090",function(placeData,dayDelta) { return placeData.vcount*Math.pow(0.9,dayDelta); }));
    this.weightAlgs.push( new WeightAlgorithm("decay_095",function(placeData,dayDelta) { return placeData.vcount*Math.pow(0.4,dayDelta); }));
    this.weightAlgs.push( new WeightAlgorithm("decay_099",function(placeData,dayDelta) { return placeData.vcount*Math.pow(0.8,dayDelta); }));
}

CategoryProcessor.prototype = {

  matchCats: function(domain,siteUrl,cats) {
    if (this.hostMap.simple[domain]) {
      this.hostMap.simple[domain].forEach(function(cat) {cats[cat] = 1;});
    } else if (this.hostMap.complex[domain] && siteUrl) {
      // remove everything up to the path
      //let url = new URL(siteUrl);
      let path = siteUrl.replace(/^https?:\/\/[^\/]*/,"");
      // process the matching rules
      this.hostMap.complex[domain].forEach(function(entry) {
        let match = entry[0];
        if (match.indexOf("*") != -1) {
          let re = new RegExp(match);
          if (path.match(re)) {
            entry[1].forEach(function(cat) {cats[cat] = 1;});
          }
        } else if (match.charAt(match.length - 1) == "/") {
          // match prefix
          if (path.indexOf(match) == 0) {
            entry[1].forEach(function(cat) {cats[cat] = 1;});
          }
        } else if (match == path) {
          entry[1].forEach(function(cat) {cats[cat] = 1;});
        }
      }.bind(this));
    }
    return cats;
  },

  consumeHistoryPlace: function(placeData) {
  try {
    let domain = placeData.domain;

    if(!domain) return;
    if( placeData.frecency <= 0 ) return;

    this.totalSites[domain] = (!this.totalSites[domain]) ? 1 : this.totalSites[domain] + 1;
    let matchedCats = {};

    let dayDelta = (Date.now() - placeData.lastVisit / 1000.0) / MILLISECONDS_A_DAY;
    let rank = placeData.rank;
    let rankIndex = 4;
    if (rank == null) {
      rankIndex = 0;
    } else if (rank <= 1000) {
      rankIndex = 4;
    } else if (rank <= 5000) {
      rankIndex = 3;
    } else if (rank <= 10000) {
      rankIndex = 2;
    } else if (rank <= 15000) {
      rankIndex = 1;
    } else {
      rankIndex = 0;
    }

    if (!this.hostMap.simple[domain] && !this.hostMap.complex[domain]) {
      // fallback to topdomain
      let topDomain = placeData.topDomain || "null";
      if(!this.hostMap.simple[topDomain] && !this.hostMap.complex[topDomain]) {
        this.unknownSites[topDomain] = (!this.unknownSites[topDomain]) ? 1 : this.unknownSites[topDomain] + 1;
        matchedCats = { "unknown": 1 }
        //console.log( placeData.url );
      }
    }
    else {
      // match the cats
      this.matchCats(domain,placeData.url,matchedCats);
    }

    // compute algs values
    this.weightAlgs.forEach(function(alg) {
      let name = alg.name;
      let contrib = alg.computeWeight(placeData,dayDelta);
      Object.keys(matchedCats).forEach(function(cat) {
        for (let i = 0; i <= rankIndex; i++) {
          if(!this.cats[i][cat]) this.cats[i][cat] = {};
          this.cats[i][cat][name] = (this.cats[i][cat][name] || 0 ) + contrib;
          //if (!this.largest[name] || this.largest[name] < this.cats[cat][name]) {
          //  this.largest[name] = this.cats[cat][name];
          // }
        }
      }.bind(this));
    }.bind(this));
   } catch(ex) { console.log( "ERROR" , ex ); }
  },

  getCategories: function() {
    // make a copy of cats and normalize it
  try {
    let catsCopy = [{},{},{},{},{}];
    let index = 0;
    for(index; index < 5; index++) {
      Object.keys(this.cats[index]).forEach(function(cat) {
        Object.keys(this.cats[index][cat]).forEach(function(name) {
          let nameIndex = nameOrder[name];
          if(catsCopy[index][cat] == null) catsCopy[index][cat] = [];
          catsCopy[index][cat][nameIndex] = Math.round(this.cats[index][cat][name]);
        }.bind(this));
      }.bind(this));
    }
    //Object.keys(this.unknownSites).forEach(function(site) {console.log(site,this.unknownSites[site]);}.bind(this));
    return catsCopy;
  } catch (ex) {
    console.log("ERROR" , ex );
    return {};
  }
  },

  getUnkownSitesNumber: function() {
    let total = 0;
    Object.keys(this.unknownSites).forEach(function(domain) { total+= this.unknownSites[domain];}.bind(this));
    return total;
  },

  getTotalSitesNumber: function() {
    let total = 0;
    Object.keys(this.totalSites).forEach(function(domain) { total+= this.totalSites[domain];}.bind(this));
    return total;
  }
}

exports.CategoryProcessor = CategoryProcessor;
