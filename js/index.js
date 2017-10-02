"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
var events = require("events");
var http = require("http");
var url = require("url");
var _ = require("lodash");
;
var EmulatedApp = /** @class */ (function () {
    function EmulatedApp() {
        this._m = {};
    }
    EmulatedApp.prototype.get = function (key) { return this._m[key]; };
    EmulatedApp.prototype.set = function (key, value) { this._m[key] = value; };
    return EmulatedApp;
}());
var EmulatedRequest = /** @class */ (function (_super) {
    __extends(EmulatedRequest, _super);
    function EmulatedRequest(app) {
        var _this = _super.call(this) || this;
        _this.app = app;
        _this.headers = {};
        _this.query = {};
        return _this;
    }
    EmulatedRequest.prototype.__emitFinalEvents = function () {
        this.emit("close");
    };
    return EmulatedRequest;
}(events.EventEmitter));
var EmulatedResponse = /** @class */ (function (_super) {
    __extends(EmulatedResponse, _super);
    function EmulatedResponse(app) {
        var _this = _super.call(this) || this;
        _this.app = app;
        _this.finished = false;
        _this.__defaultEncoding = "utf8";
        _this.__body__ = "";
        _this.statusCode = 200;
        _this.__headers__ = {};
        _this.__headersSent__ = false;
        return _this;
    }
    EmulatedResponse.prototype.setDefaultEncoding = function (encoding) {
        this.__defaultEncoding = encoding;
    };
    EmulatedResponse.prototype.json = function (o) {
        this.set("content-type", "application/json; charset=utf-8");
        this.end(JSON.stringify(o));
    };
    EmulatedResponse.prototype.jsonp = function (o) { this.json(o); };
    EmulatedResponse.prototype.write = function (data, encoding) {
        var s = "";
        if (typeof data === "string")
            s = data;
        else
            s = data.toString(encoding ? encoding : this.__defaultEncoding);
        this.__body__ += s;
    };
    EmulatedResponse.prototype.send = function (data) {
        if (data) {
            if (typeof data === "string" || data.constructor === Buffer)
                this.write(data);
            else
                this.write(JSON.stringify(data));
        }
    };
    EmulatedResponse.prototype.end = function (data, encoding) {
        if (data)
            this.write(data, encoding);
        this.emit("__on_final__");
    };
    EmulatedResponse.prototype.status = function (code) {
        this.statusCode = code;
        return this;
    };
    Object.defineProperty(EmulatedResponse.prototype, "headersSent", {
        get: function () { return this.__headersSent__; },
        enumerable: true,
        configurable: true
    });
    EmulatedResponse.prototype.getHeader = function (name) { return this.__headers__[name.toLowerCase()]; };
    EmulatedResponse.prototype.removeHeader = function (name) { delete this.__headers__[name.toLowerCase()]; };
    EmulatedResponse.prototype.setHeader = function (name, value) { this.__headers__[name.toLowerCase()] = value; };
    EmulatedResponse.prototype.get = function (name) { return this.getHeader(name); };
    EmulatedResponse.prototype.set = function (field, value) {
        if (typeof field === "string")
            this.setHeader(field, value);
        else {
            var headers = field;
            for (var key in headers)
                this.setHeader(key, headers[key]);
        }
    };
    EmulatedResponse.prototype.writeHead = function (statusCode, statusMessage, headers) {
        this.statusCode = statusCode;
        if (statusMessage) {
            if (typeof statusMessage === "string") {
                this.statusMessage = statusMessage;
                if (headers)
                    this.set(headers);
            }
            else {
                var hdrs = statusMessage;
                this.set(hdrs);
            }
        }
    };
    EmulatedResponse.prototype.sendStatus = function (statusCode) {
        var s = (http.STATUS_CODES[statusCode] ? http.STATUS_CODES[statusCode] : statusCode.toString());
        this.status(statusCode).send(s);
    };
    EmulatedResponse.prototype.__emitFinalEvents = function () {
        this.emit("close");
        this.emit("finish");
    };
    return EmulatedResponse;
}(events.EventEmitter));
// returns true it HTTP returns a "good" status code, false otherwise
// the logic comes from jquery
function goodHTTPStatusCode(statusCode) {
    return ((statusCode >= 200 && statusCode < 300) || (statusCode === 304));
}
var ExpressJSONApiRoutingEmulation = /** @class */ (function () {
    function ExpressJSONApiRoutingEmulation(router, appParams) {
        this.router = router;
        this.appParams = appParams;
    }
    ExpressJSONApiRoutingEmulation.prototype.route = function (options) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            // constuct an emulated Application object
            //////////////////////////////////////////////////////////////////////////
            var app = new EmulatedApp();
            if (_this.appParams) {
                for (var key in _this.appParams)
                    app.set(key, _this.appParams[key]);
            }
            //////////////////////////////////////////////////////////////////////////
            // constuct an emulated Request object
            //////////////////////////////////////////////////////////////////////////
            var parsed = url.parse(options.path, true);
            var req = new EmulatedRequest(app);
            req.method = options.method;
            req.headers = (options.headers ? options.headers : {});
            if (options.body) {
                var content = {
                    "content-type": "application/json; charset=utf-8",
                    "content-length": Buffer.from(JSON.stringify(options.body), "utf-8").byteLength.toString()
                };
                req.headers = _.assignIn({}, req.headers, content);
            }
            req.query = parsed.query;
            req.url = options.path;
            req.body = (options.body ? options.body : null);
            req.path = parsed.pathname;
            req.hostname = "";
            //////////////////////////////////////////////////////////////////////////
            // constuct an emulated Response object
            //////////////////////////////////////////////////////////////////////////
            var res = new EmulatedResponse(app);
            var finalHandler = function () {
                req.__emitFinalEvents();
                res.__emitFinalEvents();
                if (res.finished) {
                    var body = res.__body__;
                    try {
                        body = JSON.parse(body ? body : "");
                    }
                    catch (e) { }
                    if (goodHTTPStatusCode(res.statusCode))
                        resolve({
                            status: res.statusCode,
                            statusText: res.statusMessage,
                            headers: res.__headers__,
                            data: body
                        });
                    else
                        reject(body);
                }
                else
                    reject({ error: "not-found", error_description: "Cannot " + req.method.toUpperCase() + " " + options.path });
            };
            res.on("__on_final__", function () {
                res.__headersSent__ = true; // mark headers sent
                res.finished = true; // mark response finished
                if (!res.statusMessage)
                    res.statusMessage = http.STATUS_CODES[res.statusCode]; // set the status message
                // set the content-length header
                if (res.__body__)
                    res.__headers__["content-length"] = Buffer.from(res.__body__, res.__defaultEncoding).byteLength.toString();
                finalHandler();
            });
            //////////////////////////////////////////////////////////////////////////
            _this.router(req, res, finalHandler); // route it           
        });
    };
    return ExpressJSONApiRoutingEmulation;
}());
exports.ExpressJSONApiRoutingEmulation = ExpressJSONApiRoutingEmulation;
//# sourceMappingURL=index.js.map