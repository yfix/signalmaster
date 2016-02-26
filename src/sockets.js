var socketIO = require('socket.io'),
    crypto = require('crypto'),
    redis = require('socket.io-redis');
module.exports = function (server, config, mysql) {
    var io = socketIO.listen(server);
    io.adapter(redis({ host: config.redis.host, port: config.redis.port }));

    if (config.logLevel) {
        // https://github.com/Automattic/socket.io/wiki/Configuring-Socket.IO
        io.set('log level', config.logLevel);
    }

    io.sockets.on('connection', function (client) {
        client.resources = {
            screen: false,
            video: true,
            audio: false
        };

        // pass a message to another id
        client.on('message', function (details) {
            if (!details) return;
            
            var otherClient = io.to(details.to);
            if (!otherClient) return;
            
            details.from = client.id;
            otherClient.emit('message', details);
        });

        client.on('join', join);

        function removeFeed(type) {
            if (client.room) {
                mysql.query('UPDATE v_videochat_room_users SET ws_connection_id=\'\' WHERE user_id='+ client.user_id +' AND room_id=' + client.room_id, function(err) { if (err) throw err; });
                
                io.sockets.in(client.room).emit('remove', {
                    id: client.id,
                    type: type
                });
                if (!type) {
                    client.leave(client.room);
                    client.room = undefined;
                }
            }
        }
        
        function join(auth, cb) {
            // sanity check
            if (typeof auth !== 'string') return;
            var arr = auth.split("_");
            var hash = arr[2];
            var name = arr[1];
            var user_id = parseInt(arr[0]);
            
            console.log("Incoming user: " + user_id + ", connection id: " + client.id + ", room " + name);
            
            var sql = 'SELECT ru.* FROM v_videochat_room_users AS ru \n\
                        INNER JOIN v_videochat_rooms AS r ON r.name='+mysql.escape(name)+' AND r.id=ru.room_id \n\
                        INNER JOIN v_user as u ON ru.user_id=u.id\n\
                        WHERE ru.user_id='+user_id+' AND \n\
                        MD5(CONCAT(u.id, u.password,'+mysql.escape(config.auth.secret)+'))='+mysql.escape(hash);

            mysql.query(sql, function(err, result) {
                
                if (err) throw err;
                if(result.length === 0) {
                    safeCb(cb)('join.deny');
                } else {
                    if (result[0].ws_connection_id != '') {
                        safeCb(cb)('join.already_online');
                    } else {
                        var room_id = parseInt(result[0].room_id);
                        // leave any existing rooms
                        mysql.query('UPDATE v_videochat_room_users SET ws_connection_id=' + mysql.escape(client.id) + ' WHERE user_id='+ user_id +' AND room_id='+room_id, function(err) { if (err) throw err; });
                        removeFeed();
                        safeCb(cb)(null, describeRoom(name));
                        client.join(name);
                        client.user_id = user_id;
                        client.room_id = room_id;
                        client.room = name;
                    }
                }
            });
        }

        // we don't want to pass "leave" directly because the
        // event type string of "socket end" gets passed too.
        client.on('disconnect', function () {
            removeFeed();
        });
        client.on('leave', function () {
            removeFeed();
        });

        // support for logging full webrtc traces to stdout
        // useful for large-scale error monitoring
        client.on('trace', function (data) {
            console.log('trace', JSON.stringify(
            [data.type, data.session, data.prefix, data.peer, data.time, data.value]
            ));
        });


        // tell client about stun and turn servers and generate nonces
        client.emit('stunservers', config.stunservers || []);

        // create shared secret nonces for TURN authentication
        // the process is described in draft-uberti-behave-turn-rest
        var credentials = [];
        // allow selectively vending turn credentials based on origin.
        var origin = client.handshake.headers.origin;
        if (!config.turnorigins || config.turnorigins.indexOf(origin) !== -1) {
            config.turnservers.forEach(function (server) {
                var hmac = crypto.createHmac('sha1', server.secret);
                // default to 86400 seconds timeout unless specified
                var username = Math.floor(new Date().getTime() / 1000) + (server.expiry || 86400) + "";
                hmac.update(username);
                credentials.push({
                    username: username,
                    credential: hmac.digest('base64'),
                    urls: server.urls || server.url
                });
            });
        }
        client.emit('turnservers', credentials);
    });


    function describeRoom(name) {
        var adapter = io.nsps['/'].adapter;
        var clients = adapter.rooms[name] || {};
        var result = {
            clients: {}
        };
        
        if (clients['sockets'] !== undefined) {
            Object.keys(clients['sockets']).forEach(function (id) {
                result.clients[id] = adapter.nsp.connected[id].resources;
            });
        }
        return result;
    }
};

function safeCb(cb) {
    if (typeof cb === 'function') {
        return cb;
    } else {
        return function () {};
    }
}
