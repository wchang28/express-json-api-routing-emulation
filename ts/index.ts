import * as express from 'express';
import * as events from "events";
import * as http from "http";
import * as url from "url";
import * as _ from "lodash";
import * as etag from "etag";
import {RESTReturn} from "rest-api-interfaces";
export {RESTReturn} from "rest-api-interfaces";

export interface JSONApiRequestOptions {
    method: string;
    path: string;
    headers?: {[key: string]: string}
    body?: any;
};

class EmulatedApplication {
    private _m: {[key: string]: any}
    constructor() {
        this._m = {
            "env": (process.env["NODE_ENV"] ? process.env["NODE_ENV"] : "development")
            ,"etag": "weak"
            ,"jsonp callback name": "callback"
            ,"x-powered-by": true
        };
    }
    get(key: string) : any {return this._m[key];}
    set(key: string, value: any) {this._m[key] = value;}
}

class EmulatedRequest extends events.EventEmitter {
    public method: string;
    public headers: {[key: string]: string};
    public url: string;
    public body: any;
    public query: {[key: string]: string};
    public baseUrl: string;
    public originalUrl: string;
    public params: any;
    public path: string;
    public hostname: string;
    public context: any
    constructor(public app: EmulatedApplication) {
        super();
        this.headers = {};
        this.query = {};
    }
    __emitFinalEvents() {
        this.emit("close");
    }
}

class EmulatedResponse extends events.EventEmitter {
    public finished: boolean;
    public __defaultEncoding: string;
    public __body__: string;
    public sendDate: boolean;
    public statusCode: number;
    public statusMessage: string;
    public __headers__: {[key: string]: string};
    public __headersSent__: boolean;
    constructor(public app: EmulatedApplication, private req: EmulatedRequest) {
        super();
        this.finished = false;
        this.__defaultEncoding = "utf8";
        this.__body__ = "";
        this.sendDate = true;
        this.statusCode = 200;
        this.__headers__ = {};
        if (this.app.get("x-powered-by")) this.__headers__["x-powered-by"] = "Express";
        this.__headers__["x-content-type-options"] = "nosniff";
        this.__headersSent__ = false;
    }
    setDefaultEncoding(encoding: string) {
        this.__defaultEncoding = encoding;
    }
    private stringify(o: any) : string {return JSON.stringify(o, this.app.get("json replacer"), this.app.get("json spaces"));}
    json(o: any) {
        this.set("content-type", "application/json; charset=utf-8");
        this.end(this.stringify(o));
    }
    jsonp(o: any) {
        let cbQueryKey: string = this.app.get("jsonp callback name");
        if (cbQueryKey && this.req.query && this.req.query[cbQueryKey]) {
            let callback = this.req.query[cbQueryKey];
            let s = "/**/ typeof " + callback + " === 'function' && " + callback + "(" + this.stringify(o) + ");";
            this.set("content-type", "text/javascript; charset=utf-8");
            this.end(s);
        } else
            this.json(o);
    }
    write(data: string | Buffer, encoding?: string) {
        let s: string = "";
        if (typeof data === "string")
            s = data;
        else
            s = data.toString(encoding ? encoding : this.__defaultEncoding);
        this.__body__ += s;
    }
    send(data?: string | Buffer | Array<any> | any) {
        if (data) {
            if (typeof data === "string" || data.constructor === Buffer)
                this.write(data);
            else
                this.write(this.stringify(data));
        }
    }
    end(data?: string | Buffer, encoding?: string) {
        if (data) this.write(data, encoding);
        this.emit("__on_final__");
    }
    status(code: number): EmulatedResponse {
        this.statusCode = code;
        return this;
    }
    get headersSent(): boolean {return this.__headersSent__;}
    getHeader(name: string): string {return this.__headers__[name.toLowerCase()];}
    removeHeader(name: string) {delete this.__headers__[name.toLowerCase()];}
    setHeader(name: string, value: string) {this.__headers__[name.toLowerCase()] = value;}
    get(name: string) : string {return this.getHeader(name);}
    set(field: string| {[key: string]: string}, value?: string) {
        if (typeof field === "string")
            this.setHeader(field, value);
        else {
            let headers = field;
            for (let key in headers)
                this.setHeader(key, headers[key]);
        }
    }
    writeHead(statusCode: number, statusMessage?: string | {[key: string]: string}, headers?: {[key: string]: string}) {
        this.statusCode = statusCode;
        if (statusMessage) {
            if (typeof statusMessage === "string") {
                this.statusMessage = statusMessage;
                if (headers) this.set(headers);
            } else {    // statusMessage is actually headers
                let hdrs = statusMessage;
                this.set(hdrs);
            }
        }
    }
    sendStatus(statusCode: number) {
        let s = (http.STATUS_CODES[statusCode] ? http.STATUS_CODES[statusCode] : statusCode.toString());
        this.status(statusCode).send(s);
    }
    __emitFinalEvents() {
        this.emit("close");
        this.emit("finish");
    }
}

// returns true it HTTP returns a "good" status code, false otherwise
// the logic comes from jquery
function goodHTTPStatusCode(statusCode: number) : boolean {
    return ((statusCode >= 200 && statusCode < 300) || (statusCode === 304)); 
}

export class ExpressJSONApiRoutingEmulation {
    constructor(private router: express.Router, private appParams?:{[key: string]: any}) { }
    route(options: JSONApiRequestOptions, context?: any) : Promise<RESTReturn> {
        return new Promise<RESTReturn>((resolve: (value: RESTReturn) => void, reject: (err: any) => void) => {
            // constuct an emulated Application object
            ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
            let app = new EmulatedApplication();
            if (this.appParams) {
                for (let key in this.appParams)
                    app.set(key, this.appParams[key]);
            }
            ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

            // constuct an emulated Request object
            ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
            let parsed = url.parse(options.path, true);
            let req = new EmulatedRequest(app);
            req.method = options.method;
            req.headers =  (options.headers ? options.headers : {});
            if (options.body) {
                let content = {
                    "content-type": "application/json; charset=utf-8"
                    ,"content-length": Buffer.from(JSON.stringify(options.body), "utf-8").byteLength.toString()
                }
                req.headers = _.assignIn({}, req.headers, content);
            }
            req.query = parsed.query;
            req.url =  options.path;
            req.body = (options.body ? options.body : null);
            req.path = parsed.pathname;
            req.hostname = "";
            if (context) req.context = context;
            ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

            // constuct an emulated Response object
            ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
            let res = new EmulatedResponse(app, req);

            let finalHandler = () => {
                req.__emitFinalEvents();
                res.__emitFinalEvents();
                
                if (res.finished) {
                    let body:any = res.__body__;
                    try {body = JSON.parse(body ? body : "");} catch(e) {}
                    if (goodHTTPStatusCode(res.statusCode))
                        resolve({
                            status: res.statusCode
                            ,statusText: res.statusMessage
                            ,headers: res.__headers__
                            ,data: body
                        });
                    else
                        reject(body);
                } else
                    reject({error: "not-found", error_description: "Cannot " + req.method.toUpperCase() + " " + options.path});
            };
            res.on("__on_final__", () => {
                // set the status message
                if (!res.statusMessage) res.statusMessage = http.STATUS_CODES[res.statusCode];
                // set the "Content-Length" header field
                if (res.__body__) res.__headers__["content-length"] = Buffer.from(res.__body__, res.__defaultEncoding).byteLength.toString();
                // set the "ETag" header field if it not already set
                ///////////////////////////////////////////////////////////////////////////////////////////////////////////
                if (!res.__headers__["etag"] && res.__body__) {  // etag not set yet
                    let etagFlag = app.get("etag");
                    let tag: string = null;
                    if (typeof etagFlag === "boolean") {
                        if (etagFlag) tag = etag(res.__body__, {weak: true});
                    } else if (typeof etagFlag === "string") {
                        if (etagFlag.toLowerCase() === "weak")
                            tag = etag(res.__body__, {weak: true});
                        else if (etagFlag.toLowerCase() === "strong")
                            tag = etag(res.__body__, {weak: false});
                    } else if (typeof etagFlag === "function") {
                        let generator: (body: Buffer, encoding?: string) => string = etagFlag;
                        tag = generator(Buffer.from(res.__body__, res.__defaultEncoding), res.__defaultEncoding);
                    }
                    if (tag) res.__headers__["etag"] = tag;
                }
                ///////////////////////////////////////////////////////////////////////////////////////////////////////////
                // set the "Date" header field
                if (res.sendDate) res.__headers__["date"] = new Date().toUTCString();

                res.__headersSent__ = true; // mark headers sent
                res.finished = true;    // mark response finished
                finalHandler();
            });
            ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

            this.router(<any>req, <any>res, finalHandler);    // route it           
        });
    }
}