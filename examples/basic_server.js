#!/usr/bin/env node
// @ts-check
import GuacamoleLite from "@spaceness/guacamole-lite";

const websocketOptions = {
	port: 8080, // we will accept connections to this port
};

const guacdOptions = {
	port: 4822, // port of guacd
	host: "localhost", // host of guacd
};
/** @type {import("@spaceness/guacamole-lite").ClientOptions} */
const clientOptions = {
	crypt: {
		cypher: "aes-256-ccm",
		key: "MySuperSecretKeyForParamsToken12",
	},
};

const guacServer = new GuacamoleLite(websocketOptions, guacdOptions, clientOptions);
