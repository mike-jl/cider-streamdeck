const coverAction = "io.lehenauer.apple-music-cider.action";
const likeAction = "io.lehenauer.apple-music-cider.like";
const playAction = "io.lehenauer.apple-music-cider.play";
const backwardAction = "io.lehenauer.apple-music-cider.backward";
const forwardAction = "io.lehenauer.apple-music-cider.forward";

const albumArtImage = new Image();
const defaultAlbumArt = document.getElementById("defaultAlbumArt");

const height = 150;
const width = 150;
const canvas = document.createElement("canvas");
canvas.width = width;
canvas.height = height;
const ctx = canvas.getContext('2d');

var websocket = null;
var pluginUUID = null;

var DestinationEnum = Object.freeze({ "HARDWARE_AND_SOFTWARE": 0, "HARDWARE_ONLY": 1, "SOFTWARE_ONLY": 2 })

var coverInstanceList = [];
var likeInstanceList = [];

var timer;
var timerDone = false;

function connectElgatoStreamDeckSocket(inPort, inPluginUUID, inRegisterEvent, inInfo) {
    pluginUUID = inPluginUUID

    // Open the web socket
    websocket = new WebSocket("ws://127.0.0.1:" + inPort);

    function registerPlugin(inPluginUUID) {
        var json = {
            "event": inRegisterEvent,
            "uuid": inPluginUUID
        };

        websocket.send(JSON.stringify(json));
    };

    websocket.onopen = function () {
        // WebSocket is connected, send message
        registerPlugin(pluginUUID);
    };

    websocket.onmessage = function (evt) {
        // Received message from Stream Deck
        var jsonObj = JSON.parse(evt.data);
        var event = jsonObj['event'];
        var action = jsonObj['action'];
        var context = jsonObj['context'];

        if (event == "keyDown") {
            var jsonPayload = jsonObj['payload'];
            var settings = jsonPayload['settings'];
            var coordinates = jsonPayload['coordinates'];
            var userDesiredState = jsonPayload['userDesiredState'];

            if (action === likeAction) {
                timer = setTimeout(() => {
                    timerDone = true;
                    getSetRating(-1);
                }, 500);
            }
        }
        else if (event == "keyUp") {
            var jsonPayload = jsonObj['payload'];
            var settings = jsonPayload['settings'];
            var coordinates = jsonPayload['coordinates'];
            var userDesiredState = jsonPayload['userDesiredState'];

            if (action === likeAction) {
                if (!timerDone) {
                    if ((song.rating === 1) || (song.rating === -1)) {
                        getSetRating(0);
                    }
                    else if (song.rating === 0) {
                        getSetRating(1);
                    }
                }
                clearTimeout(timer);
                timerDone = false;
            }
            else if (action === playAction) {
                var json = {
                    "action": "playpause"
                }
                ciderWebsocket.send(JSON.stringify(json));
            }
            else if (action === forwardAction) {
                var json = {
                    "action": "next"
                }
                ciderWebsocket.send(JSON.stringify(json));
            }
            else if (action === backwardAction) {
                var json = {
                    "action": "previous"
                }
                ciderWebsocket.send(JSON.stringify(json));
            }
            else if (action === coverAction) {
                changeCoverState();
            }
        }
        else if (event == "willAppear") {
            var jsonPayload = jsonObj['payload'];
            var settings = jsonPayload['settings'];
            var coordinates = jsonPayload['coordinates'];
            if (action == coverAction) {
                coverInstanceList.push(context);
            } else if (action == likeAction) {
                likeInstanceList.push(context);
            }
        }
        else if (event == "willDisappear") {
            removeInstace(coverInstanceList, context);
            removeInstace(likeInstanceList, context);
        }
    };

    websocket.onclose = function () {
        // Websocket is closed
    };

    connectCider();
};

var ciderConnected = false;
var ciderWebsocket = null;
function connectCider() {
    ciderWebsocket = new WebSocket("ws://127.0.0.1:26369");

    ciderWebsocket.onopen = function () {
        const interval = setInterval(checkRating, 2000);
        getCurrentMedia();
        ciderConnected = true;
    };

    ciderWebsocket.onmessage = function (evt) {
        var jsonObj = JSON.parse(evt.data);
        if (jsonObj.type === "playbackStateUpdate") {
            changeSong(jsonObj);
        }
        else if (jsonObj.type === "rate") {
            changeRating(jsonObj.data.rating);
            // console.log(jsonObj)
        }
    };

    ciderWebsocket.onclose = function () {
        ciderConnected = false;
        setTimeout(connectCider, 2000);
    };

    ciderWebsocket.onerror = function (err) {
        console.error('Socket encountered error: ', err.message, 'Closing socket');
        ciderWebsocket.close();
    };
}

function checkRating() {
    if (!ciderConnected) {
        return;
    }
    getSetRating();
}

function changeRating(newRating) {
    // console.log(newRating);
    if (song.rating === newRating) {
        return;
    }
    song.rating = newRating;
    var svg = document.getElementById("heartSvg");
    if (newRating === 0) {
        svg.setAttribute("fill", "none");
    }
    else if (newRating === 1) {
        svg.setAttribute("fill", "red");
    }
    else if (newRating === -1) {
        svg = document.getElementById("thumbsDownSvg");
    }

    var json = {
        "event": "setImage",
        "context": 0,
        "payload": {
            "image": "data:image/svg+xml;charset=utf8," + svg.outerHTML,
            "target": DestinationEnum.HARDWARE_AND_SOFTWARE
        }
    }
    for (const instance of likeInstanceList) {
        json.context = instance;
        websocket.send(JSON.stringify(json));
    }
}

function removeInstace(instaceList, context) {
    var index = instaceList.indexOf(context);
    if (index !== -1) {
        instaceList.splice(index, 1);
    }
}

function getSetRating(newRating) {
    var json = {
        "action": "rating",
        "type": "song",
        "id": song.id,
        "rating": newRating
    }
    ciderWebsocket.send(JSON.stringify(json));
}

function getCurrentMedia() {
    var json = {
        "action": "get-currentmediaitem"
    }
    ciderWebsocket.send(JSON.stringify(json));
}

var coverState = 0;
function changeCoverState(state) {
    if (state === undefined) {
        coverState++;
        if (coverState > 2) {
            coverState = 0;
        }
    }
    else {
        coverState = state;
    }

    switch (coverState) {
        case 0:
            changeCoverIcon(song.title);
            break;
        case 1:
            changeCoverIcon(song.artist);
            break;
        case 2:
            changeCoverIcon(song.album)
    }
}

const song = {
    title: "",
    artist: "",
    album: "",
    id: 0,
    rating: 0
};
function changeSong(jsonObj) {
    let newTitle = jsonObj.data.name;
    if (newTitle !== song.title) {
        song.title = newTitle;
        song.id = jsonObj.data.songId;
        song.artist = jsonObj.data.artistName;
        song.album = jsonObj.data.albumName;

        getSetRating();


        let artworkUrl = jsonObj.data.artwork.url;
        if (artworkUrl) {
            artworkUrl = jsonObj.data.artwork.url.replace('{w}', width).replace('{h}', height);

            albumArtImage.src = artworkUrl;
            changeCoverState(0);

        }
    }
}

function waitForImage(imgElem) {
    return new Promise((res, rej) => {
        if (imgElem.complete) {
            return res();
        }
        imgElem.onload = () => res();
        imgElem.onerror = () => rej(imgElem);
    });
}

async function changeCoverIcon(text) {
    ctx.clearRect(0, 0, width, height);
    await waitForImage(defaultAlbumArt);

    try {
        await waitForImage(albumArtImage);
        ctx.drawImage(albumArtImage, 0, 0);
    }
    catch (e) {
        ctx.drawImage(defaultAlbumArt, 0, 0);
    }

    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(0, 0, width, height);

    const fontSize = 30;
    const lineCount = 4;

    var lineDist = (height - (lineCount * fontSize)) / (lineCount + 1);
    const xDist = lineDist;

    x = xDist;
    y = fontSize + lineDist;
    ctx.font = '30px Sans-serif';
    ctx.strokeStyle = 'black';
    ctx.fillStyle = 'white';
    ctx.lineWidth = 3;

    lines = [];
    let i;
    let j;
    while (text.length) {
        //get number of chars that fit on display
        for (i = text.length; ctx.measureText(text.substr(0, i)).width > (width - (2 * xDist)); i--);

        // get the text
        result = text.substr(0, i).trim();;

        // check if there is a space in the text, otherwise just break in the word
        j = result.lastIndexOf(" ");

        if (j !== -1) {
            result = result.substr(0, j);
        }

        // push to result array and remove from string
        lines.push(result);
        text = text.substr(result.length, text.length).trim();
    }

    var lineOffset = (fontSize + lineDist);
    var lineStartOffset = 0;
    if (lines.length < lineCount) {
        const lineDiff = lineCount - lines.length;
        lineStartOffset = lineDiff * (lineOffset / 2);
    }
    for (i = 0; i < Math.min(lines.length, lineCount); i++) {
        ctx.strokeText(lines[i], x, y + (lineOffset * i) + lineStartOffset);
        ctx.fillText(lines[i], x, y + (lineOffset * i) + lineStartOffset);
    }

    let base64Canvas = canvas.toDataURL().split(';base64,')[1];
    base64Canvas = 'data:image/png;base64,' + base64Canvas;
    var json = {
        "event": "setImage",
        "context": 0,
        "payload": {
            "image": base64Canvas,
            "target": DestinationEnum.HARDWARE_AND_SOFTWARE
        }
    };

    for (const instance of coverInstanceList) {
        json.context = instance;
        websocket.send(JSON.stringify(json));
    }
}

function toDataURL(url, callback) {
    var xhr = new XMLHttpRequest();
    xhr.onload = function () {
        var reader = new FileReader();
        reader.onloadend = function () {
            callback(reader.result);
        }
        reader.readAsDataURL(xhr.response);
    };
    xhr.open('GET', url);
    xhr.responseType = 'blob';
    xhr.send();
}