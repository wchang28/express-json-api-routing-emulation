import * as express from 'express';
import * as events from "events";
import * as http from "http";
import * as url from "url";
import * as _ from "lodash";
import {RESTReturn} from "rest-api-interfaces";
export {RESTReturn} from "rest-api-interfaces";

export interface JSONApiRequestOptions {
    method: string;
    path: string;
    headers?: {[key: string]: string}
    body?: any;
};

class EmulatedApp {
    private _m: {[key: string]: any}
    constructor() {
        this._m = {};
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
    constructor(public app: EmulatedApp) {
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
    public statusCode: number;
    public statusMessage: string;
    public __headers__: {[key: string]: string};
    public __headersSent__: boolean;
    constructor(public app: EmulatedApp) {
        super();
        this.finished = false;
        this.__defaultEncoding = "utf8";
        this.__body__ = "";
        this.statusCode = 200;
        this.__headers__ = {};
        this.__headersSent__ = false;
    }
    setDefaultEncoding(encoding: string) {
        this.__defaultEncoding = encoding;
    }
    json(o: any) {
        this.set("content-type", "application/json; charset=utf-8");
        this.end(JSON.stringify(o));
    }
    jsonp(o: any) {this.json(o);}
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
                this.write(JSON.stringify(data));
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
    route(options: JSONApiRequestOptions) : Promise<RESTReturn> {
        return new Promise<RESTReturn>((resolve: (value: RESTReturn) => void, reject: (err: any) => void) => {
            // constuct an emulated Application object
            //////////////////////////////////////////////////////////////////////////
            let app = new EmulatedApp();
            if (this.appParams) {
                for (let key in this.appParams)
                    app.set(key, this.appParams[key]);
            }
            //////////////////////////////////////////////////////////////////////////

            // constuct an emulated Request object
            //////////////////////////////////////////////////////////////////////////
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
            //////////////////////////////////////////////////////////////////////////

            // constuct an emulated Response object
            //////////////////////////////////////////////////////////////////////////
            let res = new EmulatedResponse(app);

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
                res.__headersSent__ = true; // mark headers sent
                res.finished = true;    // mark response finished
                if (!res.statusMessage) res.statusMessage = http.STATUS_CODES[res.statusCode];  // set the status message
                // set the content-length header
                if (res.__body__) res.__headers__["content-length"] = Buffer.from(res.__body__, res.__defaultEncoding).byteLength.toString();
                finalHandler();
            });
            //////////////////////////////////////////////////////////////////////////

            this.router(<any>req, <any>res, finalHandler);    // route it           
        });
    }
}