/*global console*/
var config = require('getconfig'),
    fs = require('fs'),
    sockets = require('./src/sockets'),
    port = parseInt(process.env.PORT || config.server.port, 10),
    server_handler = function (req, res) {
        res.writeHead(404);
        res.end();
    },
    server = null;

// Create an http(s) server instance to that socket.io can listen to
if (config.server.secure) {
    server = require('https').Server({
        key: fs.readFileSync(config.server.key),
        cert: fs.readFileSync(config.server.cert),
        passphrase: config.server.password
    }, server_handler);
} else {
    server = require('http').Server(server_handler);
}

var mysql_module = require('mysql');

var mysql = mysql_module.createConnection({
    host: config.mysql.host,
    port: config.mysql.port,
    user: config.mysql.user,
    password: config.mysql.password,
    database:  config.mysql.database
});

// reset connections
mysql.query('UPDATE v_videochat_room_users SET ws_connection_id=\'\'', function(err) { if (err) throw err; });

server.listen(port);

sockets(server, config, mysql);

if (config.uid) process.setuid(config.uid);

var httpUrl;
if (config.server.secure) {
    httpUrl = "https://localhost:" + port;
} else {
    httpUrl = "http://localhost:" + port;
}
console.log(' -- signal master is running at: ' + httpUrl);
