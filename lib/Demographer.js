/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const file = require("file");
const timers = require("timers");
const {data} = require("self");
const {sitesDemographics} = require("sitesDemographicsGenerated");

const {Cc,Ci,Cm,Cr,Cu,components} = require("chrome");

Cm.QueryInterface(Ci.nsIComponentRegistrar);

Cu.import("resource://gre/modules/Services.jsm", this);

const queryUtils = require("QueryUtils");
const demogBuckets = [
  "age_18",    // 0 
  "age_25",    // 1 
  "age_35",    // 2 
  "age_45",    // 3 
  "age_55",    // 4 
  "age_65",    // 5 
  "no_college",      // 6 
  "some_college",    // 7 
  "college",         // 8 
  "graduate",        // 9 
  "male",                  // 10 
  "female",                // 11
  "children",                    // 12
  "no_children"                  // 13
];

// this has to be a variable, so test can change it
var demographicsGP = [
  20 , // "age_18" 
  20 , // "age_25" 
  19 , // "age_35" 
  17 , // "age_45" 
  15 , // "age_55" 
  9 , // "age_65" 
  19 , // "no_college" 
  31 , // "some_college" 
  37 , // "college" 
  13 , // "graduate" 
  51 , // "male" 
  49 , // "female" 
  40 , // "children" 
  60   // "no_children" 
];

function findDemogIndex(name) {
  for(let x=0;x < 13;x++) {
    if(name == demogBuckets[x]) {
      return x;
    }
  }
  return -1;
}


function DemogAlgorithm(name, dLimitsInterval) {
  this.name = name;
  this.dLimits = dLimitsInterval;
  this.demogs = [];
}

DemogAlgorithm.prototype = {

  zeroOut: function() {
    let index = 0;
    while(index < 14) {
      this.demogs[index++] = 0;
    }
  },

  oneOut: function() {
    let index = 0;
    while(index < 14) {
      this.demogs[index++] = 1;
    }
  },

  chooseBest: function(startIndex, endIndex) {
    let best = this.demogs[startIndex];;
    let bestIndex = startIndex;
    let foundOther = 0;
    startIndex++;
    while(startIndex <= endIndex) {
      if(best != this.demogs[startIndex]) {
        foundOther = 1;
      }
      if( best < this.demogs[startIndex]){
        best = this.demogs[startIndex];
        bestIndex = startIndex;
      }
      startIndex++;
    }
    // test for 
    if( best == 0 && foundOther == 0 ) {
      return -1;
    }
    return bestIndex;
  },

  getBestAgeIndex: function() { return this.chooseBest(0,5); },
  getBestEducationIndex: function() { return this.chooseBest(6,9); },
  getBestGenderIndex: function() { return this.chooseBest(10,11); },
  getBestChildrenIndex: function() { return this.chooseBest(12,13); },

  getBestAge: function() { let index = this.getBestAgeIndex(); return (index > -1 ? demogBuckets[index] : "null_age"); },
  getBestEducation: function() { let index = this.getBestEducationIndex(); return (index > -1 ? demogBuckets[index] : "null_education"); },
  getBestGender: function() { let index = this.getBestGenderIndex(); return (index > -1 ? demogBuckets[index] : "null_gender"); },
  getBestChildren: function() { let index = this.getBestChildrenIndex(); return (index > -1 ? demogBuckets[index] : "null_children"); },


  clear: function() { this.subClassClear(); },

  getBests: function() {
    return this.getBestGender() + " " + 
           this.getBestAge() + " " + 
           this.getBestChildren() + " " +
           this.getBestEducation() ;
  },

  consumeSiteData: function(site, visits, frecency, localRank,siteGlobalData) {
    for(let index=0; index < 14; index++) {
      this.subClassAddToBucket(index, site, visits, frecency, localRank, siteGlobalData);
    }
  },

  addToBuket: function(name,value) {
    let ind =  findDemogIndex(name);
    if( ind >= 0 ) {
      this.demogs[ind] += value;
    }
  }
}

// start creating algorithms  
function WeightedSumDemogAlgorithm(name, dLimits, weightFunction) {
  DemogAlgorithm.call(this,name,dLimits);
  this.weightFunction = weightFunction;
  this.clear();
}

WeightedSumDemogAlgorithm.prototype = new DemogAlgorithm();
WeightedSumDemogAlgorithm.prototype.constructor = WeightedSumDemogAlgorithm;
WeightedSumDemogAlgorithm.prototype.subClassClear = function() { 
  this.zeroOut();
}

WeightedSumDemogAlgorithm.prototype.subClassAddToBucket = function(index, site, visits, frecency, localRank, siteGlobalData) { 
  let dValue = siteGlobalData["dValues"][index];
  // check if dValue falls into the prescribed interval 
  if( this.dLimits && (dValue <= this.dLimits[0] || dValue >= this.dLimits[1]) ) {
    this.demogs[index] += this.weightFunction(index, site, visits, frecency, localRank, siteGlobalData);
  }
}


function ProductDemogAlgorithm(name, dLimits, weightFunction) {
  DemogAlgorithm.call(this,name,dLimits);
  this.weightFunction = weightFunction;
  this.clear();
}

ProductDemogAlgorithm.prototype = new DemogAlgorithm();
ProductDemogAlgorithm.prototype.constructor = ProductDemogAlgorithm;
ProductDemogAlgorithm.prototype.subClassClear = function() {
  this.oneOut();
}

ProductDemogAlgorithm.prototype.subClassAddToBucket = function(index, site, visits, frecency, localRank, siteGlobalData) {
  let dValue = siteGlobalData["dValues"][index];
  // check if dValue falls into the prescribed interval 
  if( this.dLimits && (dValue <= this.dLimits[0] || dValue >= this.dLimits[1]) ) {
    let w = this.weightFunction(index, site, visits, frecency, localRank, siteGlobalData);
    this.demogs[index] *= w;
  }
}

function Demographer() {
  this.mySites = {};
  this.algs = [];
  this.results=[];
  this.waitingReady = [];
  this.siteRankHistogram = { "Frecency": [] , "VisitCount": [] };
  this.formHistoryAlg = new WeightedSumDemogAlgorithm("form-history");;
  //this.allSites = {};
  //this.readDemographics();
  this.allSites = sitesDemographics;
  this.setupAlgs();
  this.ready = false;
  this.historyReady = false;
  this.formHistoryReady = false;
}

Demographer.prototype = {

 onReady: function(cb) {
   if (this.ready) {
     timers.setTimeout(function() cb());
   } else {
     this.waitingReady.push(cb);
   }
 },

  clearAll: function() {
    this.mySites = {};
    this.results=[];
    this.clearAlgs();
  },

  runIfReady: function() {
    if(this.historyReady && this.formHistoryReady) {
      this.finalizeComputations();
      this.ready = true;
      this.waitingReady.forEach(function(cb) cb());
      this.waitingReady.length = 0;
    }
  },

  finalizeComputations: function() {
    let alg = this.formHistoryAlg;
    let jsonObj = [];
    jsonObj[0] = "FormHistory";
    jsonObj[1] = "FormHistory";
    jsonObj[2] = alg.name;
    jsonObj[3] = null;
    jsonObj[4] = alg.demogs;
    jsonObj[5] = alg.getBests( );
    this.results.push( JSON.stringify(jsonObj) );
    console.log( JSON.stringify(jsonObj) );
  },

  outputHistograms: function(sortOrder,index,histogram) {
    // push the histograms
    let jsonObj = ["Histogram", sortOrder, index, histogram];
    this.results.push( JSON.stringify(jsonObj) );
    //console.log( JSON.stringify(jsonObj) );
  },

  addWeightedSumAlg: function(name,weightFunction) {
    for(let x=0; x < 50; x+=10) {
      this.algs.push( new WeightedSumDemogAlgorithm(name,[-x,x],weightFunction));
    }
  },

  addProductAlg: function(name,weightFunction) {
    for(let x=0; x < 50; x+=10) {
      this.algs.push( new ProductDemogAlgorithm(name,[-x,x],weightFunction));
    }
  },

  setupAlgs: function() {
     this.addWeightedSumAlg( "logVisists_D" , function(index, site, visits, frecency, localRank, siteGlobalData) {
       return (1+Math.log(visits)) * siteGlobalData["dValues"][index];
     });
     this.addWeightedSumAlg( "logFrecency_D" , function(index, site, visits, frecency, localRank, siteGlobalData) {
       return (1+Math.log(frecency)) * siteGlobalData["dValues"][index];
     });
     this.addWeightedSumAlg( "just_D" , function(index, site, visits, frecency, localRank, siteGlobalData) {
       return +siteGlobalData["dValues"][index];
     });
     this.addWeightedSumAlg( "sign_of_D" , function(index, site, visits, frecency, localRank, siteGlobalData) {
       if( siteGlobalData["dValues"][index] != 0) {
         return ( siteGlobalData["dValues"][index] > 0 ) ? 1 : -1 ;
       } else {
         return 0;
       }
     });
     this.addWeightedSumAlg( "number_of_positive_Ds" , function(index, site, visits, frecency, localRank, siteGlobalData) {
       return ( siteGlobalData["dValues"][index] > 0 ) ? 1 : 0 ;
     });
     this.addWeightedSumAlg( "rounded_Ds" , function(index, site, visits, frecency, localRank, siteGlobalData) {
       return Math.round( siteGlobalData["dValues"][index] / 10 ) ;
     });

     // product algs
     this.addProductAlg( "product_of_gen_probs" , function(index, site, visits, frecency, localRank, siteGlobalData) {
       return +siteGlobalData["genProbs"][index];
     });
     this.addProductAlg( "product_of_eq_probs" , function(index, site, visits, frecency, localRank, siteGlobalData) {
       return +siteGlobalData["equalProbs"][index];
     });
     this.addProductAlg( "product_of_normed_Ds" , function(index, site, visits, frecency, localRank, siteGlobalData) {
       return ( 1 + siteGlobalData["dValues"][index] / 52.0 );
     });
     this.addProductAlg( "product_of_normed_rounded_Ds" , function(index, site, visits, frecency, localRank, siteGlobalData) {
       return ( 1 + Math.round(siteGlobalData["dValues"][index] / 10 ) * 10 / 52.0 );
     });
     this.addProductAlg( "product_of_less_normed_Ds" , function(index, site, visits, frecency, localRank, siteGlobalData) {
       return ( 1 + siteGlobalData["dValues"][index] / 100.0 );
     });
     this.addProductAlg( "product_of_less_normed_rounded_Ds" , function(index, site, visits, frecency, localRank, siteGlobalData) {
       return ( 1 + Math.round(siteGlobalData["dValues"][index] / 10 ) * 10 / 100.0 );
     });

  },

  clearAlgs: function() {
    this.algs.forEach(function (alg) {alg.clear();});
  },

  computeProbabilitesForChunk: function(dValues, outProbabilites, startIndex, endIndex, denominator, defaultProps) {

    let index = startIndex;
    let total = 0;
    while ( index <= endIndex) {
      outProbabilites[index] = ( 1 + dValues[index] / denominator ) * ( defaultProps ? defaultProps[index] : 1 );
      total += outProbabilites[index];
      index++;
    }

    // normalize by total
    for(index = startIndex; index <= endIndex; index++) {
      outProbabilites[index] /= 1.0 * total;
    }

  }, 

  computeSiteProbabilites: function(domain) {
    let site = this.allSites[domain]; 

    // check if siter exists and probabilites were not computed
    if(!site || site["genProbs"].length > 0) return;   

    // compute probabilites for various demographics, the indexation as follows:

    // compute probabilites that take into account general population differences
    this.computeProbabilitesForChunk( site["dValues"] , site["genProbs"], 0, 5, 52, demographicsGP);  // age
    this.computeProbabilitesForChunk( site["dValues"] , site["genProbs"], 6, 9, 52, demographicsGP);  // education
    this.computeProbabilitesForChunk( site["dValues"] , site["genProbs"], 10, 11, 52, demographicsGP);  // gender
    this.computeProbabilitesForChunk( site["dValues"] , site["genProbs"], 12, 13, 52, demographicsGP);  // children

    // compute probabilites under equal shares assumption
    this.computeProbabilitesForChunk( site["dValues"] , site["equalProbs"], 0, 5, 52, null);  // age
    this.computeProbabilitesForChunk( site["dValues"] , site["equalProbs"], 6, 9, 52, null);  // education
    this.computeProbabilitesForChunk( site["dValues"] , site["equalProbs"], 10, 11, 52, null);  // gender
    this.computeProbabilitesForChunk( site["dValues"] , site["equalProbs"], 12, 13, 52, null);  // children
  },

  extractDomain: function(domain) {
    // and make sure to get rid of www
    let re = /^www[.]/;
    domain = domain.replace(re, "");

    // ok check if site is present in our global site list
    let siteData = this.allSites[domain];

    // attempt to go to the root domain, keep the lastDomain
    // so that we never ran into endless loop if regex does not replace
    // anything.  Hence, regex failes on strings starting with '.'
    let lastDomain = domain;
    while (!siteData) {
      domain = domain.replace(/^[^.]+[.]/, "");
      if (domain == lastDomain || domain.length <= 1 || domain.indexOf(".") < 0) {
        domain = null;
        // no need to go further
        break;
      }
      siteData = this.allSites[domain];
    }

    return siteData ? domain : null;
  },

  readHistory: function() {

    this.mySites = {};
    let startTime = Date.now();
    let query = "select SUM(visit_count), rev_host, frecency from moz_places where visit_count >= 1 group by rev_host";

    var s1 = Date.now();
    queryUtils.executeQuery("places",query, null, {
        onRow: function(row) {
        try{
          let vcount = row.getResultByIndex(0);
          let rev_host = row.getResultByIndex(1);
          let frecency = row.getResultByIndex(2);
          let host = rev_host.split("").reverse().join("");

          // if host is preceeded with '.', remove it
          if (host.charAt(0) == '.') {
            host = host.slice(1);
          }

          // now we need to grep the domain
          let domain = this.extractDomain(host);
          // bail if domain is empty
          if (!domain) {
            return;
          }

          let site = this.mySites[domain];
          if (!this.mySites[domain]) {
            this.mySites[domain] = {count: 0,frecency: 0};
          }
          this.mySites[domain].count += vcount;
          this.mySites[domain].frecency += frecency;
        } catch( ex) {
          console.log( "ERROR " + ex );
        }
        }.bind(this),

        onCompletion: function(reason) {
          var s2 = Date.now();
          console.log("sql exec", s2 - s1);
          this.computeDemographics();
          this.historyReady = true;
          this.runIfReady();
        }.bind(this),

        onError: function(error) {
          console.log(error);
        }.bind(this),
     });
  },

  analizeFormHistory: function(field,value) {
    if(field.indexOf("dob") > -1 || field.indexOf("birth") > -1) {
      // this one is tricky as we need to regex for 19[0-9][0-9]
      let matches_array = value.match(/19[0-9][0-9]/g);
      if(matches_array && matches_array.length) {
        matches_array.forEach( function(year) {
          let age = 2012 - (+year);
          if(age < 25) {
            this.formHistoryAlg.addToBuket("age_18",1);
          } 
          else if(age < 35) {
            this.formHistoryAlg.addToBuket("age_25",1);
          }
          else if(age < 45) {
            this.formHistoryAlg.addToBuket("age_35",1);
          }
          else if(age < 55) {
            this.formHistoryAlg.addToBuket("age_45",1);
          }
          else if(age < 65) {
            this.formHistoryAlg.addToBuket("age_55",1);
          }
          else {
            this.formHistoryAlg.addToBuket("age_65",1);
          }
        }.bind(this));
      }
    } 
    else {
      // must be gender
      if(value.indexOf("female") > -1 || value.indexOf("woman") > -1) {
        this.formHistoryAlg.addToBuket("female",1);
      } 
      else if(value.indexOf("male") > -1 || value.indexOf("man") > -1) {
        this.formHistoryAlg.addToBuket("male",1);
      }
    }
  },

  readFormHistory: function() {

    let query = "select fieldname , value from moz_formhistory where fieldname like \"%dob%\" OR fieldname like \"%birth%\" or fieldname like \"%gender%\"";  
    queryUtils.executeQuery("form",query, null, {
        onRow: function(row) {
          let fieldname = row.getResultByIndex(0);
          let value = row.getResultByIndex(1);
          this.analizeFormHistory(fieldname.toLowerCase(),value.toLowerCase());
          //this.formData.push([fieldname,value]);
        }.bind(this),

        onCompletion: function(reason) {
          this.formHistoryReady = true;
          this.runIfReady();
        }.bind(this),

        onError: function(error) {
          console.log(error);
          this.runIfReady();
        }.bind(this),
    });
  },

  computeDemographics: function() {

      // compute highest frecency sites
      let orderedSites = Object.keys(this.mySites).sort(function(a, b) {
        return this.mySites[b].frecency - this.mySites[a].frecency;
      }.bind(this));

      this.submitOrderedSites( "Frecency" , 200 , orderedSites);

      this.clearAlgs( );

      // order by visit count
      let orderedSites = Object.keys(this.mySites).sort(function(a, b) {
        return this.mySites[b].count - this.mySites[a].count;
      }.bind(this));

      this.submitOrderedSites( "VisitCount" , 200 , orderedSites);
  },

  submitOrderedSites: function(sortOrder,sitesChampionsLimit,orderedSites) {
      let histogram = this.siteRankHistogram[sortOrder];
      for (let index in orderedSites) {
        let domain = orderedSites[index];
        let siteData = this.allSites[domain];
        if (siteData) {
          this.computeSiteProbabilites(domain);

          if( index > 0 && ((index % 10) == 0 || index >= sitesChampionsLimit)) {
            // output results
            this.outputResults(sortOrder,index);
            this.outputHistograms(sortOrder,index,histogram);
          }
          
          // check if we got enough sites
          if( index >= sitesChampionsLimit ) {
            break;
          }

          // collect rank histogram
          let rankBuket = Math.floor(siteData.rank / 100);
          if( rankBuket > 19 ) {
            rankBuket = 19;
          }

          if(!histogram[rankBuket]) {
            histogram[rankBuket] = 0;
          }
          histogram[rankBuket] ++;

          // submit the site to all algorithms
          this.algs.forEach( function(alg) {
            alg.consumeSiteData(domain, this.mySites[domain].count , this.mySites[domain].frecency, index, siteData );
          }.bind(this));

        }
      }
  },

  outputResults: function(orderType,index) {
    let jsonObj = [orderType,index];
    this.algs.forEach( function(alg) {
      jsonObj[2] = alg.name;
      jsonObj[3] = alg.dLimits[1];
      jsonObj[4] = alg.demogs;
      jsonObj[5] = alg.getBests( );
      this.results.push( JSON.stringify(jsonObj) );
      //console.log( JSON.stringify(jsonObj) );
    }.bind(this));
  },

  collectDataFromHistory: function() {
    this.readHistory();
    this.readFormHistory();
  } ,

  getResults: function() {
    return this.results;
  }

}

exports.Demographer = Demographer;
exports.demographicsGP = demographicsGP;
exports.WeightedSumDemogAlgorithm = WeightedSumDemogAlgorithm;
exports.ProductDemogAlgorithm = ProductDemogAlgorithm;
