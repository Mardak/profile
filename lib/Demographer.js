/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {CategoryProcessor} = require("CategoryProcessor");
const {defaultRules} = require("defaultRules");
const {executeQuery} = require("QueryUtils");
const {firstNames} = require("firstNames");
const {hostsToCats} = require("hostsToCats");
const {RulesProcessor} = require("RulesProcessor");
const {setTimeout} = require("timer");
const {sitesDemographics} = require("sitesDemographicsGenerated");
const {sitesOdpCats} = require("sitesOdpGenerated");
const {sitesRanks} = require("sitesRanks");

Cu.import("resource://gre/modules/Services.jsm", this);

if (typeof(BaseClasses) === "undefined"){
  var BaseClasses = require("study_base_classes");
}

const TEST_ID = 20121218;
const PREF_PREFIX = "extensions.testpilot.";
const PREF_ANSWERS = PREF_PREFIX + TEST_ID + ".answers";

exports.experimentInfo = {
  testId: TEST_ID,
  testName: "Demographics Algorithms",
  testInfoUrl: "https://blog.mozilla.org/labs/2012/10/about-profile-analyzing-data-in-firefox/",
  summary: "This study evaluates if demographics data (e.g., gender and age group) can be predicted accurately from browsing history using several algorithms.",
  thumbnail: "https://mozillalabs.com/media/img/uploads/projects/prospector_monkey_8.jpg",
  versionNumber: 1,
  duration: 0.5,
  minTPVersion: "1.2",
  minFXVersion: "4.0",
  optInRequired: true,

  randomDeployment: {
    maxRoll: 6,
    minRoll: 5,
    rolloutCode: "demographics",
  },

  // Target only non-release english users as the study isn't localized
  runOrNotFunc: function() {
    let channel = Services.prefs.getCharPref("app.update.channel");
    let locale = Services.prefs.getCharPref("general.useragent.locale");
    return channel != "release" && locale == "en-US";
  },
};

exports.dataStoreInfo = {
  fileName: "testpilot_" + TEST_ID + "_results.sqlite",
  tableName: "table_name",
  columns: [{
    displayName: "Rank",
    property: "c1",
    type: BaseClasses.TYPE_STRING,
  }, {
    displayName: "Sites",
    property: "c2",
    type: BaseClasses.TYPE_STRING,
  }, {
    displayName: "Algorithm",
    property: "c3",
    type: BaseClasses.TYPE_STRING,
  }, {
    displayName: "Limits",
    property: "c4",
    type: BaseClasses.TYPE_STRING,
  }, {
    displayName: "Demogs",
    property: "c5",
    type: BaseClasses.TYPE_STRING,
  }]
};

// Record an event of some type with data at this time
function record(data) {
  exports.handlers.record({
    c1: data[0] + "",
    c2: data[1] + "",
    c3: data[2] + "",
    c4: data[3] + "",
    c5: data[4] + "",
  });
}

function WindowObs(window, globalObs) {
  WindowObs.baseConstructor.call(this, window, globalObs);
}
BaseClasses.extend(WindowObs, BaseClasses.GenericWindowObserver);

WindowObs.prototype.install = function() {
};

function GlobalObs() {
  GlobalObs.baseConstructor.call(this, WindowObs);
}
BaseClasses.extend(GlobalObs, BaseClasses.GenericGlobalObserver);

GlobalObs.prototype.doExperimentCleanup = function() {
  // Test pilot doesn't correctly shutdown before cleaning
  this.onExperimentShutdown();
};

GlobalObs.prototype.getStudyMetadata = function() {
  // Convert the data to an array
  let studyMetadata = [];
  try {
    studyMetadata.push({
      name: "answers",
      value: Services.prefs.getCharPref(PREF_ANSWERS)
    });
  }
  catch(ex) {}
  return studyMetadata;
};

GlobalObs.prototype.onAppShutdown = function() {
};

GlobalObs.prototype.onAppStartup = function() {
};

let loadCount = 0;
GlobalObs.prototype.onExperimentStartup = function(store) {
  if (++loadCount > 1) return;

  let self = this;
  GlobalObs.superClass.onExperimentStartup.call(self, store);

  // See if we already have answers
  try {
    Services.prefs.getCharPref(PREF_ANSWERS);

    // Don't do any more repeat work
    return;
  }
  catch(ex) {
    // Show the prompt to the user to answer some questions
    let questions = [{
      name: "shared",
      question: "Do you share this computer with others?",
      options: ["No", "Rarely", "Often"],
      ordered: true
    }, {
      name: "gender",
      question: "What is your gender?",
      options: ["Male", "Female"],
      ordered: false
    }, {
      name: "age",
      question: "What is your age group?",
      options: ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"],
      ordered: true
    }];

    // Randomize the questions and options
    let randomize = function randomize() Math.random() - 0.5;
    var randomized = questions.slice().sort(randomize).map(function(item) {
      if (!item.ordered) {
        item.options = item.options.sort(randomize);
      }
      return item;
    });

    // Generate the question text with the randomized data
    let questionText = "";
    randomized.forEach(function({name, question, options}, pos) {
      questionText += "<div>";
      questionText += "<p>" + (pos + 1) + ". " + question + "</p>";
      options.forEach(function(value) {
        questionText += '<label><input type="radio" name="' + name + '" value="' + value + '">' + value + '</label><br/>';
      });
      questionText += "</div>";
    });

    // Open a window/dialog/prompt to ask the user the questions
    let dataURL = 'data:text/html,<!doctype html><html><head><meta charset="utf-8"><title>Demographics Questions</title><style>body { background: white; } button { font-weight: bold; } div { background: rgba(0,0,0,.1); margin: .7em; padding: .2em 1em .5em; } h3 { margin-top: .5em; } img { float: left; height: 64px; margin-top: -15px; width: 64px; } input { margin-right: .5em; } p { margin: .5em 0; }</style></head><body><h3>Sorry to interrupt you. Help Mozilla Firefox by answering these ' + questions.length + ' questions.</h3><img src="chrome://testpilot/skin/testPilot_200x200.png"/><p>' + exports.experimentInfo.summary + '</p>' + questionText + '<button id="save">Save this data for the study</button></body></html>';
    let questionWindow = Services.ww.openWindow(null, dataURL, "demographics", "width=600,height=600,centerscreen,dialog", null);
    questionWindow.addEventListener("load", function() {
      // Automatically focus the first radio button
      let doc = questionWindow.document;
      doc.getElementsByTagName("input")[0].focus();

      // Save the responses and read out the radio values when the window closes
      questionWindow.addEventListener("unload", function() {
        let responses = questions.map(function({name}) {
          let value = "unselected";
          Array.some(doc.getElementsByName(name), function(node) {
            if (node.checked) {
              value = node.value;
              return true;
            }
            return false
          });
          return (name + "_" + value).toLowerCase();
        });

        // Save the responses to avoid asking multiple times
        Services.prefs.setCharPref(PREF_ANSWERS, responses.join(" "));
      });

      // Allow clicking or hitting keys, e.g., enter, to submit / trigger unload
      function closeWindow() questionWindow.close();
      doc.getElementById("save").addEventListener("click", closeWindow);
      doc.defaultView.addEventListener("keypress", function(event) {
        switch (event.keyCode) {
          case event.DOM_VK_ENTER:
          case event.DOM_VK_ESCAPE:
          case event.DOM_VK_RETURN:
            closeWindow();
        }
      });
    });
  }

  // Create demographer
  let demographer = new Demographer();
  demographer.collectDataFromHistory();

  // Record the results from the demographer analysis
  demographer.onReady(function() {
    let res = demographer.getResults();
    res.forEach(function(json) {
      let obj = JSON.parse(json);
      if (obj[0].match(/^(Frecency|VisitCount)$/)) {
        obj.splice(4, 1);
      }
      record(obj);
    });
  });
};

exports.handlers = new GlobalObs();

function WebContent()  {
  WebContent.baseConstructor.call(this, exports.experimentInfo);
}
BaseClasses.extend(WebContent, BaseClasses.GenericWebContent);

WebContent.prototype.__defineGetter__("dataCanvas", function() {
  return '<div class="dataBox"><h3>View Your Data:</h3>' +
    this.dataViewExplanation + this.rawDataLink +
    '<div id="data-plot-div" style="width: 480x; height: 800px;"></div>' +
    this.saveButtons + '</div>';
});

WebContent.prototype.__defineGetter__("dataViewExplanation", function() {
  return "The bar chart below shows the number of algorithms that resulted in a particular gender or age.";
});

WebContent.prototype.__defineGetter__("saveButtons", function() {
  return '<div><button type="button" onclick="exportData();">Export Data</button></div>';
});

WebContent.prototype.onPageLoad = function(experiment, document, graphUtils) {
  let self = this;

  let dataSet = [];
  let nameIndex = {};
  experiment.getDataStoreAsJSON(function(rawData) {
    // Nothing to graph!
    if (rawData.length == 0)
      return;

    // Pick out the search related records
    for each (let {c1, c5} in rawData) {
      if (c1 != "Frecency" && c1 != "VisitCount") continue;
      if (c5 == "undefined") continue;

      // Grab the first two items: gender and age
      let pieces = c5.split(" ");
      for (let i = 0; i <= 1; i++) {
        // Initialize with this new name if necessary
        let name = c5.split(" ")[i];
        if (nameIndex[name] == null) {
          nameIndex[name] = dataSet.length;
          dataSet.push({
            frequency: 1,
            name: name,
          });
        }
        // Otherwise just increment the frequency
        else
          dataSet[nameIndex[name]].frequency++;
      }
    }

    // Convert the data set to bar graph points
    let data = [];
    let yAxis = [];
    for (let [name, index] in Iterator(nameIndex)) {
      data.push([dataSet[index].frequency, index - .5]);
      yAxis.push([index, name]);
    }

    // Show the bar graph
    let plotDiv = document.getElementById("data-plot-div");
    graphUtils.plot(plotDiv, [{data: data}], {
      series: {
        bars: {
          horizontal: true,
          show: true,
        },
      },
      xaxis: {
        min: 0,
        tickDecimals: 0,
      },
      yaxis: {
        ticks: yAxis,
      },
    });
  });
};

exports.webContent = new WebContent();

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
  this.focusDeCount = 0;
  this.algs = [];
  this.results=[];
  this.waitingReady = [];
  this.siteRankHistogram = { "Frecency": [] , "VisitCount": [] };
  this.formHistoryAlg = new WeightedSumDemogAlgorithm("form-history");
  this.formHistoryNameAlg = new WeightedSumDemogAlgorithm("form-first-name");
  this.formHistoryNameUsedAlg = new WeightedSumDemogAlgorithm("form-first-name-used");
  this.formHistoryNameMostAlg = new WeightedSumDemogAlgorithm("form-first-name-most");
  this.formHistoryEmailAlg = new WeightedSumDemogAlgorithm("form-email-name");
  this.formHistoryEmailUsedAlg = new WeightedSumDemogAlgorithm("form-email-name-used");
  this.cats = {};
  this.mySites = {};
  //this.allSites = {};
  //this.readDemographics();
  this.allSites = sitesDemographics;
  this.sitesRanks = sitesRanks;
  this.setupAlgs();
  this.ready = false;
  this.historyReady = false;
  this.formHistoryReady = 0;
  this.categoryProcessor = new CategoryProcessor(hostsToCats);
  this.rulesProcessor = new RulesProcessor(defaultRules);
}

Demographer.prototype = {

 onReady: function(cb) {
   if (this.ready) {
     setTimeout(function() cb());
   } else {
     this.waitingReady.push(cb);
   }
 },

  clearAll: function() {
    this.mySites = {};
    this.cats = {};
    this.results=[];
    this.clearAlgs();
  },

  runIfReady: function() {
    if(this.historyReady && this.formHistoryReady == 2) {
      this.finalizeComputations();
      this.ready = true;
      this.waitingReady.forEach(function(cb) cb());
      this.waitingReady.length = 0;
    }
  },

  finalizeComputations: function() {
    let form_algs = [
      this.formHistoryAlg,
      this.formHistoryNameAlg,
      this.formHistoryNameUsedAlg,
      this.formHistoryNameMostAlg,
      this.formHistoryEmailAlg,
      this.formHistoryEmailUsedAlg
    ];
    form_algs.forEach( function(alg) {
      let jsonObj = [];
      jsonObj[0] = "FormHistory";
      jsonObj[1] = "FormHistory";
      jsonObj[2] = alg.name;
      jsonObj[3] = alg.getBests( );
      jsonObj[4] = alg.demogs;
      this.results.push( JSON.stringify(jsonObj) );
    }.bind(this));

    // process ODP categorization
    let outputCount = 0;

    let self = this;
    Object.keys(this.cats).sort(function(a, b) {
       return self.cats[b].visist_log - self.cats[a].visist_log;
    }).forEach( function(cat) {
      if( this.cats[cat].total_sites <= 1 || outputCount >= 500 ) {
        return;
      }
      let jsonObj = [];
      jsonObj[0] = "ODP_CATEGORY";
      jsonObj[1] = cat;
      jsonObj[2] = Math.round( this.cats[cat].visist_log * 100 );
      jsonObj[3] = this.cats[cat].frecency;
      jsonObj[4] = Math.round( this.cats[cat].frecency_log * 100 );
      this.results.push( JSON.stringify(jsonObj) );

      outputCount++;
    }.bind(this));

    // get interest cats
    try {
    let resultCats = this.categoryProcessor.getCategories();
      for(let index=0; index < resultCats.length; index++) {
        Object.keys(resultCats[index]).sort(function(a, b) {
          return resultCats[index][b][0] - resultCats[index][a][0];
        }).forEach(function(cat) {
          let jsonObj = [];
          jsonObj[0] = "INTEREST";
          jsonObj[1] = index;
          jsonObj[2] = cat;
          jsonObj[3] = resultCats[index][cat].join(" ");
          this.results.push( JSON.stringify(jsonObj) );
        }.bind(this));
      }

      let jsonObj = [];
      jsonObj[0] = "SITES_DATA";
      jsonObj[1] = this.categoryProcessor.getTotalSitesNumber();
      jsonObj[2] = this.categoryProcessor.getUnkownSitesNumber();
      jsonObj[3] = this.focusDeCount;
      this.results.push( JSON.stringify(jsonObj) );

      let rulesResults = this.rulesProcessor.getThresholdedResults();
      Object.keys(rulesResults).forEach(function(rule) {
        let jsonObj = [];
        jsonObj[0] = "RULE";
        jsonObj[1] = rule;
        jsonObj[2] = rulesResults[rule];
        this.results.push(JSON.stringify(jsonObj));
      }.bind(this));
    } catch(ex) { console.log( "ERR " , ex ); }

  } ,

  outputHistograms: function(sortOrder,index,histogram) {
    // push the histograms
    let jsonObj = ["Histogram", sortOrder, index, histogram];
    this.results.push( JSON.stringify(jsonObj) );
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

  extractDomain: function(host) {
    // and make sure to get rid of www
    let re = /^[.]/;
    host = host.replace(re, "");
    return Services.eTLD.getBaseDomainFromHost(host);
  },

  readHistory: function(offset) {

    if (offset == null) {
      offset = -1;
    }

    let startTime = Date.now();
    let query = "SELECT visit_count, rev_host, frecency, url, last_visit_date , id " +
                "FROM moz_places " +
                "WHERE rev_host IS NOT null AND frecency > 0 AND visit_count > 0 AND hidden = 0 AND id > :offset " +
                "ORDER BY id " +
                "LIMIT 1000";

    let lastId;
    executeQuery("places",query,{offset: offset}, {
        onRow: function(row) {
        try {
          let vcount = row.getResultByIndex(0);
          let rev_host = row.getResultByIndex(1);
          let frecency = row.getResultByIndex(2);
          let url = row.getResultByIndex(3);
          let last_visit_date = row.getResultByIndex(4)
          let host = rev_host.split("").reverse().join("");

          lastId = row.getResultByIndex(5);

          // if host is preceeded with '.', remove it
          if (host.charAt(0) == '.') {
            host = host.slice(1);
          }

          // prepare placeData to send to categiryProcesor
          let re = /^[.]?www[.]/;
          let placeData = {
            domain: host.replace(re,""),
            frecency: frecency,
            lastVisit: last_visit_date,
            url: url,
            vcount: vcount
          };

          // now we need to grep the super domain
          let domain = this.extractDomain(host);

          if (domain == "focus.de") {
            this.focusDeCount ++;
          }

          // submit to categiryProcesor
          placeData["topDomain"] = domain;
          placeData["rank"] = this.sitesRanks[domain];
          this.categoryProcessor.consumeHistoryPlace(placeData);
          this.rulesProcessor.consumeHistoryPlace(placeData);

          // bail if domain is empty or we have no demographics for it
          if (!domain || !this.allSites[domain]) {
            return;
          }

          let site = this.mySites[domain];
          if (!this.mySites[domain]) {
            this.mySites[domain] = {count: 0,frecency: 0};
          }
          this.mySites[domain].count += vcount;
          this.mySites[domain].frecency += frecency;
        } catch (ex) {
          console.log("ERROR " , ex );
        }
        }.bind(this),

        onCompletion: function(reason) {
          if (lastId != null) {
            setTimeout(function() {
              this.readHistory(lastId);
            }.bind(this), 10);
          }
          else {
            this.computeSitesData();
            this.computeDemographics();
            this.historyReady = true;
            this.runIfReady();
          }
        }.bind(this),

        onError: function(error) {
          console.log(error);
        }.bind(this),
     });
  },

  analizeFormHistory: function(field,value,used) {
    console.log( field,value,used );
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
    else if( field.indexOf("firstname") > -1 || field.indexOf("first name") > -1 || field.indexOf("first_name") > -1) {
      // check the name against the dictionary
      if( firstNames["male"][value] != null) {
        this.formHistoryNameAlg.addToBuket("male",1);
        this.formHistoryNameUsedAlg.addToBuket("male",used);
      }
      else if (firstNames["female"][value] != null) {
        this.formHistoryNameAlg.addToBuket("female",1);
        this.formHistoryNameUsedAlg.addToBuket("female",used);
      }
      // Indicate that we didn't determine the gender
      else {
        this.formHistoryNameAlg.addToBuket("college", 1);
        this.formHistoryNameUsedAlg.addToBuket("college", used);
      }
    }
    else if( field == "email" ) {
      let re = /^([a-z]+)[._][a-z]+@/;
      let match = re.exec( value );
      console.log( field , value , match );
      if( match ) {
        let name = match[1];
        if( firstNames["male"][name] != null) {
          this.formHistoryEmailAlg.addToBuket("male",1);
          this.formHistoryEmailUsedAlg.addToBuket("male",used);
        }
        else if (firstNames["female"][name] != null) {
          this.formHistoryEmailAlg.addToBuket("female",1);
          this.formHistoryEmailUsedAlg.addToBuket("female",used);
        }
        // Indicate that we didn't determine the gender
        else {
          this.formHistoryEmailAlg.addToBuket("college", 1);
          this.formHistoryEmailUsedAlg.addToBuket("college", used);
        }
      }
    }
    else {
      if(value.indexOf("female") > -1 || value.indexOf("woman") > -1) {
        this.formHistoryAlg.addToBuket("female",1);
      }
      else if(value.indexOf("male") > -1 || value.indexOf("man") > -1) {
        this.formHistoryAlg.addToBuket("male",1);
      }
    }
  },

  readFormHistory: function() {
    let query = "select fieldname , value , timesUsed from moz_formhistory where fieldname like \"%dob%\" OR " +
                                                                    "fieldname like \"%birth%\" OR " +
                                                                    "fieldname like \"%gender%\" OR " +
                                                                    "fieldname like \"email\" OR " +
                                                                    "fieldname like \"%first%name%\"";

    executeQuery("form",query, null, {
        onRow: function(row) {
          let fieldname = row.getResultByIndex(0);
          let value = row.getResultByIndex(1);
          let used = row.getResultByIndex(2);
          this.analizeFormHistory(fieldname.toLowerCase(),value.toLowerCase(),used);
          //this.formData.push([fieldname,value]);
        }.bind(this),

        onCompletion: function(reason) {
          this.formHistoryReady++;
          this.runIfReady();
        }.bind(this),

        onError: function(error) {
          console.log(error);
          this.runIfReady();
        }.bind(this),
    });

    // Find the most used name and determine the gender
    let sumQuery = "SELECT SUM(timesUsed) totalUsed, value FROM moz_formhistory WHERE fieldname LIKE '%first%name%' GROUP BY value ORDER BY totalUsed DESC LIMIT 1";
    executeQuery("form", sumQuery, null, {
      onRow: function(row) {
        let totalUsed = row.getResultByIndex(0);
        let value = row.getResultByIndex(1).toLowerCase();

        // Indicate which gender we found
        if (firstNames["male"][value] != null) {
          this.formHistoryNameMostAlg.addToBuket("male", totalUsed);
        }
        else if (firstNames["female"][value] != null) {
          this.formHistoryNameMostAlg.addToBuket("female", totalUsed);
        }
        // Indicate that we didn't determine the gender
        else {
          this.formHistoryNameMostAlg.addToBuket("college", totalUsed);
        }
      }.bind(this),

      onCompletion: function(reason) {
        this.formHistoryReady++;
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

          // submit the site to all algorithms
          this.algs.forEach( function(alg) {
            alg.consumeSiteData(domain, this.mySites[domain].count , this.mySites[domain].frecency, index, siteData );
          }.bind(this));
        }

        let rank = this.sitesRanks[domain];
        if (rank == null) continue;


        // collect rank histogram
        let rankBuket = Math.floor(rank / 100);
        if (rankBuket > 9) {
          rankBuket = 9 + Math.floor(rank / 1000);
          if (rankBuket > 19) {
            rankBuket = 19 + Math.floor(rank / 10000);
            if (rankBuket > 29) {
              rankBuket = 30;
            }
          }
        }

        if(!histogram[rankBuket]) {
          histogram[rankBuket] = 0;
        }
        histogram[rankBuket] ++;

      } // end of ordered sites loop
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

  computeSitesData: function() {
   for (let domain in this.mySites) {
      if (domain) {
        this.processHistorySite(domain);
      }
   }
  },

  processHistorySite: function(domain) {
    // ok check if site is present
    let siteData = sitesOdpCats[domain];

    if (!siteData) return;   // domain is not found

    // otherwise add it to the soup
    let addedHash = {};
    siteData.forEach(function(category) {
          this.addToCategory(domain, category, this.mySites[domain].count , this.mySites[domain].frecency , addedHash);
     }.bind(this));
  },

  addToCategory: function(domain, cat, count, frecency , addedHash) {
    // for now simply take the top ones
    let them = cat.split("/");
    let top = them.shift();
    let depth = 1;
    while(them.length && depth < 4) {
      top += "/" + them.shift();
      depth ++;
    }
    // check if we saw this category already
    if (addedHash[top]) {
      return;
    }

    addedHash[top] = 1;

    if (!this.cats[top]) {
      this.cats[top] = { total_sites: 0 , visist_log: 0 , frecency: 0 , frecency_log: 0};
    }
    this.cats[top].visist_log += Math.log(count);
    this.cats[top].frecency += frecency;
    this.cats[top].frecency_log += (frecency>0) ? Math.log(frecency) : 0;
    this.cats[top].total_sites ++;
  },

  getResults: function() {
    return this.results;
  }

}

exports.Demographer = Demographer;
exports.demographicsGP = demographicsGP;
exports.WeightedSumDemogAlgorithm = WeightedSumDemogAlgorithm;
exports.ProductDemogAlgorithm = ProductDemogAlgorithm;
