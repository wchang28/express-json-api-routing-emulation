"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics(d, b);
    }
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
var etag = require("etag");
;
var EmulatedApplication = /** @class */ (function () {
    function EmulatedApplication() {
        this._m = {
            "env": (process.env["NODE_ENV"] ? process.env["NODE_ENV"] : "development"),
            "etag": "weak",
            "jsonp callback name": "callback",
            "x-powered-by": true
        };
    }
    EmulatedApplication.prototype.get = function (key) { return this._m[key]; };
    EmulatedApplication.prototype.set = function (key, value) { this._m[key] = value; };
    return EmulatedApplication;
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
    function EmulatedResponse(app, req) {
        var _this = _super.call(this) || this;
        _this.app = app;
        _this.req = req;
        _this.finished = false;
        _this.__defaultEncoding = "utf8";
        _this.__body__ = "";
        _this.sendDate = true;
        _this.statusCode = 200;
        _this.__headers__ = {};
        if (_this.app.get("x-powered-by"))
            _this.__headers__["x-powered-by"] = "Express";
        _this.__headers__["x-content-type-options"] = "nosniff";
        _this.__headersSent__ = false;
        return _this;
    }
    EmulatedResponse.prototype.setDefaultEncoding = function (encoding) {
        this.__defaultEncoding = encoding;
    };
    EmulatedResponse.prototype.stringify = function (o) { return JSON.stringify(o, this.app.get("json replacer"), this.app.get("json spaces")); };
    EmulatedResponse.prototype.json = function (o) {
        this.set("content-type", "application/json; charset=utf-8");
        this.end(this.stringify(o));
    };
    EmulatedResponse.prototype.jsonp = function (o) {
        var cbQueryKey = this.app.get("jsonp callback name");
        if (cbQueryKey && this.req.query && this.req.query[cbQueryKey]) {
            var callback = this.req.query[cbQueryKey];
            var s = "/**/ typeof " + callback + " === 'function' && " + callback + "(" + this.stringify(o) + ");";
            this.set("content-type", "text/javascript; charset=utf-8");
            this.end(s);
        }
        else
            this.json(o);
    };
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
                this.write(this.stringify(data));
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
            else { // statusMessage is actually headers
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
    ExpressJSONApiRoutingEmulation.prototype.route = function (options, context) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            // constuct an emulated Application object
            ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
            var app = new EmulatedApplication();
            if (_this.appParams) {
                for (var key in _this.appParams)
                    app.set(key, _this.appParams[key]);
            }
            ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
            // constuct an emulated Request object
            ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
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
            if (context)
                req.context = context;
            ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
            // constuct an emulated Response object
            ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
            var res = new EmulatedResponse(app, req);
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
                // set the status message
                if (!res.statusMessage)
                    res.statusMessage = http.STATUS_CODES[res.statusCode];
                // set the "Content-Length" header field
                if (res.__body__)
                    res.__headers__["content-length"] = Buffer.from(res.__body__, res.__defaultEncoding).byteLength.toString();
                // set the "ETag" header field if it not already set
                ///////////////////////////////////////////////////////////////////////////////////////////////////////////
                if (!res.__headers__["etag"] && res.__body__) { // etag not set yet
                    var etagFlag = app.get("etag");
                    var tag = null;
                    if (typeof etagFlag === "boolean") {
                        if (etagFlag)
                            tag = etag(res.__body__, { weak: true });
                    }
                    else if (typeof etagFlag === "string") {
                        if (etagFlag.toLowerCase() === "weak")
                            tag = etag(res.__body__, { weak: true });
                        else if (etagFlag.toLowerCase() === "strong")
                            tag = etag(res.__body__, { weak: false });
                    }
                    else if (typeof etagFlag === "function") {
                        var generator = etagFlag;
                        tag = generator(Buffer.from(res.__body__, res.__defaultEncoding), res.__defaultEncoding);
                    }
                    if (tag)
                        res.__headers__["etag"] = tag;
                }
                ///////////////////////////////////////////////////////////////////////////////////////////////////////////
                // set the "Date" header field
                if (res.sendDate)
                    res.__headers__["date"] = new Date().toUTCString();
                res.__headersSent__ = true; // mark headers sent
                res.finished = true; // mark response finished
                finalHandler();
            });
            ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
            _this.router(req, res, finalHandler); // route it           
        });
    };
    return ExpressJSONApiRoutingEmulation;
}());
exports.ExpressJSONApiRoutingEmulation = ExpressJSONApiRoutingEmulation;
//# sourceMappingURL=index.js.map