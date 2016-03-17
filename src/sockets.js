var socketIO = require('socket.io'),
    crypto = require('crypto');
    _ = require('lodash'),
    redis = require('redis');
    
    
module.exports = function (server, config) {
    var io = socketIO.listen(server);   
    var users = [];    
    var redis_client = redis.createClient(config.redis.port, config.redis.host);
    
    if (config.logLevel) {
        // https://github.com/Automattic/socket.io/wiki/Configuring-Socket.IO
        io.set('log level', config.logLevel);
    }

    io.sockets.on('connection', function (socket) {
        var user_id;
        
        socket.on('auth', function (data) {

            user_id = data.user_id;
            redis_client.get(config.redis.prefix + data.room, function(err, reply) {
                var user_data = JSON.parse(reply);
                user_data = user_data[user_id];

                if (user_data == undefined || user_data.hash != data.hash) {
                    socket.emit('auth_error', 'You do not have access to this room');
                } else {
                    // todo: use redis here too                
                    if (_.findIndex(users, { user_id: user_id }) !== -1) {
                        socket.emit('auth_error', 'You are already connected.');
                    } else {
                        users.push({ 
                            user_id: data.user_id,
                            socket: socket.id
                        });
                        console.log(data.user_id + '(' + socket.id + ') auth ok');
                        socket.broadcast.emit('online', data.user_id);
                        socket.emit('auth_success'); 
                    }
                }
            });

        });

        socket.on('sendMessage', function (name, message) {
            var currentUser = _.find(users, { socket: socket.id });
            if (!currentUser) { return; }

            var contact = _.find(users, { name: name });
            if (!contact) { return; }

            io.to(contact.socket)
                .emit('messageReceived', currentUser.name, message);
        });

        socket.on('disconnect', function () {
            var index = _.findIndex(users, { socket: socket.id });
            if (index !== -1) {
                socket.broadcast.emit('offline', users[index].user_id);
                console.log(users[index].user_id + '(' + users[index].socket + ')' + ' disconnected');

                users.splice(index, 1);
            }
        });
    });


};
