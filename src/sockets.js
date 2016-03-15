var socketIO = require('socket.io'),
    crypto = require('crypto');
    _ = require('lodash'),
    redis = require('socket.io-redis');
    
    
module.exports = function (server, config) {
    var io = socketIO.listen(server);
    io.adapter(redis({ host: config.redis.host, port: config.redis.port }));    
    var users = [];

    if (config.logLevel) {
        // https://github.com/Automattic/socket.io/wiki/Configuring-Socket.IO
        io.set('log level', config.logLevel);
    }

    io.sockets.on('connection', function (socket) {
        
        socket.on('login', function (name) {
            // if this socket is already connected,
            // send a failed login message
            if (_.findIndex(users, { socket: socket.id }) !== -1) {
                socket.emit('login_error', 'You are already connected.');
            }

            // if this name is already registered,
            // send a failed login message
            if (_.findIndex(users, { name: name }) !== -1) {
                socket.emit('login_error', 'This name already exists.');
                return; 
            }

            users.push({ 
                name: name,
                socket: socket.id
            });

            socket.emit('login_successful', _.map(users, 'name'));
            socket.broadcast.emit('online', name);

            console.log(name + ' logged in');
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
                socket.broadcast.emit('offline', users[index].name);
                console.log(users[index].name + ' disconnected');

                users.splice(index, 1);
            }
        });
    });


};
