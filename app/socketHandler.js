var mkdirp = require('mkdirp');
var fs = require('fs');

var WriteToDisk = require('../app/writeRecordingToDisk.js');
var ConcatenateRecordings = require('../app/concatenateRecording.js');

var roomsDirs = {};

module.exports = function(io, streams) {
    io.on('connection', function(client) {
        console.log('-- ' + client.id + ' joined --');
        client.emit('id', client.id);

        client.on('message', function (details) {
            var otherClient = io.sockets.connected[details.to];

            if (!otherClient) {
                return;
            }
            delete details.to;
            details.from = client.id;
            otherClient.emit('message', details);
        });

        client.on('readyToStream', function(options) {
            console.log('-- ' + client.id + ' is ready to stream --');

            streams.addStream(client.id, options.name);
        });

        client.on('update', function(options) {
            streams.update(client.id, options.name);
        });

        function leave(data) {

            console.error('WTSHSHSHSHHSHS', data);
            onRecordingStopped(data['userId']);
            console.log('-- ' + client.id + ' left --');
            streams.removeStream(client.id);
        }

        client.on('disconnect', leave);
        client.on('leave', leave);

        var params = client.handshake.query;

        // FUNCTION used to create room-directory
        function createNewDir(path, data, onGettingRecordedMessages, callback) {
            mkdirp(path, function(err) {
                if (err) {
                    return setTimeout(createNewDir, 1000);
                }
                onGettingRecordedMessages(data, callback);
            });
        }

        function onGettingRecordedMessages(data, callback) {
            var file = JSON.parse(data);

            io.roomId = file.roomId;
            io.userId = file.userId;

            if (!roomsDirs[file.roomId]) {
                roomsDirs[file.roomId] = {
                    usersIndexed: {}
                };

                if (!fs.existsSync('./uploads/' + file.roomId)) {
                    createNewDir('./uploads/' + file.roomId, data, onGettingRecordedMessages, callback);
                    return;
                }

                onGettingRecordedMessages(data, callback);
                return;
            }

            if (!roomsDirs[file.roomId].usersIndexed[file.userId]) {
                roomsDirs[file.roomId].usersIndexed[file.userId] = {
                    interval: file.interval,
                    fileName: file.fileName
                };
            }

            roomsDirs[file.roomId].usersIndexed[file.userId].interval = file.interval;

            console.log('writing file do disk', file.interval);

            WriteToDisk(file, client);

            callback();
        }

        client.on('recording-message', onGettingRecordedMessages);
        client.on('stream-stopped', onRecordingStopped);
        client.on('disconnect', onRecordingStopped);

        function onRecordingStopped(userId) {
            var roomId = 'room-'+userId;
            userId = 'user-'+userId;

            if (!roomId || !userId) return;

            console.log('onRecordingStopped');

            if (!roomsDirs[roomId] || !roomsDirs[roomId].usersIndexed[userId]) {
                console.log('skipped', roomId, userId);
                return;
            }

            var user = roomsDirs[roomId].usersIndexed[userId];

            ConcatenateRecordings({
                fileName: user.fileName,
                lastIndex: user.interval + 1,
                roomId: roomId,
                userId: userId,
                interval: user.interval
            }, client);

            if (!!roomsDirs[roomId] && !!roomsDirs[roomId].usersIndexed[userId]) {
                delete roomsDirs[roomId].usersIndexed[userId];
            }

            if (!!roomsDirs[roomId] && Object.keys(roomsDirs[roomId].usersIndexed).length <= 1) {
                delete roomsDirs[roomId];
            }
        }
    });
};
