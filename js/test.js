"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var emul = require("./");
var express = require("express");
var g = {
    type: "good"
};
var router = express.Router();
router.use(function (req, res, next) {
    res.on("close", function () {
        console.log("<<res.close>>");
    }).on("finish", function () {
        console.log("<<res.finish>>");
    });
    req.on("close", function () {
        console.log("<<req.close>>");
    });
    next();
});
var servicesRouter = express.Router();
servicesRouter.post("/user/:userId/activate", function (req, res) {
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
    var body = req.body;
    res.json({ message: body.msg });
    //res.end(JSON.stringify({message: body.msg}));
});
router.use("/services", servicesRouter);
var routingEmulation = new emul.ExpressJSONApiRoutingEmulation(router, { "global": g });
var options = {
    method: "POST",
    path: "/services/user/xxxyyyzzz/activate?x=5&y=7"
    //,path: "/services/twit?x=5&y=7"
    ,
    body: { msg: "hawdy" }
};
routingEmulation.route(options)
    .then(function (ret) {
    console.log("ret=\n" + JSON.stringify(ret, null, 2));
}).catch(function (err) {
    console.error("!!! Error:\n" + JSON.stringify(err, null, 2));
});
//# sourceMappingURL=test.js.map