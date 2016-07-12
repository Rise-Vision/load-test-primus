var fakeCore = require("./fake-core.js");
var fakeDisplay = require("./fake-display.js");
var argv = require("yargs")
  .default({ from: 0, count: 10, newClientsPerSec: 100, msgPerSec: 10, offlinePct: 10, serverOnly: false, clientOnly: false, serverUrl: "http://messaging-server-instance-1:3000" })
  .argv;
var serverUrl = argv.serverUrl;
var displayIds = generateDisplayIds(argv.from, argv.count);

if(!argv.serverOnly) {
  var startedClients = 0;
  var clientDisplayIds = displayIds.filter(()=>{ return Math.random() < (100 - argv.offlinePct) / 100; });
  var clientStartupTimer = setInterval(function () {
    if(startedClients < clientDisplayIds.length) {
      for(var i = 0; i < argv.newClientsPerSec && startedClients < clientDisplayIds.length; i++, startedClients++) {
        fakeDisplay.startDisplay(serverUrl, clientDisplayIds[startedClients]);
      }
    }
    else {
      clearInterval(clientStartupTimer);
    }
  }, 1000);
}

if(!argv.clientOnly) {
  fakeCore.startServer(serverUrl, displayIds, argv.msgPerSec);
}

function generateDisplayIds(from, count) {
  var displayIds = [];

  for(var i = from; i < from + count; i++) {
    var id = "";
    var letterCount = 26;
    var rem = i % letterCount;
    var quot = Math.floor(i / letterCount);

    while (quot > 0) {
      id = String.fromCharCode(65 + rem) + id;

      rem = quot % letterCount;
      quot = Math.floor(quot / letterCount);
    }

    id = String.fromCharCode(65 + rem) + id;

    displayIds.push(paddId(id));
  }

  return displayIds;
}

function paddId(id) {
  return "A".repeat(8 - id.length) + id;
}
