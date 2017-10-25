(function(){
	var app = angular.module('projectRtc', [],
		function($locationProvider){$locationProvider.html5Mode(true);}
	);
	var client = new PeerManager();
	var mediaConfig = {
		audio:true,
		video: {
			mandatory: {
				minWidth: 1280,
				minHeight: 720
			},
			optional: []
		}
	};

	app.factory('camera', ['$rootScope', '$window', function($rootScope, $window){
		var camera = {};
		camera.preview = $window.document.getElementById('localVideo');
		camera.userId = '';

		camera.start = function(){
			return requestUserMedia(mediaConfig)
			.then(function(stream){
				attachMediaStream(camera.preview, stream);
				client.setLocalStream(stream);
				camera.stream = stream;
				$rootScope.$broadcast('cameraIsOn',true);

				var randomString = (Math.random() * 1000).toString().replace('.', '');
				camera.userId = randomString
				RecorderHelper.StartRecording({
		            MediaStream: stream,
		            Socket: client.getSocket(),
		            FileName: randomString,
		            roomId: 'room-' + randomString,
		            userId: 'user-' + randomString,
		            UploadInterval: 300 * 1000
		        });
			})
			.catch(Error('Failed to get access to local media.'));
		};
		camera.stop = function(){
			return new Promise(function(resolve, reject){
				try {
					//camera.stream.stop() no longer works
					RecorderHelper.StopRecording();
					camera.preview.src = '';
					camera.stream.getTracks()[0].stop();
					// for( var track in camera.stream.getTracks() ){
					// 	track.stop();
					// }
					resolve();
				} catch(error) {
					reject(error);
				}
			})
			.then(function(result){
				$rootScope.$broadcast('cameraIsOn',false);
			});
		};
		return camera;
	}]);

	app.controller('QuestionnaireController', ['$location', '$http', '$scope', function($location, $http, $scope) {
		var qvc = this;
		this.lastqn = 0;
		this.startQuestionnaire = false;
		$scope.$on('cameraIsOn', function(event,data) {
			$scope.$apply(function() {
				if(!qvc.startQuestionnaire) {
					qvc.triggerQuestionnaire();
				}
			});
		});

		this.questionbank = [
			'Please introduce yourself.'
		];

		this.triggerQuestionnaire = function(){
			var ql = angular.element( document.querySelector('#questionlist'));
			qvc.lastqn += 1;
			ql.append('<p class="animated fadeInUp">' + qvc.questionbank[qvc.lastqn - 1] + '</p>');
		};
	}]);

	// app.controller('RemoteStreamsController', ['camera', '$location', '$http', function(camera, $location, $http){
	// 	var rtc = this;
	// 	rtc.remoteStreams = [];
	// 	function getStreamById(id) {
	// 		for(var i=0; i<rtc.remoteStreams.length;i++) {
	// 			if (rtc.remoteStreams[i].id === id) {return rtc.remoteStreams[i];}
	// 		}
	// 	}
	// 	rtc.loadData = function () {
	// 		// get list of streams from the server
	// 		$http.get('/streams.json').success(function(data){
	// 			// filter own stream
	// 			var streams = data.filter(function(stream) {
	// 				return stream.id != client.getId();
	// 			});
	// 			// get former state
	// 			for(var i=0; i<streams.length;i++) {
	// 				var stream = getStreamById(streams[i].id);
	// 				streams[i].isPlaying = (!!stream) ? stream.isPLaying : false;
	// 			}
	// 			// save new streams
	// 			rtc.remoteStreams = streams;
	// 		});
	// 	};
	//
	// 	rtc.view = function(stream){
	// 		client.peerInit(stream.id);
	// 		stream.isPlaying = !stream.isPlaying;
	// 	};
	// 	rtc.call = function(stream){
	// 		/* If json isn't loaded yet, construct a new stream
	// 		* This happens when you load <serverUrl>/<socketId> :
	// 		* it calls socketId immediatly.
	// 		**/
	// 		if(!stream.id){
	// 			stream = {id: stream, isPlaying: false};
	// 			rtc.remoteStreams.push(stream);
	// 		}
	// 		if(camera.isOn){
	// 			client.toggleLocalStream(stream.id);
	// 			if(stream.isPlaying){
	// 				client.peerRenegociate(stream.id);
	// 			} else {
	// 				client.peerInit(stream.id);
	// 			}
	// 			stream.isPlaying = !stream.isPlaying;
	// 		} else {
	// 			camera.start()
	// 			.then(function(result) {
	// 				client.toggleLocalStream(stream.id);
	// 				if(stream.isPlaying){
	// 					client.peerRenegociate(stream.id);
	// 				} else {
	// 					client.peerInit(stream.id);
	// 				}
	// 				stream.isPlaying = !stream.isPlaying;
	// 			})
	// 			.catch(function(err) {
	// 				console.log(err);
	// 			});
	// 		}
	// 	};
	//
	// 	//initial load
	// 	rtc.loadData();
	// 	if($location.url() != '/'){
	// 		rtc.call($location.url().slice(1));
	// 	};
	// }]);

	app.controller('LocalStreamController',['camera', '$scope', '$window', function(camera, $scope, $window){
		var localStream = this;
		localStream.name = 'Guest';
		localStream.link = '';
		localStream.cameraIsOn = false;

		$scope.$on('cameraIsOn', function(event,data) {
			$scope.$apply(function() {
				localStream.cameraIsOn = data;
			});
		});

		localStream.toggleCam = function(){
			if(localStream.cameraIsOn){
				camera.stop()
				.then(function(result){
					client.send('leave', {userId: camera.userId});
					// client.send('stream-stopped');
					client.setLocalStream(null);
				})
				.catch(function(err) {
					console.log(err);
				});
			} else {
				camera.start()
				.then(function(result) {
					localStream.link = $window.location.host + '/' + client.getId();
					client.send('readyToStream', { name: localStream.name });
				})
				.catch(function(err) {
					console.log(err);
				});
			}
		};
	}]);
	})();
