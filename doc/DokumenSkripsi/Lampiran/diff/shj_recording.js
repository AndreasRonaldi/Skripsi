/**
 * SharIF Judge
 * @file shj_recording.js
 * author: Andreas Ronaldi <andreasronaldi25@gmail.com>
 *
 *     Javascript codes for "Recording" page
 */

$(document).ready(() => {
	// ######################################################
	// ############           Variable           ############
	// ######################################################
	const editor = ace.edit("code_editor");
	const Range = ace.Range;

	let funcTimeoutRecording = null;
	let funcIntervalTimer = null;

	let curChart = null;
	let isRecPlaying = false;

	let confTimer = {
		delay: 1,
	};

	let confChart = {
		type: "bar",
		autoDivider: 20, // How many section does the auto divider will giveout (default: 10)
		divider: 1,
		time: "s",
		stack: true,
	};

	let confPlayer = {
		durationNext: 500, // in ms
		mergeDuration: 0, // if time difference smaller than value, then merge the events
	};

	editor.setOptions({
		theme: "ace/theme/monokai",
		fontSize: "11pt",
		readOnly: true,
		enableLiveAutocompletion: true,
		enableBasicAutocompletion: true,
		enableSnippets: true,
	});

	// Object for playing record
	const recording = {
		events: {}, // Map -> time events to list of events
		eventsIndex: {}, // Map -> index to time events
		indexEvents: {}, // Map -> time events to index
		presumIndexDuration: {}, // Map -> index to duration before timestart event
		length: -1, // Length of list of saved events
		curEvents: -1, // Currently selected index
		duration: 0, // Duration of events
		save_state: [], // Saved state to use in playback

		reset: () => {
			recording.events = {};
			recording.eventsIndex = {};
			recording.indexEvents = {};
			recording.presumIndexDuration = {};
			recording.length = -1;
			recording.curEvents = -1;
			recording.duration = 0;
			recording.save_state = [];
		},
	};

	const handlersIncludeInGoState = {
		insert: true,
		remove: true,
		cursor_selection: true,
		sel_selection: true,
		focus: false,
		blur: false,
		visibility: false,
		pdf_focus: false,
		pdf_blur: false,
		input_change: true,
		output_change: true,
		save: false,
		submit: false,
		execute: false,
	};

	const handlers = {
		insert: (args) => {
			editor.session.replace(
				new ace.Range(
					args.start.row,
					args.start.column,
					args.start.row,
					args.start.column
				),
				args.data.join("\n")
			);
		},
		remove: (args) => {
			editor.session.remove({ start: args.start, end: args.end });
		},
		cursor_selection: (args) => {
			setSelection(editor, args);
		},
		sel_selection: (args) => {
			setSelection(editor, args);
		},
		focus: (args) => {
			setStatus("User is focus now");
			setTitle("User is focus now");
		},
		blur: (args) => {
			setStatus("User is not focus on website now");
			setTitle("User is not focus on website now");
		},
		visibility: (args) => {
			if (args) {
				setStatus("Open SharIF-Judge");
				setTitle("User is on SharIF-Judge now");
			} else {
				setStatus("Switching tabs");
				setTitle("User is on other tabs now");
			}
		},
		pdf_focus: (args) => {
			setStatus("User is focus on pdf viewer now");
			setTitle("User is focus on pdf viewer now");
		},
		pdf_blur: (args) => {
			setStatus("User is not focus on pdf viewer now");
			setTitle("User is not focus on pdf viewer now");
		},
		input_change: (args) => $("#editor_input").val(args),
		output_change: (args) => $("#editor_output").val(args),
		save: (args) => {
			setStatus("User just saved");
			setTitle("User just saved");
		},
		submit: (args) => {
			setStatus("User just submit!");
			setTitle("User just submit!");
		},
		execute: (args) => {
			setStatus("User is running the program.");
			setTitle("User is running the program.");
		},
	};

	const mult = {
		s: 1000,
		m: 1000 * 60,
		h: 1000 * 60 * 60,
		d: 1000 * 60 * 60 * 24,
		w: 1000 * 60 * 60 * 24 * 7,
		y: 1000 * 60 * 60 * 24 * 7 * 365.25,
	};

	const nameInChart = {
		insert: "Insert",
		remove: "Remove",
		cursor_selection: "Cursor Change",
		sel_selection: "Selection Change",
		focus: "Focus tabs",
		blur: "Unfocus tabs",
		visibility: "Change tabs",
		pdf_focus: "Focus PDF Viewer",
		pdf_blur: "Unfocus PDF Viewer",
		input_change: "Change Input",
		output_change: "Change Output",
		save: "Save",
		submit: "Submit",
		execute: "Execute",
	};

	// ######################################################
	// ############          Main Method         ############
	// ######################################################

	const getRecording = () => {
		setTitle("Loading...");
		setLoading(true);
		disabledInput(true);
		recording.reset();
		emptyEditor();

		$.ajax({
			type: "GET",
			url: shj.site_url + "recording/download_record/" + rec_path,
			cache: false,
			success: (data) => {
				recording.events = data;

				$("select#rec_selection").empty();

				recording.length = 0;

				Object.keys(data).forEach((c, i, a) => {
					// Push to table of saved
					$(`<tr>
							<td>${convTimeToEpoch(c)}</td>
							<td>${convTimeToEpoch(parseInt(c) + data[c][data[c].length - 1].time)}</td>
							<td id="sel_${c}" class="sel_recording">
								Select
							</td>
					</tr>`).appendTo("tbody#tbody_saved");

					$(`#sel_${c}`).click(() => {
						playOrStop(true);
						setValueTimer(recording.presumIndexDuration[i]);
						setSelectedSaveTime(c);
					});

					recording.eventsIndex[c] = i;
					recording.indexEvents[i] = c;
					recording.presumIndexDuration[i] = recording.duration;
					recording.length++;

					recording.duration += data[c][data[c].length - 1].time;

					if (recording.curEvents === -1) {
						recording.curEvents = c;
					}

					recording.duration += confPlayer.durationNext;
				});

				$(`#range_player`).attr("max", recording.duration);
				$(`#sel_${recording.curEvents}`).text("Selected");
				$(`#sel_${recording.curEvents}`).addClass("sel_selected");
				disabledInput(false);
				setTitle("Ready!");
				setLoading(false);
				setStatus("Ready!");
				setSelectedSaveTime(recording.curEvents);
			},
			error: function (error) {
				console.error(error);
				setTitle("Error")
			},
		});
	};

	const playOrStop = (stopRec = isRecPlaying) => {
		if (stopRec) {
			// if recording is playing -> stop
			stop();
			$("#rec_btn").text("Play");
		} else {
			// if recording is not played -> played in the time in input.
			play($(`#range_player`).val());
			$("#rec_btn").text("Stop");
		}

		isRecPlaying = !stopRec;
	};

	const play = (time = 0) => {
		emptyEditor();

		let left = 0;
		let right = recording.length - 1;
		let eventIndex = 0;

		// lower bound
		while (left <= right) {
			let middle = left + Math.floor((right - left) / 2);

			if (recording.presumIndexDuration[middle] > time) {
				right = middle - 1;
			} else {
				eventIndex = middle;
				left = middle + 1;
			}
		}

		eventIndex = recording.indexEvents[eventIndex];
		setSelectedSaveTime(eventIndex);

		let timeEvent =
			time - recording.presumIndexDuration[recording.eventsIndex[eventIndex]];
		let events = recording.events[eventIndex];
		left = 0;
		right = events.length - 1;
		let eventsIndex = events.length - 1;

		// upper bound
		while (left <= right) {
			let middle = left + Math.floor((right - left) / 2);

			if (events[middle].time < timeEvent) {
				left = middle + 1;
			} else {
				eventsIndex = middle;
				right = middle - 1;
			}
		}

		while (
			eventsIndex > 0 &&
			events[eventsIndex].time - events[eventsIndex - 1].time <=
				confPlayer.mergeDuration
		) {
			eventsIndex--;
		}

		handlerForLast = {};

		// from index 0 of selected save time to eventsIndex, run all insert and remove
		for (let index = 0; index < eventsIndex; index++) {
			const event = events[index];
			if (handlersIncludeInGoState[event.event]) {
				handlers[event.event](event.args);
			} else if (events[eventsIndex] - event.time <= confPlayer.mergeDuration) {
				handlerForLast[event.event] = () => handlers[event.event](event.args);
			}
		}

		// Run all handler that set to false the last handler that the event is
		Object.values(handlerForLast).forEach((f) => {
			f();
		});

		startTimer();

		// Start after time to eventsIndex
		if (events[eventsIndex].time < timeEvent)
			funcTimeoutRecording = setTimeout(() => {
				startRecording(eventsIndex);
			}, timeEvent - events[eventsIndex].time);
		else
			funcTimeoutRecording = setTimeout(() => {
				startRecording(eventsIndex);
			}, events[eventsIndex].time - timeEvent);
	};

	// Methods for plays
	const startRecording = (index) => {
		let events = recording.events[recording.curEvents];
		if (index >= events.length) {
			if (playNextRecording()) {
				setStatus("Playing Next Session");
				setTitle("Playing Next Session");
				return;
			} else {
				funcTimeoutRecording = setTimeout(() => {
					setStatus("Finish...");
					setTitle("Finish...");
					playOrStop(true);
				}, confPlayer.durationNext);
				return;
			}
		}

		let event = events[index];
		let timeDiff =
			(index + 1 < events.length
				? events[index + 1].time
				: events[index].time) - event.time;

		handlers[event.event](event.args);

		while (index + 1 < events.length && timeDiff <= confPlayer.mergeDuration) {
			index++;
			event = events[index];
			timeDiff = events[index + 1].time - event.time;
			handlers[event.event](event.args);
		}

		funcTimeoutRecording = setTimeout(() => {
			startRecording(index + 1);
		}, timeDiff);
	};

	const startTimer = () => {
		let offset = 0;

		function delta() {
			var now = Date.now(),
				d = now - offset;

			offset = now;
			return d;
		}

		const update = () => {
			let val = parseInt($(`#range_player`).val());
			val += delta();
			$(`#range_player`).val(val);
			updateTimerRange();
		};

		if (!funcIntervalTimer) {
			offset = Date.now();
			funcIntervalTimer = setInterval(update, confTimer.delay);
		}
	};

	const playNextRecording = () => {
		if (recording.eventsIndex[recording.curEvents] < recording.length - 1) {
			setSelectedSaveTime(
				recording.indexEvents[recording.eventsIndex[recording.curEvents] + 1],
				false
			);

			funcTimeoutRecording = setTimeout(() => {
				emptyEditor();

				funcTimeoutRecording = setTimeout(() => {
					startRecording(0);
				}, recording.events[recording.curEvents][0].time);
			}, confPlayer.durationNext);

			return true;
		}
		funcTimeoutRecording = setTimeout(() => {}, confPlayer.durationNext);
		return false;
	};

	const stop = () => {
		stopTimer();
		stopRecording();
	};

	// Methods for stop
	const stopTimer = () => {
		clearTimeout(funcIntervalTimer);
		funcIntervalTimer = null;
	};

	const stopRecording = () => {
		clearTimeout(funcTimeoutRecording);
		funcTimeoutRecording = null;
	};

	// ######################################################
	// ############         Chart Method         ############
	// ######################################################

	const setUpChart = (
		index = recording.curEvents,
		type = confChart.type ? confChart.type : "bar",
		divider = confChart.divider ? confChart.divider : 1,
		time = confChart.time ? confChart.time : "s",
		stack = confChart.stack != undefined ? confChart.stack : true,
		step = confChart.step != undefined ? confChart.step : false,
		fill = confChart.fill != undefined ? confChart.fill : false
	) => {
		if (curChart != null) curChart.destroy();

		let times = calcTimeForChart(recording.events[index], divider, time);
		let data = formatToChartData(recording.events[index], times);

		const ctx = document.getElementById("recording_chart");

		const dataChart = {
			labels: times.map((c) => c.time),
			datasets: Object.entries(data).map(([k, v]) => {
				return {
					label: nameInChart[k],
					data: v,
					fill: fill,
					stepped: step,
				};
			}),
		};

		const configChart = {
			type: type,
			options: {
				scales: {
					x: {
						stacked: stack,
					},
					y: {
						stacked: stack,
					},
				},
			},
		};

		const chart = new Chart(ctx, {
			...configChart,
			data: dataChart,
		});

		curChart = chart;
		return chart;
	};

	const formatToChartData = (arrEvent, arrTimes) => {
		let res = {};

		let idxTimes = 0;

		arrEvent.forEach((e) => {
			while (e.time > arrTimes[idxTimes].ms) {
				idxTimes++;
			}

			if (!res[e.event]) {
				res[e.event] = {};
			}

			if (!res[e.event][arrTimes[idxTimes].time]) {
				res[e.event][arrTimes[idxTimes].time] = 0;
			}

			res[e.event][arrTimes[idxTimes].time]++;
		});

		return res;
	};

	const calcTimeForChart = (arrEvent, divider, time) => {
		let res = [];

		let dev = calcTimeToMilliSec(divider, time);
		let max = arrEvent[arrEvent.length - 1].time;
		let i = 1;

		for (; dev * i < max; i++) {
			res.push({
				time: Math.floor(divider * i * 100) / 100 + time,
				ms: dev * i,
			});
		}

		res.push({
			time: Math.floor(divider * i * 100) / 100 + time,
			ms: dev * i,
		});

		return res;
	};

	const calcTimeToMilliSec = (divider, time) => {
		if (mult[time]) {
			return divider * mult[time];
		}

		return divider;
	};

	// ######################################################
	// ##########        Set Up Config Chart       ##########
	// ######################################################

	const setUpTimeDividerSelector = (selectID) => {
		Object.keys(mult).forEach((c) => {
			$(`
				<option value="${c}">
					${c}
				</option>
			`).appendTo(`#${selectID}`);
		});
	};

	// ######################################################
	// ##########       Listener Config Chart      ##########
	// ######################################################

	$("#config_chart_type").on("change", (e) => {
		let val = $("#config_chart_type").val();
		confChart.type = val;
		setUpChart();
	});

	$("#config_chart_stack").on("click", (e) => {
		let val = $("#config_chart_stack").prop("checked");
		confChart.stack = val;
		setUpChart();
	});

	$("#config_chart_divider").on("input", (e) => {
		let val = $("#config_chart_divider").val();
		if (val > 0) {
			confChart.divider = val;
			setUpChart();
		}
	});

	$("#config_chart_time").on("change", (e) => {
		let val = $("#config_chart_time").val();
		confChart.time = val;
		setUpChart();
	});

	// ######################################################
	// ############           Listener           ############
	// ######################################################

	$("#rec_btn").click(() => {
		playOrStop();
	});

	$("#range_player").on("mousemove", function () {
		updateTimerRange();
	});

	$("#range_player").on("change", function () {
		let isPlaying = isRecPlaying;
		if (isPlaying) playOrStop(true);
		updateTimerRange();
		if (isPlaying) playOrStop(false);
	});

	// ######################################################
	// ############          Misc Method         ############
	// ######################################################

	function setSelection(editor, data) {
		let x = data;
		let start = { row: x[0], column: x[1] };
		let end = x.length == 2 ? start : { row: x[2], column: x[3] };
		let isBackwards = Range.comparePoints(start, end) > 0;
		editor.selection.fromJSON(
			isBackwards
				? {
						start: end,
						end: start,
						isBackwards: true,
				  }
				: {
						start: start,
						end: end,
						isBackwards: true,
				  }
		);
	}

	const emptyEditor = () => {
		editor.session.setValue("", -1);
	};

	const disabledInput = (bool) => {
		$("#rec_play").prop("disabled", bool);
		$("#rec_stop").prop("disabled", bool);
	};

	// Convert Timestamp to Epoch
	const convTimeToEpoch = (timestamp) => {
		var date = new Date(parseInt(timestamp));

		var year = date.getFullYear();
		var month = date.getMonth() + 1;
		var day = date.getDate();
		var hours = date.getHours();
		var minutes = date.getMinutes();
		var seconds = date.getSeconds();

		return (
			year +
			"-" +
			month +
			"-" +
			day +
			" " +
			(hours < 10 ? "0" : "") +
			hours +
			":" +
			(minutes < 10 ? "0" : "") +
			minutes +
			":" +
			(seconds < 10 ? "0" : "") +
			seconds
		);
	};

	const convTimeToHHMMSS = (ms, showZero = true, showMS = false) => {
		console.log(ms);

		let seconds = ms / 1000;
		const hours = parseInt(seconds / 3600).toFixed(0);
		seconds = seconds % 3600;
		const minutes = parseInt(seconds / 60).toFixed(0);
		seconds = (seconds % 60).toFixed(0);
		const sec = parseInt(seconds / 60).toFixed(0);
		ms = (seconds % 60).toFixed(0);

		console.log(ms, hours, minutes, sec);

		return (
			(hours > 0 ? (hours < 10 ? "0" : "") + hours + ":" : "") +
			(showZero || minutes > 0
				? (minutes < 10 ? "0" : "") + minutes + ":"
				: "") +
			(seconds < 10 ? "0" : "") +
			seconds +
			(showMS ? ms : "")
		);
	};

	const setTitle = (title) => {
		$("#status_rec").text(title);
	};

	const setSelectedSaveTime = (time, stop = true) => {
		if (stop) playOrStop(true);
		$(`#sel_${recording.curEvents}`).text("Select");
		$(`#sel_${recording.curEvents}`).removeClass("sel_selected");

		recording.curEvents = time;
		$(`#sel_${time}`).text("Selected");
		$(`#sel_${time}`).addClass("sel_selected");

		let duration =
			recording.events[time][recording.events[time].length - 1].time;

		let divider = (duration / confChart.autoDivider / 1000).toFixed(2);
		let times = "s";

		$(`#config_chart_divider`).val(divider);
		$(`#config_chart_time`).val(times);

		setUpChart(time, confChart.type, divider, times);
	};

	const setStatus = (text = "...") => {
		const status = $("#status_wrapper");

		status.show();
		status.text(text);

		setTimeout(() => {
			status.hide();
		}, 1000);
	};

	const setLoading = (bool) => {
		const mainEle = $("#recording_wrap");

		if (bool) {
			mainEle.hide();
		} else {
			mainEle.show();
		}
	};

	const setValueTimer = (value) => {
		$(`#range_player`).val(value);
		updateTimerRange();
	};

	const updateTimerRange = (
		idRange = "#range_player",
		idSpan = `#timer_player`
	) => {
		const val = ($(idRange).val() / recording.duration) * 100;
		const ms = $(idRange).val();

		$(idSpan).text(convTimeToHHMMSS(ms));

		$(idRange).css(
			"background",
			"linear-gradient(to right, #cc181e 0%, #cc181e " +
				val +
				"%, #444 " +
				val +
				"%, #444 100%)"
		);
	};

	// ######################################################
	// ############            Runner            ############
	// ######################################################

	getRecording();

	// Runner Config
	setUpTimeDividerSelector("config_chart_time");
});
