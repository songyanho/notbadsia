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

	app.factory('tts', ['$rootScope', '$window', '$http', function($rootScope, $window, $http){
		var tts = {};
		tts.token = null;
		tts.talking = false;
		$http.get('/api/text-to-speech/token').success(function(response) {
			tts.token=response;
		});

		tts.sleep = function() {
			return new Promise(function(resolve, reject) {
				(function stalling(){
					if (tts.talking || tts.token == null) {
						setTimeout(stalling, 200);
					}
					else {
						return resolve();
					}
				})();
			});
		};
		tts.says = function(text, callback) {
			return new Promise(function(resolve, reject){
				tts.sleep().then(function() {
					tts.talking = true;
					var elem = WatsonSpeech.TextToSpeech.synthesize({token: tts.token, voice: 'en-US_AllisonVoice', text: text});
					elem.onended = function() {
						tts.talking = false;
						resolve();
					};
				});
			});

		};
		tts.isTalking = function() {
			return tts.talking;
		}
		return tts;
	}]);

	app.factory('mic', ['$rootScope', '$window', '$http', 'tts', function($rootScope, $window, $http, tts){
		var mic = {};
		mic.recognition = new webkitSpeechRecognition();
		mic.recognition.lang = 'en-US';
		mic.recognition.continuous = false;
		mic.recognition.interimResults = false;
		mic.recognition.maxAlternatives = 1;
		mic.listening = false;
		mic.listened = false;
		mic.status = null;
		mic.speechLength = 0;
		mic.output = [];
		mic.sleep = function sleep(ms) {
			return new Promise(resolve => setTimeout(resolve, ms));
		};
		mic.recognition.onstart = function() {
			mic.listened = false;
			mic.speechLength = 0;
			$window.siriWave.setAmplitude(1);
		};
		mic.recognition.onerror = function(event) {
			if (mic.listened) {
				mic.status = 'ended';
			}
			else {
	    		if (event.error == 'no-speech') {
					mic.status = 'no-speech';
				}
				if (event.error == 'audio-capture') {
					mic.status = 'permission';
				}
				if (event.error == 'not-allowed') {
					mic.status = 'permission';
				}
			}
			mic.listening = false;
			mic.listened = false;
		};
		mic.recognition.onend = function() {
			mic.status = 'ended';
			mic.listened = true;
			mic.listening = false;
			// mic.recognition.start();
			// console.log('again');
		};
		mic.recognition.onresult = function(event) {
			console.log(event);
			var interim_transcript = '';
			if (typeof(event.results) == 'undefined') {
				mic.recognition.onend = null;
				mic.recognition.stop();
				if (mic.speechLength) {
					mic.status = 'ended';
				}else{
					mic.status = 'no-speech';
				}
				return;
			}
			mic.speechLength += event.results.length;
			mic.output.push(event.results);
		};
		mic.isListening = function(continuous) {
			mic.recognition.continuous = continuous;
			mic.listening = true;
			mic.recognition.start();
			return new Promise(function(resolve, reject) {
				mic.startListening().then(function() {
					mic.listening = false;
					$window.siriWave.setAmplitude(0);
					$rootScope.$digest();
					console.log(mic.output);
					if (mic.output.length <= 0){
						mic.status = 'no-speech';
					}
					mic.output = [];
					if (mic.status == 'permission') {
						tts.says('I am so sorry that I could not hear you. ' +
								 'Please enable the micrphone and allow the ' +
								 'browser to access your microphone.').then(function() {
									 resolve(mic.status);
								 });
					}
					else {
						resolve(mic.status);
					}
				});
			});
		};
		mic.startListening = function() {
			return new Promise(function(resolve, reject) {
				(function stalling(){
					if (mic.listening) {
						setTimeout(stalling, 200);
					}
					else {
						return resolve();
					}
				})();
			});
		};
		return mic;
	}]);

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

	app.controller('QuestionnaireController', ['$location', '$http', '$rootScope','$scope', 'tts', 'mic', function($location, $http, $rootScope, $scope, tts, mic) {
		var qvc = this;
		qvc.lastqn = 0;
		qvc.ended = false;
		qvc.startQuestionnaire = false;
		// $scope.$on('cameraIsOn', function(event,data) {
		// 	$scope.$apply(function() {
		// 		if(!qvc.startQuestionnaire) {
		// 			// qvc.triggerQuestionnaire();
		// 		}
		// 	});
		// });
		this.kickstart = function() {
			tts.says('Hi, I am Jesslyn. I am H R Assistant from Singapore ' +
					 'Airlines. Before we carry on, I would like to inform you '+
					 'that this interview will be recorded. By starting the interview, '+
					 'you agree with our Privacy Policy and Terms and Conditions. ' +
					 'Says Start to begin the interview with me.')
					 .then(function() {
			 				var output = mic.isListening(false).then(function(output){
			 					if (output == 'no-speech') {
			 						qvc.kickstart();
			 					}
			 					else if (output == 'permission') {
			 						tts.says('Please check your settings and join this session again. Thank you.');
			 					}
			 					else if (output == 'ended') {
			 						$rootScope.$broadcast('startCamera',true);
			 						tts.says('Great!').then(qvc.triggerQuestionnaire);
			 					}
			 				});
			 			});
		};
		this.questionbank = [
			'Please introduce yourself.',
			'Why do you want to join Singapore Airlines',
			'Describe a place that you love',
			'Tell me your favourite fruit'
		];

		this.triggerQuestionnaire = function(){
			console.log('started 1');
			if (qvc.lastqn >= qvc.questionbank.length) {
				qvc.endInterview();
				return;
			}
			var ql = angular.element( document.querySelector('#questionlist'));
			var qn = qvc.questionbank[qvc.lastqn];
			ql.find('p').addClass('outFocus');
			ql.prepend('<p class="animated fadeInUp">' + qn + '</p>');
			qvc.lastqn += 1;
			qvc.startQuestionnaire = true;
			$scope.$digest();
			tts.says(qn).then(function(){
				mic.isListening(true).then(function(output){
					if (output == 'ended') {
						tts.says('I see.').then(qvc.triggerQuestionnaire);
					}
					else {
						qvc.lastqn -= 1;
						qvc.triggerQuestionnaire();
					}
				});
			});
		};

		this.endInterview = function() {
			qvc.ended = true;
			$scope.$digest();
			tts.says('That\'s all for the interview. Thank you for joining this session and we will notify shortlisted cndidates for next round of interview. Have a good day! ');
		};
		this.kickstart();
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
		localStream.video = angular.element(document.querySelector('#localVideo'));

		$scope.$on('cameraIsOn', function(event,data) {
			$scope.$apply(function() {
				localStream.cameraIsOn = data;
			});
		});

		$scope.$on('startCamera', function(event,data) {
			$scope.$apply(function() {
				localStream.toggleCam();
			});
		});

		localStream.toggleCam = function(){
			// localStream.video[0].src = './images/sample.mp4';
			// localStream.video[0].load();
			// localStream.video[0].play();
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
