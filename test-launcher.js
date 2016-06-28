var fakeCore = require("./fake-core.js");
var fakeDisplay = require("./fake-display.js");
var serverUrl = "http://localhost:3000";
var displayIds = generateDisplayIds(500);

displayIds.forEach((displayId) => {
  fakeDisplay.startDisplay(serverUrl, displayId);
});

fakeCore.startServer(serverUrl, displayIds, 1000);

function generateDisplayIds(count) {
  var displayIds = [];

  for(var i = 0; i < count; i++) {
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
