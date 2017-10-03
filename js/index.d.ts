/// <reference types="express" />
import * as express from 'express';
import { RESTReturn, HTTPMethod, HTTPHeaders } from "rest-api-interfaces";
export { RESTReturn, HTTPMethod, HTTPHeaders } from "rest-api-interfaces";
export interface JSONApiRequestOptions {
    method: HTTPMethod;
    path: string;
    headers?: HTTPHeaders;
    body?: any;
}
export declare class ExpressJSONApiRoutingEmulation {
    private router;
    private appParams;
    constructor(router: express.Router, appParams?: {
        [key: string]: any;
    });
    route(options: JSONApiRequestOptions, context?: any): Promise<RESTReturn>;
}
