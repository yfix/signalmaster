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

                if (user_data == undefined) {
                    socket.emit('auth_error', 'You do not have access to this room');
                } else {
                    socket.emit('auth_success'); 
                }
                console.log(user_data);
/*            
            socket.emit('auth_error', 'Because fuck you thats why');
            
            // if this socket is already connected,
            // send a failed login message
            //redis_client.set(config.redis.prefix + "online_" + data.user_id, socket.id);

            if (_.findIndex(users, { socket: socket.id }) !== -1) {
                socket.emit('login_error', 'You are already connected.');
            }

            // if this name is already registered,
            // send a failed login message
            if (_.findIndex(users, { name: data.user_id }) !== -1) {
                socket.emit('login_error', 'This name already exists.');
                return; 
            }

            users.push({ 
                name: data.user_id,
                socket: socket.id
            });

            socket.emit('login_successful', _.map(users, 'name'));
            socket.broadcast.emit('online', data.user_id);

            console.log(data.user_id + ' logged in');
*/
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
                socket.broadcast.emit('offline', users[index].name);
                console.log(users[index].name + ' disconnected');

                users.splice(index, 1);
            }
        });
    });


};
