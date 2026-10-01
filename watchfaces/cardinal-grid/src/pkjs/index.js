// Cardinal Grid, phone side: the settings page only.
var Clay = require('@rebble/clay');
var config = require('./config.json');

new Clay(config); // sends Setting_HourMode and Setting_TimeColor when the page closes
