import * as emul from "./";
import * as express from "express";
import * as core from 'express-serve-static-core';

let g = {
    type: "good"
};

let router = express.Router();

router.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.on("close", () => {
        console.log("<<res.close>>");
    }).on("finish", () => {
        console.log("<<res.finish>>");
    });
    req.on("close", () => {
        console.log("<<req.close>>");
    });
    next();
});

let servicesRouter = express.Router();

servicesRouter.post("/user/:userId/activate", (req: express.Request, res: express.Response) => {
    console.log("");
    console.log("global=\n" + JSON.stringify(req.app.get("global"), null, 2));
    console.log("qyery=\n" + JSON.stringify(req.query, null, 2));
    console.log("url=" + req.url);
    console.log("baseUrl=" + req.baseUrl);
    console.log("originalUrl=" + req.originalUrl);
    console.log("path=" + req.path);
    console.log("headers=\n" + JSON.stringify(req.headers, null, 2));
    console.log("params=\n" + JSON.stringify(req.params, null, 2));
    console.log("");
    let body = req.body;
    res.json({message: body.msg});
    //res.end(JSON.stringify({message: body.msg}));
});

router.use("/services", servicesRouter);

let routingEmulation = new emul.ExpressJSONApiRoutingEmulation(router, {"global": g});

let options: emul.JSONApiRequestOptions = {
    method: "POST"
    ,path: "/services/user/xxxyyyzzz/activate?x=5&y=7"
    //,path: "/services/twit?x=5&y=7"
    ,body: {msg: "hawdy"}
}

routingEmulation.route(options)
.then((ret: emul.RESTReturn) => {
    console.log("ret=\n" + JSON.stringify(ret, null, 2));
}).catch((err: any) => {
    console.error("!!! Error:\n" + JSON.stringify(err, null, 2));
})