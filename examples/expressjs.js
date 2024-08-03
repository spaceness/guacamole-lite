#!/usr/bin/env node

import http from "node:http";
import GuacamoleLite from "@spaceness/guacamole-lite";
import express from "express";

const app = express();

const server = http.createServer(app);

const guacdOptions = {
	port: 4822, // port of guacd
};

const clientOptions = {
	crypt: {
		cypher: "AES-256-CBC",
		key: "MySuperSecretKeyForParamsToken12",
	},
};

const guacServer = new GuacamoleLite({ server }, guacdOptions, clientOptions);

server.listen(8080);
