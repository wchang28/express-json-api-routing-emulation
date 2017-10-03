/// <reference types="express" />
import * as express from 'express';
import { RESTReturn, HTTPMethod } from "rest-api-interfaces";
export { RESTReturn, HTTPMethod } from "rest-api-interfaces";
export interface JSONApiRequestOptions {
    method: HTTPMethod;
    path: string;
    headers?: {
        [key: string]: string;
    };
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
